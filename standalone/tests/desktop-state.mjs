import assert from 'node:assert/strict';
import {createStore,validMarket,validBuild,validHistoryStore} from '../desktop/state.mjs';
import HunterHistory from '../market-history.js';
const s={schemaVersion:1,sourceVersion:8,importedAt:'2026-01-01T00:00:00Z',warnings:[],realms:[{name:'test',items:[{sourceKey:'6469',itemId:6469,unitPriceCopper:777,observedDay:2000,history:[{day:2000,low:777,high:777,available:3}]}]}]};
const initial={snapshot:s,realm:'test',bundledScan:'a'.repeat(64)};
let checks=0;const check=(name,fn)=>{fn();checks++;};
check('allowlist valid',()=>assert(validMarket(initial)));
check('forbid raw data',()=>assert(!validMarket({...initial,lua:'private'})));
check('reject invalid build',()=>assert(!validBuild('bad')));
check('reject non-object build',()=>assert(!validBuild('123')&&!validBuild('[1]')&&!validBuild('"x"')));
check('accept build with unknown keys (forward-compat)',()=>assert(validBuild('{"lvl":12,"futureField":{"x":1}}')));
check('allow clear marker',()=>assert(validMarket({bundledScan:'a'.repeat(64)})));
function fixture(){
  const files=new Map(),storage=new Map();let failWrite=false,corrupt=false,failPointer=false,failHPointer=false;
  return {files,storage,fail:(w=false,c=false,p=false,hp=false)=>{failWrite=w;corrupt=c;failPointer=p;failHPointer=hp;},ctx:{
    storage:{get:async k=>structuredClone(storage.get(k)??null),set:async(k,v)=>{if((k==='market-pointer'&&failPointer)||(k==='price-history-pointer'&&failHPointer))throw new Error('fixture pointer failure');storage.set(k,structuredClone(v));}},
    files:{writeText:async(_root,k,v)=>{if(failWrite)return {ok:false};files.set(k,v);return {ok:true};},readText:async(_root,k)=>files.has(k)?{ok:true,text:corrupt?'bad':files.get(k)}:{ok:false}}
  }};
}
const f=fixture();let store=createStore(f.ctx);
assert.deepEqual((await store.read()).market,{});checks++;
await store.market({revision:0,values:initial});assert.equal((await store.read()).market.snapshot.realms[0].items[0].unitPriceCopper,777);checks++;
store=createStore(f.ctx);assert.deepEqual((await store.read()).market,initial);checks++;
for(const mode of ['write','read','pointer']){
  f.fail(mode==='write',mode==='read',mode==='pointer');
  const newer=structuredClone(initial);newer.snapshot.realms[0].items[0].unitPriceCopper=888;
  await assert.rejects(store.market({revision:1,values:newer}));checks++;
  f.fail();store=createStore(f.ctx);assert.deepEqual((await store.read()).market,initial);checks++;
}
await assert.rejects(store.market({revision:0,values:initial}),/otra vista/);checks++;
const a=store.market({revision:1,values:initial}),b=store.market({revision:1,values:initial});await a;await assert.rejects(b,/otra vista/);checks++;
await store.market({revision:2,values:{bundledScan:'a'.repeat(64)}});
store=createStore(f.ctx);assert.deepEqual((await store.read()).market,{bundledScan:'a'.repeat(64)});checks++;
// A poisoned store (unconfirmed pointer write) blocks reads until Reabrir
// resets it; the reset must not lose the last confirmed durable state.
f.fail(false,false,true);
await assert.rejects(store.market({revision:3,values:initial}),/pointer failure|No se confirmó/);checks++;
await assert.rejects(store.read(),/Reabrir/);checks++;
await store.reset();
store=createStore(f.ctx);assert.deepEqual((await store.read()).market,{bundledScan:'a'.repeat(64)});checks++;
await store.build('{"lvl":22}');store=createStore(f.ctx);assert.equal((await store.read()).build,'{"lvl":22}');checks++;
assert.equal(f.files.size,2);checks++;

/* ------------------------------------------------------- price history */
const hstore={v:1,realms:{test:{items:{'6469':[[2000,777,777,3],[2001,700],[2002,650,700,2]]}}}};
check('history store validator parity with market-history.js',()=>{
  assert(validHistoryStore(hstore));
  assert(HunterHistory.validStore(hstore));
  for(const bad of [null,{v:2,realms:{}},{v:1,realms:{R:{items:{k:[[1,0]]}}}},{v:1,realms:{R:{items:{k:[[5,1],[3,2]]}}}}]){
    assert(!validHistoryStore(bad));assert(!HunterHistory.validStore(bad));
  }
});
store=createStore(f.ctx);
await store.history({revision:0,store:hstore});
let hr=(await store.read()).history;
assert.deepEqual(hr.store,hstore);assert.equal(hr.revision,1);checks++;
store=createStore(f.ctx);hr=(await store.read()).history;assert.deepEqual(hr.store,hstore);checks++;
await assert.rejects(store.history({revision:0,store:hstore}),/otra vista/);checks++;
await assert.rejects(store.history({revision:1,store:{v:9,realms:{}}}),/Historial inválido/);checks++;
const hstore2={v:1,realms:{test:{items:{'6469':[[2000,777,777,3],[2001,700],[2002,650,700,2],[2003,600]]}}}};
await store.history({revision:1,store:hstore2});
assert.equal([...f.files.keys()].filter(k=>k.startsWith('price-history-')).length,2);checks++;
// Corrupt the file the pointer references: degrades to empty (rebuildable),
// market untouched.
const hptr=await f.ctx.storage.get('price-history-pointer');
const hfile=`price-history-${hptr.slot}.json`;
f.files.set(hfile,'bad');
store=createStore(f.ctx);const degraded=await store.read();
assert.deepEqual(degraded.history,{});assert.equal(degraded.market.bundledScan,'a'.repeat(64));checks++;
f.files.delete(hfile); // pointer remains but file gone -> also degrades
store=createStore(f.ctx);assert.deepEqual((await store.read()).history,{});checks++;
// History pointer failure poisons like market until Reabrir.
f.fail(false,false,false,true);
await assert.rejects(store.history({revision:0,store:hstore}),/pointer failure|No se confirmó/);checks++;
await store.reset();f.fail();store=createStore(f.ctx);
await store.history({revision:0,store:hstore});checks++; // degraded load restarts revision at 0
console.log(JSON.stringify({suite:'desktop storage',checks,result:'PASS'}));
