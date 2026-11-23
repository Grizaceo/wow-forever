import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore } from '../desktop/src/almacen.js'
import * as auto from '../desktop/src/mercado-auto.js'
import H from '../standalone/market-history.js'
const realms = state => H.legacyView(state.history.store).realms

function fixture() {
  const storage = new Map(), disk = new Map(); let source = lua(2500, 100), writes = 0, picker = 0
  const ctx = { storage: { get: async k => storage.get(k), set: async(k,v) => storage.set(k,v) }, files: {
    folders: async () => [{ id:'g',name:'SavedVariables' }],
    requestFolder: async () => { picker++; throw Error('picker') },
    list: async () => ({ok:true,entries:[]}),
    readText: async(id,p) => id === 'data' ? {ok:disk.has(p),text:disk.get(p)} : {ok:true,text:source},
    writeText: async(id,p,text) => {
      writes++
      if (Buffer.byteLength(text, 'utf8') > 4 * 1024 * 1024) return {ok:false,error:'too-large'}
      disk.set(p,text)
      return {ok:true}
    },
  } }
  return {ctx,store:createStore(ctx),set:s=>source=s,writes:()=>writes,picker:()=>picker,storage,disk}
}
function lua(day, price) { return `AUCTIONATOR_PRICE_DATABASE = { ["__dbversion"] = 8, ["Realm"] = { version = 2, ["2589"] = { m = ${price}, h = { ["${day}"] = ${price} }, a = { ["${day}"] = 5 } } } }` }
function largeLua(n = 34118) {
  const items = Array.from({ length: n }, (_, i) => {
    const key = i === 0 ? 2589 : 100000 + i
    return `["${key}"]={m=76543,h={["2501"]=65432,["2502"]=76543},a={["2502"]=5}}`
  })
  return `AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Realm"]={version=2,${items.join(',')}}}`
}

test('el sondeo conserva todos los precios y días de un export que normaliza a más de 4 MiB', async () => {
  const f = fixture(), sync = auto.createMarketSync(f.ctx, f.store)
  assert.equal((await sync.poll()).status, 'ok')
  const before = await f.store.read()
  f.set(largeLua())
  const result = await sync.poll()
  assert.equal(result.status, 'ok', result.message)
  const after = await createStore(f.ctx).read()
  assert.equal(after.revision, before.revision + 1)
  assert.equal(after.history.revision, after.revision)
  assert.ok(H.byteSize(after.market.snapshot) > 4 * 1024 * 1024)
  assert.equal(after.market.snapshot.realms[0].items.length, 34118)
  assert.equal(after.market.snapshot.realms[0].items.find(i => i.itemId === 2589).unitPriceCopper, 76543)
  assert.deepEqual(realms(after).Realm.items['2589'].map(r => r[0]), [2500, 2501, 2502])
  const n = f.writes()
  assert.equal((await sync.poll()).status, 'unchanged')
  assert.equal(f.writes(), n)
  assert.equal(f.picker(), 0)
})

test('si falla la escritura intermedia, reabre la pareja anterior y reintenta el mismo export', async () => {
  const f = fixture(), sync = auto.createMarketSync(f.ctx, f.store)
  assert.equal((await sync.poll()).status, 'ok')
  const pointer = f.storage.get('market-v2-pointer'), before = await f.store.read()
  const write = f.ctx.files.writeText
  let attempts = 0
  f.ctx.files.writeText = (id, path, text) => ++attempts === 2 ? {ok:false,error:'io-error'} : write(id, path, text)
  f.set(largeLua(24000))
  const failed = await sync.poll()
  assert.equal(failed.error, 'save', failed.message)
  assert.equal(attempts, 2)
  assert.deepEqual(f.storage.get('market-v2-pointer'), pointer)
  assert.deepEqual(await createStore(f.ctx).read(), before)
  f.ctx.files.writeText = write
  assert.equal((await sync.poll()).status, 'ok')
  assert.equal((await createStore(f.ctx).read()).revision, pointer.revision + 1)
})

