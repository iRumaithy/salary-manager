import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../public/finance-core-v3.10.0.js';
import {loadApp} from './helpers.mjs';
function ready(balance=500,savings=0) {
  const app = loadApp();
  app.state.walletBalance=balance;app.state.savingsBalance=savings;app.state.cashLedger=null;
  F.ensureLedger(app.state);
  app.state.salary=10000;app.state.salaryPayDay=24;app.state.walletStarted=true;
  app.state.monthOpeningBalances['2026-10']=balance;app.state.walletMonthOpeningBalance=balance;
  app.state.commitments=[{id:'loan',name:'Loan',amount:1000,startDate:'2026-01-01',endDate:'2027-01-01',paidMonths:[]}];
  return app;
}
test('integer fils include signed half-cent rounding',()=>{
  assert.equal(F.cents(1.005),101); assert.equal(F.cents(-1.005),-101);
  assert.equal(F.cents(.1+.2),30); assert.equal(F.cents(Infinity),0);
});
test('legacy migration preserves balance instead of guessing from stale receipts',()=>{
  const app=ready(450); delete app.state.cashLedger;
  app.state.transactions=[{id:'s',amount:1000,type:'salary',balanceAfter:1000}];
  app.normalizeSavedState(structuredClone(app.state));
  assert.equal(app.state.walletBalance,450); assert.equal(F.balances(app.state).cash,450);
});
test('payday keeps remainder, then adds salary and deducts active loans once',()=>{
  const app=ready(); assert.equal(app.processPayday('keep'),true);
  assert.equal(app.state.walletBalance,9500); assert.equal(app.processPayday('keep'),false);
  assert.deepEqual(Array.from(app.state.transactions,tx=>tx.type),['salary','commitment']);
  assert.equal(F.balances(app.state).cash,9500);
});
test('payday transfers remainder before salary and loans',()=>{
  const app=ready(500,200); assert.equal(app.processPayday('savings'),true);
  assert.equal(app.state.walletBalance,9000);assert.equal(app.state.savingsBalance,700);
  assert.deepEqual(Array.from(app.state.transactions,tx=>tx.type),['savings_transfer','salary','commitment']);
  assert.equal(F.balances(app.state).savings,700);
});
test('zero and negative remainder wait for explicit choice and are never saved as negative savings',()=>{
  for (const balance of [0,-250]) {const app=ready(balance);app.maybeShowPaydayPrompt();assert.equal(app.state.transactions.length,0);assert.equal(app.node('#paydayCarryDialog').open,true);app.processPayday('savings');assert.equal(app.state.walletBalance,balance+9000);assert.equal(app.state.savingsBalance,0);}
});
test('salary cannot be processed early or with unspecified choice',()=>{
  const app=ready();app.state.salaryPayDay=25;assert.equal(app.processPayday('keep'),false);
  app.state.salaryPayDay=24;assert.equal(app.processPayday('invalid'),false);
});
test('the reported AED 50 salary difference survives save and reload',()=>{
  const app=ready();app.processPayday('keep');
  const adjusted=app.adjustAppliedSalaryCredit(10050,24,false);
  assert.equal(adjusted.delta,50);app.saveState();assert.equal(app.state.walletBalance,9550);
  app.normalizeSavedState(structuredClone(app.state));assert.equal(app.state.walletBalance,9550);
});
test('editing a transaction before the salary receipt is not undone by audit',()=>{
  const app=ready();
  app.state.walletBalance-=100;app.addTransaction('expense',-100,'Before salary','2026-10-23','expense');
  app.processPayday('keep');app.state.transactions.find(tx=>tx.refId==='expense').amount=-150;app.state.walletBalance-=50;
  app.saveState();assert.equal(app.state.walletBalance,9350);
});
test('payday rollback preserves subsequent spending and returns savings',()=>{
  const app=ready();app.processPayday('savings');app.state.walletBalance-=50;app.addTransaction('expense',-50,'Coffee','2026-10-24','e');
  app.rollbackProcessedPayday('2026-10-24');app.saveState();
  assert.equal(app.state.walletBalance,450);assert.equal(app.state.savingsBalance,0);assert.equal(app.state.transactions.length,1);
});
test('recurring reversal uses actual paid amount after schedule is edited',()=>{
  const app=ready();app.state.recurringPayments=[{id:'bill',type:'فاتورة',name:'Bill',amount:100,startDate:'2026-01-01',paidMonths:[],paidCycleKeys:[]}];
  app.toggleRecurringPaid('bill');assert.equal(app.state.walletBalance,400);
  app.state.recurringPayments[0].amount=150;app.toggleRecurringPaid('bill');assert.equal(app.state.walletBalance,500);
});
test('removing a recurring schedule keeps actual payments and bank balance',()=>{
  const app=ready();app.state.recurringPayments=[{id:'bill',name:'Bill',amount:100,type:'فاتورة',startDate:'2026-01-01',paidMonths:[],paidCycleKeys:[]}];
  app.toggleRecurringPaid('bill');app.deleteRecurring('bill');assert.equal(app.state.walletBalance,400);assert.equal(app.state.transactions.length,1);
});
test('monthly savings exclude lifetime balance and include manual transfers',()=>{
  const app=ready(500,5000);app.state.walletBalance-=100;app.state.savingsBalance+=100;app.addTransaction('savings_manual',-100,'Savings','2026-10-24','',{savingsDelta:100});
  const metrics=app.getMetrics();assert.equal(metrics.savingsMoved,100);assert.equal(metrics.savingsTotal,5100);
});
test('salary not received is not invented as available income',()=>{
  const app=ready(0);app.state.commitments=[];assert.equal(app.getMetrics().availableBase,0);
});
test('spending limit reserves unpaid bills without subtracting them from cash',()=>{
  const app=ready(5000);app.processPayday('keep');app.state.recurringPayments=[{id:'b',name:'Bill',amount:1000,startDate:'2026-01-01',type:'فاتورة'}];
  const metrics=app.getMetrics();assert.equal(metrics.balance,14000);assert.equal(metrics.reserved,1000);assert.equal(metrics.spendable,13000);
});
test('daily chart closes at ledger cash and includes negative balance',()=>{
  const state={walletMonthOpeningBalance:10,transactions:[{date:'2026-10-01',amount:-20},{date:'2026-10-02',amount:5}]};
  const rows=F.dailyBalances(state,'2026-10',2);assert.equal(rows[0].balance,-10);assert.equal(rows[1].balance,-5);
});
test('independent devices keep both manual transactions and exact cash',()=>{
  const base={walletBalance:500,savingsBalance:0,transactions:[],cashLedger:{version:1,baseCents:50000,savingsBaseCents:0},expenses:[]};
  const local=structuredClone(base),remote=structuredClone(base);
  local.expenses.push({id:'a',amount:50});local.transactions.push({id:'a-tx',amount:-50});local.walletBalance=450;
  remote.expenses.push({id:'b',amount:70});remote.transactions.push({id:'b-tx',amount:-70});remote.walletBalance=430;
  const result=F.mergeStates(base,local,remote);assert.equal(result.conflicts.length,0);assert.equal(result.state.walletBalance,380);assert.equal(result.state.expenses.length,2);
});
test('same transaction edited differently produces reviewable conflict',()=>{
  const base={walletBalance:450,savingsBalance:0,transactions:[{id:'a',amount:-50}],cashLedger:{version:1,baseCents:50000,savingsBaseCents:0}};
  const local=structuredClone(base),remote=structuredClone(base);local.transactions[0].amount=-60;remote.transactions[0].amount=-70;
  const r=F.mergeStates(base,local,remote);assert.equal(r.conflicts.length,1);assert.equal(r.state.walletBalance,430);
  assert.equal(F.mergeStates(base,local,remote,'local').state.walletBalance,440);
});
test('concurrent identical payroll has one salary and one loan deduction',()=>{
  const app=ready();const base=structuredClone(app.state);app.processPayday('keep');const local=structuredClone(app.state),remote=structuredClone(local);
  remote.transactions.forEach(tx=>{tx.id+='other';tx.createdAt='2026-10-24T04:00:00Z';});
  remote.processedPaydays['2026-10-24'].processedAt='2026-10-24T04:00:00Z';
  const merged=F.mergeStates(base,local,remote);assert.equal(merged.state.transactions.length,2);assert.equal(merged.state.walletBalance,9500);assert.equal(merged.conflicts.length,0);
});
test('conflicting payroll choices keep the selected whole payroll bundle',()=>{
  const app=ready();const base=structuredClone(app.state);
  app.processPayday('savings');const local=structuredClone(app.state);
  app.normalizeSavedState(structuredClone(base));app.processPayday('keep');const remote=structuredClone(app.state);
  const kept=F.mergeStates(base,local,remote,'remote');assert(kept.conflicts.length>0);assert.equal(kept.state.walletBalance,9500);assert.equal(kept.state.savingsBalance,0);
  const saved=F.mergeStates(base,local,remote,'local');assert.equal(saved.state.walletBalance,9000);assert.equal(saved.state.savingsBalance,500);
});
test('salary dates clamp to month length including leap years',()=>{
  const app=ready();assert.equal(app.salaryDateFor(2026,1,31).getDate(),28);assert.equal(app.salaryDateFor(2028,1,31).getDate(),29);
});
test('repeated renders with no data change do not queue duplicate cloud writes',()=>{
  const app=ready();app.authState={authenticated:true,sessionVerified:true,token:'test',user:{accountId:'fixture'}};
  app.saveState();const seq=app.localChangeSeq;app.saveState();app.saveState();assert.equal(app.localChangeSeq,seq);
});
test('bank comparison records a difference without altering cash',()=>{
  const app=ready();app.node('#bankCheckInput').value='450';app.submitBankCheck({preventDefault(){}});
  assert.equal(app.state.walletBalance,500);assert.equal(app.state.bankChecks[0].difference,-50);
});
test('switching accounts never imports the previous account financial state',()=>{
  const app=ready(1234);app.stateAccountId='alice';app.authState.user={accountId:'alice'};
  app.updateAccountUI=()=>{};app.refreshAppLockSettings=()=>{};app.stopLiveSync=()=>{};
  app.rememberAuth({token:'fixture',user:{id:'bob',accountId:'bob',role:'user'}});
  assert.equal(app.state.walletBalance,0);assert.equal(app.state.expenses.length,0);assert.equal(app.stateAccountId,'bob');
});
test('switching to an existing account restores only its own local state',()=>{
  const app=ready(1234);app.stateAccountId='alice';app.authState.user={accountId:'alice'};
  const own=structuredClone(app.state);own.walletBalance=777;own.cashLedger={version:1,baseCents:77700,savingsBaseCents:0};
  app.localStorage.setItem('monthlySalaryManager.account.bob',JSON.stringify(own));
  app.updateAccountUI=()=>{};app.refreshAppLockSettings=()=>{};app.stopLiveSync=()=>{};
  app.rememberAuth({token:'fixture',user:{id:'bob',accountId:'bob',role:'user'}});
  assert.equal(app.state.walletBalance,777);
});
