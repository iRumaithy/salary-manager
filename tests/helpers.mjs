import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as Finance from '../public/finance-core-v3.10.0.js';
export function loadApp(now = '2026-10-24T08:00:00+04:00') {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const block = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(x => x[1]).find(x => x.includes('var APP_VERSION'));
  const start = block.indexOf('(function () {') + '(function () {'.length;
  const end = block.indexOf('      var lastCalendarDaySeen');
  class Clock extends Date {constructor(...args) {super(...(args.length ? args : [now]));} static now() {return new Date(now).getTime();}}
  const storage = new Map(), nodes = new Map();
  const node = key => {
    if (!nodes.has(key)) nodes.set(key, {value:'', innerHTML:'', textContent:'', disabled:false, open:false, hidden:false,
      classList:{add(){},remove(){},toggle(){}}, style:{setProperty(){}}, setAttribute(){}, querySelectorAll(){return [];},
      showModal(){this.open = true;}, close(){this.open = false;}, reset(){}, focus(){}, select(){}, addEventListener(){}});
    return nodes.get(key);
  };
  const document = {querySelector:node,querySelectorAll(){return [];},getElementById:id=>node('#'+id),documentElement:{lang:'ar'},body:{}};
  const context = vm.createContext({Finance, Date:Clock, Intl, structuredClone, console, Math, JSON, Number, String, Boolean,
    URL, URLSearchParams, Set, Map, Request, Response, Headers, crypto:globalThis.crypto,
    localStorage:{getItem:k=>storage.get(k) ?? null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    window:{SALARY_API_BASE:'',confirm:()=>true,addEventListener(){}},document,navigator:{onLine:true},location:{href:'https://test.local/'},
    setTimeout(){return 0;},clearTimeout(){},setInterval(){return 0;},clearInterval(){},
    FormData:class {constructor(form) {this.values=form.values || {};} get(k){return this.values[k] ?? null;}}
  });
  vm.runInContext(block.slice(start,end), context);
  vm.runInContext('render = function() {saveState();}; showToast = function() {};',context);
  context.node = node;
  context.storage = storage;
  return context;
}

export function loadWorker() {
  let source = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
  source = source.replace(/^import .*;\n/gm,'').replace('export class SalaryStore','class SalaryStore').replace('export default {','globalThis.worker = {');
  const context = vm.createContext({Finance,DurableObject:class{},buildPushPayload:()=>{},console,
    crypto:globalThis.crypto,Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,structuredClone,
    btoa,atob,Date,Uint8Array,ArrayBuffer,setTimeout,clearTimeout});
  vm.runInContext(source + '\nglobalThis.SalaryStore=SalaryStore;', context);
  const data = new Map(); let tail = Promise.resolve();
  const ctx = {
    storage:{async get(key) {return structuredClone(data.get(key));},async put(key,value){data.set(key,structuredClone(value));},async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])data.delete(key);},async list({prefix='',reverse=false,limit=100}={}){let pairs=[...data].filter(([k])=>k.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b));if(reverse)pairs.reverse();return new Map(pairs.slice(0,limit));}},
    getWebSockets(){return [];},blockConcurrencyWhile(fn) {const result=tail.then(fn);tail=result.catch(()=>{});return result;}
  };
  const store = new context.SalaryStore(ctx,{});
  return {context,store,data};
}
