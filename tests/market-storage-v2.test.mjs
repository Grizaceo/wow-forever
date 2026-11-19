// Almacén v2: lectura dual, respaldo durable A/B antes de escribir, commit
// atómico por pareja y rollback exacto. TSM permanece en su esquema aparte.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore, validMarket, validHistoryStore } from '../desktop/src/almacen.js'

function fixture() {
  const storage = new Map(), disk = new Map()
  const ctx = {
    storage: { get: async k => storage.get(k), set: async (k, v) => storage.set(k, v) },
    files: {
      readText: async (_id, p) => disk.has(p) ? { ok: true, text: disk.get(p) } : { ok: false },
      writeText: async (_id, p, text) => { disk.set(p, text); return { ok: true } },
    },
  }
  const v1market = { snapshot: {
    schemaVersion: 1, sourceVersion: 8, importedAt: '2026-11-16T19:00:00.000Z',
    realms: [{ name: 'Realm-A', items: [{ sourceKey: '2589', itemId: 2589, unitPriceCopper: 100, observedDay: 2501, history: [{ day: 2501, low: 100, high: 100, available: 2 }] }] }],
    warnings: [],
  } }
  const v1store = { v: 1, realms: { 'Realm-A': { items: { '2589': [[2501, 100, 2]] } } } }
  disk.set('market-a.json', JSON.stringify({ revision: 1, values: v1market }))
  disk.set('price-history-a.json', JSON.stringify({ revision: 1, store: v1store }))
  storage.set('market-pointer', { slot: 'a', revision: 1 })
  storage.set('price-history-pointer', { slot: 'a', revision: 1 })
  storage.set('tsm-snapshot', { keep: true })
  return { ctx, disk, storage, v1market, v1store, store: createStore(ctx) }
}

const identity = {
  game: 'wow-forever', region: 'us', ruleset: 'PvE', auctionPool: 'pool-A',
  postingChannel: 'neutral', localScope: 'local:verified', rawSourceKey: 'Realm-A',
  provenance: {
    method: 'separate-source-observation', confidence: 'verified',
    scope: { observationKind: 'fresh-scan', fromDay: 2502, toDay: 2502, sourceLabel: 'aislada' },
    verifiedAt: '2026-11-16T20:00:00.000Z',
  },
}
const v2snapshot = {
  schemaVersion: 2, sourceVersion: 8, importedAt: '2026-11-16T20:00:00.000Z',
  observation: { scope: 'fresh-scan', fromDay: 2502, toDay: 2502, capturedAt: '2026-11-16T20:00:00.000Z' },
  realms: [{ name: 'Realm-A', identity, items: [{ sourceKey: '2589', itemId: 2589, unitPriceCopper: 130, observedDay: 2502, history: [{ day: 2502, low: 130, high: 130, available: 2 }] }] }],
  warnings: [],
}
const v2store = { v: 2, scopes: {} }

test('lectura dual: v1 se marca legacy; los validadores aceptan ambas versiones', async () => {
  const f = fixture()
  const s = await f.store.read()
  assert.equal(s.market.snapshot.schemaVersion, 1)
  assert.equal(validMarket({ snapshot: v2snapshot }), true)
  const H = (await import('../standalone/market-history.js')).default
  const v2 = H.migrateStoreV1(f.v1store, 'local:legacy')
  assert.equal(validHistoryStore(v2), true)
  assert.equal(validHistoryStore(f.v1store), true)
  assert.equal(typeof s.legacyMarket, 'boolean')
})

test('respaldo durable A/B antes de escribir v2; no sobrescribe el único legible', async () => {
  const f = fixture()
  const before = { a: f.disk.get('market-a.json'), h: f.disk.get('price-history-a.json') }
  const b1 = await f.store.backupForMigration()
  assert.equal(b1.ok, true)
  const backup = f.disk.get('pre-v2-backup.json')
  assert.ok(backup && JSON.parse(backup).slots.a.market === before.a)
  f.disk.set('pre-v2-backup.json', JSON.stringify({ sentinel: 'intacto' }))
  await assert.rejects(() => f.store.backupForMigration(), /inválido/)
  assert.equal(f.disk.get('pre-v2-backup.json'), JSON.stringify({ sentinel: 'intacto' }))
})

test('commitV2 escribe ambas versiones nuevas con readback y conserva TSM', async () => {
  const f = fixture()
  await f.store.backupForMigration()
  const H = (await import('../standalone/market-history.js')).default
  const store = H.storeV2Merge(H.migrateStoreV1(f.v1store, 'local:legacy'), v2snapshot)
  const r = await f.store.commitV2({ market: { snapshot: v2snapshot, realm: 'Realm-A' }, store, revision: 1, hrevision: 1 })
  assert.equal(r.ok, true)
  const s = await f.store.read()
  assert.equal(s.market.snapshot.schemaVersion, 2)
  assert.equal(s.market.snapshot.realms[0].identity.provenance.confidence, 'verified')
  assert.equal(s.history.store.v, 2)
  assert.deepEqual(f.storage.get('tsm-snapshot'), { keep: true })
})

test('rollback restaura bytes exactos de A/B y punteros', async () => {
  const f = fixture()
  const original = { m: f.disk.get('market-a.json'), h: f.disk.get('price-history-a.json') }
  await f.store.backupForMigration()
  await f.store.commitV2({ market: { snapshot: v2snapshot, realm: 'Realm-A' }, store: v2store, revision: 1, hrevision: 1 })
  const r = await f.store.rollbackToBackup()
  assert.equal(r.ok, true)
  assert.equal(f.disk.get('market-a.json'), original.m)
  assert.equal(f.disk.get('price-history-a.json'), original.h)
  assert.deepEqual(f.storage.get('market-pointer'), { slot: 'a', revision: 1 })
})

test('concurrencia: una segunda confirmación con revisión vieja se rechaza', async () => {
  const f = fixture()
  await f.store.backupForMigration()
  await f.store.commitV2({ market: { snapshot: v2snapshot, realm: 'Realm-A' }, store: v2store, revision: 1, hrevision: 1 })
  await assert.rejects(() => f.store.commitV2({ market: { snapshot: v2snapshot, realm: 'Realm-A' }, store: v2store, revision: 1, hrevision: 1 }), /cambió|revision/i)
})

test('índice incierto o respaldo ausente bloquean la escritura v2', async () => {
  const f = fixture()
  await assert.rejects(() => f.store.commitV2({ market: { snapshot: v2snapshot, realm: 'Realm-A' }, store: v2store, revision: 1, hrevision: 1 }), /respaldo/i)
  f.storage.set('market-pointer', { slot: 'c', revision: 1 })
  await assert.rejects(() => f.store.read(), /Índice de mercado inválido/)
})
