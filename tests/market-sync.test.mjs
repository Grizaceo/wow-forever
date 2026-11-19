// Sincronización v2: importación de fuente aislada, dedup por procedencia,
// bloqueo de escaneos desconocidos y lectura/confirmación sin mezclar ámbitos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import Identity from '../standalone/market-identity.js'
import History from '../standalone/market-history.js'
import Source from '../standalone/market-source.js'
import {
  planImportacion, snapshotVisible, snapshotValido, infoHistorial, compararPools, parsearFuenteAislada,
} from '../desktop/src/mercado-logica.js'
import { dedupeProcedencia, prepararSincronizacion, createMarketSync } from '../desktop/src/mercado-auto.js'

const ident = Identity.accreditedIdentity({
  game: 'wow-forever', region: 'us', ruleset: 'PvE', auctionPool: 'pool-A',
  postingChannel: 'neutral', localScope: 'local:verified', rawSourceKey: 'Realm-A',
  fromDay: 2501, toDay: 2502, sourceLabel: 'observación aislada', verifiedAt: '2026-11-16T20:00:00.000Z',
})
const snapV2 = (hist = [{ day: 2502, low: 130, high: 130, available: 2 }]) => ({
  schemaVersion: 2, sourceVersion: 8, importedAt: '2026-11-16T20:00:00.000Z',
  observation: { scope: 'fresh-scan', fromDay: 2502, toDay: 2502, capturedAt: '2026-11-16T20:00:00.000Z' },
  realms: [{ name: 'Realm-A', identity: ident, items: [{ sourceKey: '2589', itemId: 2589, unitPriceCopper: 130, observedDay: 2502, history: hist }] }],
  warnings: [],
})
const sourceDoc = () => ({
  schema: Source.SCHEMA,
  identity: {
    game: 'wow-forever', region: 'us', ruleset: 'PvE', auctionPool: 'pool-A', postingChannel: 'neutral',
    localScope: 'local:verified', rawSourceKey: 'Realm-A',
    sourceLabel: 'observación aislada', verifiedAt: '2026-11-16T20:00:00.000Z',
  },
  observation: { scope: 'fresh-scan', fromDay: 2502, toDay: 2502, capturedAt: '2026-11-16T20:00:00.000Z' },
  items: [{ sourceKey: '2589', itemId: 2589, unitPriceCopper: 130, observedDay: 2502, available: 2 }],
})

test('planImportacion v2 produce snapshot y store v2 con identidad, sin ámbito sin etiquetar', () => {
  const r = planImportacion(snapV2(), {})
  assert.equal(r.snapshot.schemaVersion, 2)
  assert.equal(r.store.v, 2)
  assert.equal(r.snapshot.realms[0].identity.provenance.confidence, 'verified')
  assert.ok(Object.values(r.store.scopes).every((s) => s.identity.provenance.confidence === 'verified'))
})

test('snapshotVisible v2 hidrata solo el ámbito correspondiente', () => {
  const snap = snapV2([])
  const store = History.storeV2FromSnapshot(snapV2())
  const out = snapshotVisible({ snapshot: snap }, { store })
  assert.equal(out.realms[0].items[0].history.length, 1)
  assert.equal(out.realms[0].items[0].history[0].day, 2502)
})

test('snapshotValido acepta v1 y v2, rechaza v2 sin observación fresca', () => {
  const v1 = { ...snapV2(), schemaVersion: 1 }
  delete v1.observation; delete v1.realms[0].identity
  assert.equal(snapshotValido(v1), true)
  assert.equal(snapshotValido(snapV2()), true)
  const bad = snapV2(); delete bad.observation
  assert.equal(snapshotValido(bad), false)
})

test('infoHistorial cuenta días en todos los ámbitos v2', () => {
  const store = History.storeV2FromSnapshot(snapV2())
  const k2 = Identity.identityKey(Identity.unknownIdentity('legacy', 'local:legacy'))
  store.scopes[k2] = { identity: Identity.unknownIdentity('legacy', 'local:legacy'), confirmation: null,
    realms: { 'Realm-B': { items: { '1': [[2501, 5, 1]] } } } }
  const info = infoHistorial(store)
  assert.equal(info.days, 2)
})