test('un fragmento faltante o alterado no se interpreta como mercado vacío ni se sobrescribe', async () => {
  const f = fixture(), sync = auto.createMarketSync(f.ctx, f.store)
  f.set(largeLua(24000))
  assert.equal((await sync.poll()).status, 'ok')
  const pointer = f.storage.get('market-v2-pointer'), writes = f.writes()
  const part = `market-v2-${pointer.slot}.part-001.json`, original = f.disk.get(part)
  assert.ok(original.includes('76543'))
  f.disk.delete(part)
  await assert.rejects(createStore(f.ctx).read(), /incompleto/)
  f.disk.set(part, original.replace('76543', '76542')) // mismo tamaño, JSON todavía válido
  await assert.rejects(createStore(f.ctx).read(), /integridad/)
  const restarted = auto.createMarketSync(f.ctx, createStore(f.ctx))
  const failed = await restarted.poll()
  assert.equal(failed.error, 'load', failed.message)
  assert.deepEqual(f.storage.get('market-v2-pointer'), pointer)
  assert.equal(f.writes(), writes)
})
test('sondeo importa cambios, conserva días anteriores y no reescribe contenido idéntico', async () => {
  assert.equal(typeof auto.createMarketSync, 'function')
  const f=fixture(), sync=auto.createMarketSync(f.ctx,f.store)
  assert.equal((await sync.poll()).status,'ok')
  const n=f.writes(); assert.equal((await sync.poll()).status,'unchanged'); assert.equal(f.writes(),n)
  f.set(lua(2501,200)); assert.equal((await sync.poll()).status,'ok')
  const state=await f.store.read()
  assert.deepEqual(realms(state).Realm.items['2589'].map(r=>r[0]),[2500,2501])
  assert.equal(f.picker(),0)
})
test('archivo inválido conserva precios y se reintenta al recuperarse', async () => {
  const f=fixture(), sync=auto.createMarketSync(f.ctx,f.store)
  await sync.poll(); const before=await f.store.read()
  f.set('AUCTIONATOR_PRICE_DATABASE = {'); assert.equal((await sync.poll()).status,'error')
  assert.deepEqual(await f.store.read(),before)
  f.set(lua(2502,300)); assert.equal((await sync.poll()).status,'ok')
})
test('pausar persiste y evita resucitar los datos borrados; dispose detiene sondeos', async () => {
  const f=fixture(), sync=auto.createMarketSync(f.ctx,f.store)
  await sync.setEnabled(false)
  assert.equal((await sync.poll()).status,'paused'); assert.equal(f.writes(),0)
  await sync.setEnabled(true); await sync.poll(); sync.dispose()
  f.set(lua(2503,400)); assert.equal((await sync.poll()).status,'stopped')
})
test('recuperar el archivo limpia errores anteriores y pausar limpia historial pendiente', async () => {
  const f=fixture(), sync=auto.createMarketSync(f.ctx,f.store)
  f.set('AUCTIONATOR_PRICE_DATABASE = {'); await sync.poll()
  assert.equal(sync.getState().error,'parse')
  f.set(lua(2504,200)); await sync.poll()
  assert.equal(sync.getState().error,undefined)
  const commit=f.store.commitV2, before=await f.store.read()
  f.store.commitV2=async()=>{throw Error('sin disco')}
  f.set(lua(2505,300)); await sync.poll(); assert.equal(sync.getState().error,'save')
  assert.deepEqual(await f.store.read(),before,'fallo conjunto conserva ambos datos')
  await sync.setEnabled(false); assert.equal(sync.getState().error,undefined)
  f.store.commitV2=commit
})
function deferred() { let resolve; const promise=new Promise(r=>resolve=r); return {promise,resolve} }
test('dispose durante lectura de estado impide empezar escrituras', async () => {
  const f=fixture(), gate=deferred(), entered=deferred(), read=f.store.read
  f.store.read=async()=>{entered.resolve(); await gate.promise; return read()}
  const sync=auto.createMarketSync(f.ctx,f.store), result=sync.poll()
  await entered.promise; sync.dispose(); gate.resolve()
  assert.equal((await result).status,'stopped'); assert.equal(f.writes(),0)
})
test('dispose cancela importaciones manuales encoladas', async () => {
  const f=fixture(), gate=deferred(), sync=auto.createMarketSync(f.ctx,f.store)
  const blocking=sync.exclusive(()=>gate.promise)
  const result=sync.importBytes(new TextEncoder().encode(lua(2504,100)))
  sync.dispose(); gate.resolve(); await blocking
  assert.equal((await result).status,'stopped'); assert.equal(f.writes(),0)
})
test('una escritura ya iniciada termina su historial sin notificar tras dispose', async () => {
  const f=fixture(), gate=deferred(), entered=deferred(), commit=f.store.commitV2
  f.store.commitV2=async v=>{entered.resolve(); await gate.promise; return commit(v)}
  const sync=auto.createMarketSync(f.ctx,f.store); let notifications=0
  sync.subscribe(()=>notifications++)
  const result=sync.poll(); await entered.promise; sync.dispose()
  const before=notifications; gate.resolve(); await result
  const state=await f.store.read()
  assert.equal(realms(state).Realm.items['2589'].length,1)
  assert.equal(notifications,before)
})
test('historial que falla se reintenta incluso sin cambio del archivo', async () => {
  const f=fixture(); let fail=true; const commit=f.store.commitV2
  f.store.commitV2=async v=>{if(fail){fail=false;throw Error('disco ocupado')}return commit(v)}
  const sync=auto.createMarketSync(f.ctx,f.store)
  assert.equal((await sync.poll()).status,'error')
  assert.equal((await sync.poll()).histOk,true)
  assert.equal((await sync.poll()).status,'unchanged')
})
