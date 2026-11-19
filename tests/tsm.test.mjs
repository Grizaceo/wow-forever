import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as TSM from '../desktop/src/tsm.js'
import { createTsmStore, createTsmSync, leerTsm } from '../desktop/src/tsm-sync.js'

// Synthetic fixtures matching TSM 4 CSV.EncodeEnd and realm settings keys.
export const TX='itemString,stackSize,quantity,price,otherPlayer,player,time,source'
export const EX='itemString,stackSize,quantity,player,time'
export function lua(sales=['i:2589,20,40,120,PRIVATE_BUYER,PRIVATE_CHAR,1794800000,Auction'], buys=['i:2589,10,10,80,PRIVATE_SELLER,PRIVATE_CHAR,1794700000,Auction'], expired=['i:2589,20,60,PRIVATE_CHAR,1794900000']) {
  const q=s=>JSON.stringify(s)
  return `TradeSkillMasterDB={ ["r@Prueba@internalData@csvSales"]=${q([TX,...sales].join('\n'))}, ["r@Prueba@internalData@csvBuys"]=${q([TX,...buys].join('\n'))}, ["r@Prueba@internalData@csvExpired"]=${q([EX,...expired].join('\n'))}, ["r@Prueba@internalData@csvCancelled"]="", ["profileKeys"]={["PRIVATE_CHAR - Prueba"]="Default"} }`
}
export const bytes=s=>new TextEncoder().encode(s)
export function fixture() {
  const storage=new Map(), disk=new Map(); let source=lua(), picker=0, writes=0, fail=false
  const ctx={storage:{get:async k=>storage.get(k),set:async(k,v)=>storage.set(k,v)},files:{
    folders:async()=>[{id:'grant',name:'SavedVariables'}],
    requestFolder:async()=>{picker++;return {ok:true,folder:{id:'grant',name:'SavedVariables'}}},
    readText:async(id,p)=>id==='data'?{ok:disk.has(p),text:disk.get(p)}:{ok:p==='TradeSkillMaster.lua',text:source},
    writeText:async(id,p,text)=>{writes++;if(fail)return {ok:false};disk.set(p,text);return {ok:true}},
  }}
  return {ctx,storage,disk,set:s=>source=s,writes:()=>writes,picker:()=>picker,fail:v=>fail=v}
}
test('parser projects TSM fields, rejects names and keeps quantity already aggregated by TSM',()=>{
  const s=TSM.parseTsm(bytes(lua()))
  assert.equal(TSM.validTsm(s),true)
  assert.equal(s.realms[0].name,'Prueba')
  assert.equal(s.realms[0].records.length,3)
  assert.equal(s.realms[0].records[0].quantity,40)
  assert.equal(s.realms[0].records[0].unitPriceCopper,120)
  assert.doesNotMatch(JSON.stringify(s),/PRIVATE/)
  const [r]=TSM.resumenTsm(s,'Prueba')
  assert.equal(r.sold,40);assert.equal(r.bought,10);assert.equal(r.expired,60)
  assert.equal(r.saleCopper,4800);assert.equal(r.buyCopper,800)
  assert.equal(r.avgSale,120);assert.equal(r.avgBuy,80)
})
test('unit averages are weighted; currencies never multiplied by stack size twice',()=>{
  const s=TSM.parseTsm(bytes(lua(['i:2589,20,40,100,x,y,1794800000,Auction','i:2589,10,10,200,x,y,1794800010,COD'])))
  const [r]=TSM.resumenTsm(s,'Prueba');assert.equal(r.sold,50);assert.equal(r.avgSale,120)
})
test('Lua is data only; duplicates, truncation, unexpected CSV and malformed numeric rows fail closed',()=>{
  for(const text of ['TradeSkillMasterDB=os.execute("bad")',lua()+' os.execute("bad")',lua().slice(0,-1),
    'TradeSkillMasterDB={} TradeSkillMasterDB={}',lua().replace(TX,'bad'),lua(['i:2589,20,0,120,x,y,1794800000,Auction']),
    lua(['i:2589,20,40,9007199254740991,x,y,1794800000,Auction']),lua(['i:2589,20,40,120,x,y,NaN,Auction']),
    'TradeSkillMasterDB={["__proto__"]={}}']) assert.throws(()=>TSM.parseTsm(bytes(text)))
})
test('multiple realms and item variants stay separate; empty current CSV is valid',()=>{
  const s=TSM.parseTsm(bytes(lua(['i:2589,1,1,120,x,y,1794800000,Auction','i:2589:99,1,1,250,x,y,1794800000,Auction'])
    .replace('TradeSkillMasterDB={','TradeSkillMasterDB={["r@Otro@internalData@csvSales"]="",')))
  assert.equal(s.realms.length,2);assert.equal(TSM.resumenTsm(s,'Prueba').length,2)
  assert.equal(TSM.parseTsm(bytes(lua([],[],[]))).realms[0].records.length,0)
})
test('validTsm rejects extra personal fields and unsafe totals',()=>{
  const s=TSM.parseTsm(bytes(lua()));s.realms[0].records[0].player='PRIVATE';assert.equal(TSM.validTsm(s),false)
})
test('store persists TSM independently and validates before replacing; reload retains exact snapshot',async()=>{
  const f=fixture(),store=createTsmStore(f.ctx),s=TSM.parseTsm(bytes(lua()))
  await store.save(s);assert.deepEqual(await createTsmStore(f.ctx).read(),s)
  assert.equal(f.storage.has('market-pointer'),false);assert.equal(f.storage.has('price-history-pointer'),false)
  f.fail(true);await assert.rejects(store.save(TSM.parseTsm(bytes(lua([],[],[])))))
  assert.deepEqual(await store.read(),s)
})
test('corrupt TSM does not silently reset recorded operations',async()=>{
  const f=fixture(),store=createTsmStore(f.ctx);await store.save(TSM.parseTsm(bytes(lua())))
  const pointer=f.storage.get('tsm-pointer');f.disk.set(`tsm-${pointer.slot}.json`,'broken')
  await assert.rejects(createTsmStore(f.ctx).read())
})
test('automatic initial discovery reuses existing grant without a TSM selection',async()=>{
  const f=fixture();assert.equal((await leerTsm(f.ctx,{silent:true})).status,'ok')
  assert.equal((await leerTsm(f.ctx)).status,'ok');assert.equal(f.picker(),0)
  assert.equal(f.storage.get('tsm-location').folderId,'grant')
  assert.equal((await leerTsm(f.ctx,{silent:true})).status,'ok')
})
function treeFixture(paths) {
  const f=fixture(),reads=[];f.storage.set('auctionator-folder','grant')
  f.ctx.files.readText=async(id,path)=>{
    if(id==='data')return {ok:f.disk.has(path),text:f.disk.get(path)}
    reads.push(path);return {ok:paths.includes(path),text:paths.includes(path)?lua():undefined}
  }
  f.ctx.files.list=async(id,rel)=>{
    const entries=new Map(),prefix=rel?rel+'/':''
    for(const path of paths){if(!path.startsWith(prefix))continue;const tail=path.slice(prefix.length),name=tail.split('/')[0];entries.set(name,{name,path:prefix+name,isDirectory:tail.includes('/')})}
    return {ok:true,entries:[...entries.values()],truncated:false}
  }
  return {...f,reads}
}
test('discovers nested TSM under Auctionator grant and pins relative file without picker',async()=>{
  const path='_forever_/WTF/Account/SYNTHETIC/SavedVariables/TradeSkillMaster.lua',f=treeFixture([path,path+'.bak'])
  assert.equal((await createTsmSync(f.ctx).poll()).status,'ok');assert.equal(f.picker(),0)
  assert.equal(f.storage.get('tsm-location').path,path);assert.ok(!f.reads.some(p=>p.endsWith('.bak')))
  f.ctx.files.list=()=>{throw Error('pinned path must not walk')}
  assert.equal((await leerTsm(f.ctx,{silent:true})).status,'ok')
})
test('multiple nested accounts and truncated discovery fail closed without reading candidate contents',async()=>{
  const f=treeFixture(['one/SavedVariables/TradeSkillMaster.lua','two/SavedVariables/TradeSkillMaster.lua'])
  assert.equal((await leerTsm(f.ctx,{silent:true})).status,'error');assert.equal(f.picker(),0)
  assert.ok(!f.reads.some(p=>p.includes('/')))
  f.ctx.files.list=async()=>({ok:true,entries:[{name:'TradeSkillMaster.lua',path:'TradeSkillMaster.lua',isDirectory:false}],truncated:true})
  assert.equal((await leerTsm(f.ctx,{silent:true})).status,'error')
})
test('root copy does not win over nested account and truncated root never pins a hit',async()=>{
  const f=treeFixture(['TradeSkillMaster.lua','WTF/Account/SYNTHETIC/SavedVariables/TradeSkillMaster.lua'])
  assert.equal((await leerTsm(f.ctx,{silent:true})).status,'error');assert.equal(f.storage.has('tsm-location'),false)
  assert.deepEqual(f.reads,[])
  f.ctx.files.list=async()=>({ok:true,truncated:true,entries:[{name:'TradeSkillMaster.lua',path:'TradeSkillMaster.lua',isDirectory:false}]})
  assert.equal((await leerTsm(f.ctx,{silent:true})).status,'error');assert.deepEqual(f.reads,[])
})
test('SDK with discovery but no picker can import automatically; cross-grant ambiguity is metadata-only',async()=>{
  const f=treeFixture(['TradeSkillMaster.lua']);delete f.ctx.files.requestFolder
  assert.equal((await leerTsm(f.ctx,{silent:true})).status,'ok')
  f.storage.delete('tsm-location');f.storage.delete('auctionator-folder');f.reads.length=0
  f.ctx.files.folders=async()=>[{id:'one'},{id:'two'}]
  assert.equal((await leerTsm(f.ctx,{silent:true})).status,'error');assert.deepEqual(f.reads,[])
})
test('missing pinned file never switches accounts or opens picker',async()=>{
  const f=treeFixture(['other/TradeSkillMaster.lua']);f.storage.set('tsm-folder','grant');f.storage.set('tsm-location',{folderId:'grant',path:'gone/TradeSkillMaster.lua'})
  assert.equal((await leerTsm(f.ctx,{silent:true})).status,'error');assert.equal(f.picker(),0)
  assert.deepEqual(f.reads,['gone/TradeSkillMaster.lua'])
})
test('explicit pause prevents discovery/import and no grants never trigger a background picker',async()=>{
  const f=fixture();f.storage.set('tsm-auto',false)
  assert.equal((await createTsmSync(f.ctx).poll()).status,'paused');assert.equal(f.writes(),0)
  f.ctx.files.folders=async()=>[]
  assert.equal((await leerTsm(f.ctx,{silent:true})).status,'no-folder');assert.equal(f.picker(),0)
})
test('unsafe and over-budget discovery fail closed',async()=>{
  const f=treeFixture([])
  for(const entries of [[{name:'TradeSkillMaster.lua',path:'../TradeSkillMaster.lua'}],Array.from({length:121},(_,i)=>({name:'d'+i,path:'d'+i,isDirectory:true}))]){
    f.ctx.files.list=async()=>({ok:true,entries});assert.equal((await leerTsm(f.ctx,{silent:true})).status,'error')
  }
})
test('sync uses full validated source snapshots: repeated import or cumulative row update never doubles totals',async()=>{
  const f=fixture(),sync=createTsmSync(f.ctx)
  assert.equal((await sync.poll()).status,'ok');assert.ok(f.writes()>0)
  assert.equal((await sync.read()).status,'unchanged')
  const before=f.writes();assert.equal((await sync.poll()).status,'unchanged');assert.equal(f.writes(),before)
  f.set(lua(['i:2589,20,60,120,x,y,1794800000,Auction']))
  assert.equal((await sync.poll()).status,'ok');assert.equal(TSM.resumenTsm(sync.getState().snapshot,'Prueba')[0].sold,60)
  f.set(lua().slice(0,-1));assert.equal((await sync.poll()).status,'error')
  assert.equal(TSM.resumenTsm(sync.getState().snapshot,'Prueba')[0].sold,60)
  f.set(lua());f.fail(true);assert.equal((await sync.poll()).status,'error');f.fail(false)
  assert.equal((await sync.poll()).status,'ok')
})
test('dispose while source or storage read pending prevents first write and notifications',async()=>{
  const f=fixture(),sync=createTsmSync(f.ctx);let go
  f.ctx.files.readText=()=>new Promise(resolve=>go=resolve)
  const pending=sync.read();while(!go)await new Promise(r=>setImmediate(r))
  sync.dispose();go({ok:true,text:lua()});await pending;assert.equal(f.writes(),0)
})
test('delete is confirmed and pauses tracking; failed delete keeps snapshot',async()=>{
  const f=fixture(),sync=createTsmSync(f.ctx);await sync.read();f.fail(true)
  assert.equal((await sync.clear()).status,'error');assert.ok(sync.getState().snapshot)
  f.fail(false);assert.equal((await sync.clear()).status,'cleared');assert.equal(sync.getState().snapshot,null)
  assert.equal((await sync.poll()).status,'paused');assert.equal(await createTsmStore(f.ctx).read(),null)
})
test('unconfirmed pointer blocks further writes until explicit reset and exact readback',async()=>{
  const f=fixture(), store=createTsmStore(f.ctx), s=TSM.parseTsm(bytes(lua()))
  await store.save(s)
  const original=f.ctx.storage.set
  f.ctx.storage.set=async(k,v)=>{await original(k,v);if(k==='tsm-pointer')throw Error('transport died after commit')}
  await assert.rejects(store.save(TSM.parseTsm(bytes(lua([],[],[])))),/incierto/)
  const n=f.writes();await assert.rejects(store.save(s),/sin confirmar/);assert.equal(f.writes(),n)
  f.ctx.storage.set=original;store.reset();assert.equal((await store.read()).realms[0].records.length,0)
})
test('readback mismatch does not move pointer or replace prior snapshot',async()=>{
  const f=fixture(),store=createTsmStore(f.ctx),s=TSM.parseTsm(bytes(lua()))
  await store.save(s);const pointer=structuredClone(f.storage.get('tsm-pointer'))
  const read=f.ctx.files.readText;f.ctx.files.readText=async(id,p)=>p==='tsm-b.json'?{ok:true,text:'broken'}:read(id,p)
  await assert.rejects(store.save(TSM.parseTsm(bytes(lua([],[],[])))),/no confirmado/)
  assert.deepEqual(f.storage.get('tsm-pointer'),pointer);assert.deepEqual(await store.read(),s)
})
test('dispose during first pointer read and between read and first write cancels writes',async()=>{
  const f=fixture(),sync=createTsmSync(f.ctx);let release
  const get=f.ctx.storage.get;f.ctx.storage.get=k=>k==='tsm-pointer'?new Promise(r=>release=r):get(k)
  const pending=sync.read();while(!release)await new Promise(r=>setImmediate(r))
  sync.dispose();release(undefined);assert.equal((await pending).status,'stopped');assert.equal(f.writes(),0)
  const g=fixture(),other=createTsmSync(g.ctx),getter=g.ctx.storage.get
  g.ctx.storage.get=async k=>{const value=await getter(k);if(k==='tsm-pointer')queueMicrotask(()=>other.dispose());return value}
  assert.equal((await other.read()).status,'stopped');assert.equal(g.writes(),0)
})
test('a started write finishes its commit without publishing after dispose',async()=>{
  const f=fixture(),sync=createTsmSync(f.ctx);let release,events=0
  sync.subscribe(()=>events++)
  const write=f.ctx.files.writeText;f.ctx.files.writeText=(...a)=>new Promise(r=>release=()=>write(...a).then(r))
  const pending=sync.read();while(!release)await new Promise(r=>setImmediate(r))
  sync.dispose();const before=events;release();await pending
  assert.equal(events,before);assert.ok(await createTsmStore(f.ctx).read())
})
test('revoked grant never opens picker during poll; multiple manual candidates rejected',async()=>{
  const f=fixture();f.storage.set('tsm-folder','revoked')
  f.ctx.files.folders=async()=>[]
  assert.equal((await leerTsm(f.ctx,{silent:true})).status,'no-folder');assert.equal(f.picker(),0)
  assert.equal(f.storage.get('tsm-folder'),null)
  f.ctx.files.folders=async()=>[{id:'one'},{id:'two'}]
  assert.equal((await leerTsm(f.ctx)).status,'no-folder');assert.equal(f.picker(),0)
  assert.equal((await leerTsm(f.ctx,{pick:true})).status,'ok')
})
test('corrupt stored accounting stays visibly failed even when tracking paused',async()=>{
  const f=fixture();f.storage.set('tsm-pointer',{slot:'a',revision:1});f.disk.set('tsm-a.json','broken')
  const sync=createTsmSync(f.ctx);await sync.restore();assert.equal(sync.getState().status,'error')
  assert.equal((await sync.poll()).status,'error');assert.equal(f.writes(),0)
})
test('missing pointer with surviving slots fails closed instead of overwriting orphaned history',async()=>{
  const f=fixture(),store=createTsmStore(f.ctx),s=TSM.parseTsm(bytes(lua()))
  await store.save(s);const before=new Map(f.disk),writes=f.writes()
  f.storage.delete('tsm-pointer')
  const sync=createTsmSync(f.ctx);await sync.restore();assert.equal(sync.getState().status,'error')
  assert.match(sync.getState().message,/índice.*ausente/)
  assert.equal((await sync.read()).status,'error');assert.equal(f.writes(),writes)
  assert.deepEqual(f.disk,before)
})
test('orphaned invalid or inactive slot also prevents silent initialization',async()=>{
  for(const [file,body]of [['tsm-b.json','broken'],['tsm-a.json','']]){
    const f=fixture();f.disk.set(file,body)
    await assert.rejects(createTsmStore(f.ctx).save(TSM.parseTsm(bytes(lua()))),/índice.*ausente/)
    assert.equal(f.writes(),0)
  }
})
test('snapshot import identity invariant over different quantities',()=>{
  for(let n=1;n<=80;n++){
    const s=TSM.parseTsm(bytes(lua([`i:2589,1,${n},121,x,y,1794800000,Auction`],[],[])))
    assert.equal(TSM.resumenTsm(s,'Prueba')[0].saleCopper,121*n)
    assert.deepEqual(TSM.resumenTsm(s,'Prueba'),TSM.resumenTsm(structuredClone(s),'Prueba'))
  }
})