test('parsearFuenteAislada expone el parser validado y bloquea escaneo crudo', () => {
  const snap = parsearFuenteAislada(JSON.stringify(sourceDoc()), true)
  assert.equal(snap.schemaVersion, 2)
  assert.equal(snap.realms[0].identity.provenance.confidence, 'verified')
  assert.throws(() => parsearFuenteAislada('{"schema":"otro"}', true), /inválid|isolad/i)
})

test('dedupeProcedencia: misma identidad+clave+día+hash no se cuenta dos veces', () => {
  const item = (over = {}) => ({ identity: Identity.identityKey(ident), sourceKey: '2589', day: 2502, hash: 'abc', ...over })
  assert.equal(dedupeProcedencia([item(), item()]).length, 1)
  assert.equal(dedupeProcedencia([item(), item({ hash: 'def' })]).length, 2)
  assert.equal(dedupeProcedencia([item(), item({ day: 2503 })]).length, 2)
  const other = Identity.identityKey(Identity.accreditedIdentity({ ...ident.provenance.scope,
    game: ident.game, region: ident.region, ruleset: ident.ruleset, auctionPool: ident.auctionPool,
    postingChannel: 'capital', localScope: ident.localScope, rawSourceKey: ident.rawSourceKey,
    fromDay: 2501, toDay: 2502, sourceLabel: 'aislada', verifiedAt: ident.provenance.verifiedAt }))
  assert.equal(dedupeProcedencia([item(), item({ identity: other })]).length, 2)
})

test('prepararSincronizacion bloquea procedencia desconocida sin devolver store', () => {
  const unknown = { ...snapV2(), realms: [{ name: 'Realm-A', items: snapV2().realms[0].items }] }
  const r = prepararSincronizacion({ snapshot: unknown })
  assert.equal(r.status, 'blocked')
  assert.match(r.reason, /procedencia|unknown/i)
  assert.equal(r.store, undefined)
  assert.equal(prepararSincronizacion({ snapshot: snapV2() }).status, 'ok')
})

test('importSeparateSource hace respaldo y commit v2; rechaza fuente inválida', async () => {
  const calls = []
  const almacen = {
    read: async () => ({ revision: 1, history: { revision: 1, store: { v: 1, realms: {} } }, market: {} }),
    backupForMigration: async () => { calls.push('backup'); return { ok: true } },
    commitV2: async (v) => { calls.push('commit'); return { ok: true, ...v } },
  }
  const sync = createMarketSync({ verifyMarketSource:async()=>true, storage: { get: async () => true, set: async () => {} } }, almacen)
  const ok = await sync.importSeparateSource(JSON.stringify(sourceDoc()))
  assert.equal(ok.status, 'ok')
  assert.deepEqual(calls, ['backup', 'commit'])
  assert.equal(ok.committed.market.snapshot.schemaVersion, 2)
  const bad = await sync.importSeparateSource('{"schema":"no"}')
  assert.equal(bad.status, 'blocked')
  assert.deepEqual(calls, ['backup', 'commit'], 'no hubo segundo commit')
  sync.dispose()
})

test('compararPools bloquea desconocidos y respeta comisión verificada', () => {
  const row = (key, price, day) => ({ sourceKey: key, itemId: Number(key), unitPriceCopper: price, observedDay: day, confirmed: true, coverage: { itemRows: 10, scannedRows: 100 } })
  const unknown = Identity.unknownIdentity('Realm-A')
  const blocked = compararPools([
    { id: 'a', identity: unknown, rows: [row('2589', 100, 2502)] },
    { id: 'b', identity: unknown, rows: [row('2589', 120, 2502)] },
  ], { todayDay: 2503 })
  assert.equal(blocked.status, 'blocked')
  const id2 = Identity.accreditedIdentity({ ...sourceDoc().identity, fromDay: 2501, toDay: 2502, postingChannel: 'capital', auctionPool:'pool-B' })
  const ok = compararPools([
    { id: 'a', identity: ident, rows: [row('2589', 100, 2502)] },
    { id: 'b', identity: id2, rows: [row('2589', 120, 2502)] },
  ], { todayDay: 2503 })
  assert.equal(ok.status, 'comparable')
})
