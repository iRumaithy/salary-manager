import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorker} from './helpers.mjs';
const seed=()=>({walletLedgerVersion:1,currentCalendarMonth:'2026-10',walletBalance:500,savingsBalance:0,transactions:[],commitments:[],recurringPayments:[],expenses:[],deposits:[],cashLedger:{version:1,baseCents:50000,savingsBaseCents:0}});
const put=(store,state,rev)=>store.fetch(new Request('https://account/data/put',{method:'POST',body:JSON.stringify({state,baseRevision:rev})}));
test('stale save is rejected without losing manual bank transactions',async()=>{
  const {store,data}=loadWorker();data.set('state',seed());data.set('revision',2);
  const stale=seed();stale.walletBalance=450;stale.transactions.push({id:'e',amount:-50});
  const response=await put(store,stale,1);assert.equal(response.status,409);const body=await response.json();assert.equal(body.error,'STATE_CONFLICT');assert.equal(body.state.walletBalance,500);assert.equal(data.get('revision'),2);
});
test('concurrent writes from same revision serialize and one receives conflict',async()=>{
  const {store,data}=loadWorker();data.set('state',seed());data.set('revision',1);
  const a=seed(),b=seed();a.transactions.push({id:'a',amount:-50});b.transactions.push({id:'b',amount:-70});
  const responses=await Promise.all([put(store,a,1),put(store,b,1)]);assert.deepEqual(responses.map(x=>x.status).sort(),[200,409]);assert.equal(data.get('revision'),2);
});
test('server verifies cash from the shared integer-fils ledger',async()=>{
  const {store,data}=loadWorker();data.set('state',seed());data.set('revision',1);
  const next=seed();next.transactions.push({id:'a',amount:-50});next.walletBalance=999;
  const response=await put(store,next,1);assert.equal(response.status,200);assert.equal(data.get('state').walletBalance,450);assert.equal((await response.json()).balanceRecomputed,true);
});
test('legacy account migration does not rewrite existing bank balance',async()=>{
  const {store,data}=loadWorker();const state=seed();delete state.cashLedger;state.walletBalance=450;state.transactions.push({id:'a',amount:1000,balanceAfter:1000});
  data.set('state',state);data.set('revision',1);const response=await put(store,state,1);assert.equal(response.status,200);assert.equal(data.get('state').walletBalance,450);
});
test('state validation rejects malformed account writes',async()=>{
  const {store}=loadWorker();assert.equal((await put(store,{walletBalance:1},0)).status,400);
});
function apiFixture(role='user') {
  const worker=loadWorker().context.worker,alice=loadWorker(),bob=loadWorker();
  alice.data.set('state',seed());bob.data.set('state',{...seed(),walletBalance:999});
  const env={SALARY_STORE:{idFromName:name=>name,get:id=>{
    if(id.startsWith('account:')) {const account=id==='account:alice'?alice:bob;return {fetch:input=>account.store.fetch(typeof input==='string'?new Request(input):input)};}
    return {fetch:async request=>{const data=await request.json();return new Response(JSON.stringify(data.token==='fixture'?{ok:true,user:{id:'alice',accountId:'alice',role}}:{ok:false}),{status:200});}};
  }}};
  return {worker,env,alice,bob};
}
test('regular users cannot list users or publish a release',async()=>{
  const {worker,env}=apiFixture();
  for(const [path,method] of [['users','GET'],['publish-update','POST']]) {
    const response=await worker.fetch(new Request('https://salary.test/api/admin/'+path,{method,headers:{authorization:'Bearer fixture'}}),env,{});
    assert.equal(response.status,403);
  }
});
test('unverified visitors cannot read salary data',async()=>{
  const {worker,env}=apiFixture();const response=await worker.fetch(new Request('https://salary.test/api/data'),env,{});assert.equal(response.status,401);
});
test('account selection comes from verified session and ignores a forged query',async()=>{
  const {worker,env}=apiFixture();const response=await worker.fetch(new Request('https://salary.test/api/data?accountId=bob',{headers:{authorization:'Bearer fixture'}}),env,{});
  assert.equal(response.status,200);assert.equal((await response.json()).state.walletBalance,500);
});
test('owner publication must pass Madar approval rather than the old direct endpoint',async()=>{
  const {worker,env}=apiFixture('super_admin');const response=await worker.fetch(new Request('https://salary.test/api/admin/publish-update',{method:'POST',headers:{authorization:'Bearer fixture'}}),env,{});
  assert.equal(response.status,409);assert.equal((await response.json()).error,'USE_MADAR_APPROVAL');
});
const dateKey=()=>{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part=type=>parts.find(x=>x.type===type).value;return part('year')+'-'+part('month')+'-'+part('day');
};
test('automatic bank imports deduct one time even on retry',async()=>{
  const {store,data}=loadWorker(),state=seed(),date=dateKey();state.currentCalendarMonth=date.slice(0,7);data.set('state',state);data.set('revision',1);
  const item={id:'bank-fixture',kind:'expense',amount:50,merchant:'Grocery',source:'wallet',safeToAutoApprove:true,localDate:date,occurredAt:new Date().toISOString()};
  const apply=()=>store.fetch(new Request('https://account/data/automation-apply',{method:'POST',body:JSON.stringify({import:item})}));
  assert.equal((await apply()).status,200);assert.equal(data.get('state').walletBalance,450);
  assert.equal((await (await apply()).json()).duplicate,true);assert.equal(data.get('state').walletBalance,450);
});
test('bank salary confirmation applies only the AED 50 difference',async()=>{
  const {store,data}=loadWorker(),state=seed(),date=dateKey();state.currentCalendarMonth=date.slice(0,7);
  state.walletBalance=10000;state.cashLedger.baseCents=0;state.transactions=[{id:'salary',type:'salary',amount:10000,date,month:date.slice(0,7),balanceAfter:10000}];
  data.set('state',state);data.set('revision',1);
  const item={id:'salary-bank-fixture',kind:'deposit',amount:10050,merchant:'Salary',rawText:'Salary transfer',source:'bank_message',safeToAutoApprove:true,localDate:date,occurredAt:new Date().toISOString()};
  const response=await store.fetch(new Request('https://account/data/automation-apply',{method:'POST',body:JSON.stringify({import:item})}));
  assert.equal(response.status,200);assert.equal((await response.json()).delta,50);assert.equal(data.get('state').walletBalance,10050);
});
