// Migración v1→v2 reversible: memoria, ámbitos aislados, sin promover
// histórico mixto, recorte global por día y claves adversas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import HunterHistory from '../standalone/market-history.js'
import HunterIdentity from '../standalone/market-identity.js'

const H = HunterHistory
const id = HunterIdentity
const legacy = {
  v: 1,
  realms: {
    'Realm-A': { items: { '2589': [[2501, 100, 2], [2502, 110, null]], '2589:variant:7': [[2502, 90, 1]] } },
    'Realm-B': { items: { '2589': [[2502, 120, 3]] } },
  },
}

test('migración en memoria envuelve v1 en un ámbito desconocido sin tocar filas', () => {
  const v2 = H.migrateStoreV1(structuredClone(legacy), 'local:legacy')
  assert.equal(v2.v, 2)
  assert.equal(Object.keys(v2.scopes).length, 1)
  const scope = Object.values(v2.scopes)[0]
  assert.deepEqual(scope.realms, legacy.realms)
  assert.equal(scope.confirmation, null)
  assert.equal(scope.identity.provenance.confidence, 'unknown')
})

test('migración idempotente y sin duplicar precio en capital/neutral', () => {
  const once = H.migrateStoreV1(structuredClone(legacy), 'local:legacy')
  const twice = H.migrateStoreV1(structuredClone(once), 'local:legacy')
  assert.deepEqual(twice, once)
  assert.equal(Object.keys(twice.scopes).length, 1, 'no se inventa un segundo ámbito neutral')
  assert.ok(Object.values(twice.scopes).every((s) => s.identity.provenance.confidence === 'unknown'))
})

test('días antiguos no se reclasifican: el corte confirmado es explícito por ámbito', () => {
  const migrated = H.migrateStoreV1(structuredClone(legacy), 'local:legacy')
  const verified = id.accreditedIdentity({
    game: 'wow-forever', region: 'us', ruleset: 'PvE', auctionPool: 'pool-A',
    postingChannel: 'neutral', localScope: 'local:verified', rawSourceKey: 'Realm-A',
    fromDay: 2502, toDay: 2502, sourceLabel: 'aislada', verifiedAt: '2026-11-16T20:00:00.000Z',
  })
  const snap = {
    schemaVersion: 2,
    observation: { scope: 'fresh-scan', fromDay: 2502, toDay: 2502, capturedAt: '2026-11-16T20:00:00.000Z' },
    realms: [{ name: 'Realm-A', identity: verified, items: [{ sourceKey: '2589', itemId: 2589, unitPriceCopper: 130, observedDay: 2502, history: [{ day: 2502, low: 130, high: 130, available: 2 }] }] }],
  }
  const merged = H.storeV2Merge(structuredClone(migrated), snap)
  const mergedLegacy = merged.scopes[id.identityKey(id.unknownIdentity('legacy', 'local:legacy'))]
  assert.equal(mergedLegacy.confirmation, null)
  const mergedVerified = merged.scopes[id.identityKey(verified)]
  assert.equal(mergedVerified.confirmation.cutoffDay, 2502)
  assert.equal(mergedVerified.confirmation.verified, true)
  // El día 2501 del histórico legacy NO aparece en el ámbito verificado.
  assert.equal(mergedVerified.realms['Realm-A'].items['2589'].some((r) => r[0] === 2501), false)
})

test('lectura dual: v1 se normaliza en memoria, v2 válido pasa, formatos mixtos fallan cerrados', () => {
  assert.equal(H.normalizeStore(structuredClone(legacy)).v, 2)
  const v2 = H.migrateStoreV1(structuredClone(legacy), 'local:legacy')
  assert.equal(H.normalizeStore(structuredClone(v2)).v, 2)
  assert.throws(() => H.normalizeStore({ v: 2, realms: legacy.realms }), /invalid|store/i)
  assert.throws(() => H.normalizeStore({ v: 1, scopes: {} }), /invalid|store/i)
  assert.throws(() => H.normalizeStore(null), /invalid|store/i)
})

test('claves adversas y prototipo: store v2 rechaza nombres peligrosos', () => {
  const v2 = H.migrateStoreV1(structuredClone(legacy), 'local:legacy')
  const scopeKey = Object.keys(v2.scopes)[0]
  const bad = structuredClone(v2)
  bad.scopes[scopeKey].realms['__proto__'] = { items: { '1': [[2502, 5, 1]] } }
  assert.equal(H.validStoreV2(bad), false)
  const bad2 = structuredClone(v2)
  const realm = Object.keys(bad2.scopes[scopeKey].realms)[0]
  bad2.scopes[scopeKey].realms[realm].items['WTF/Account/Bob'] = [[2502, 5, 1]]
  assert.equal(H.validStoreV2(bad2), false)
  const bad3 = structuredClone(v2)
  bad3.scopes['__proto__'] = { realms: {} }
  assert.equal(H.validStoreV2(bad3), false)
})

test('recorte global por día entre ámbitos: el día más antiguo cae en todos', () => {
  const v2 = H.migrateStoreV1(structuredClone(legacy), 'local:legacy')
  const s2 = structuredClone(v2)
  const k2 = id.identityKey(id.unknownIdentity('legacy', 'local:legacy-2'))
  s2.scopes[k2] = { identity: id.unknownIdentity('legacy', 'local:legacy-2'), confirmation: null, realms: { 'Realm-C': { items: { '2589': [[2501, 200, 1]] } } } }
  const fitted = H.fitStoreV2(s2, 700)
  assert.equal(H.validStoreV2(fitted), true)
  const days = []
  for (const s of Object.values(fitted.scopes)) for (const r of Object.values(s.realms)) for (const rows of Object.values(r.items)) for (const row of rows) days.push(row[0])
  assert.ok(!days.includes(2501), 'el día 2501 se recorta de TODOS los ámbitos')
  assert.ok(days.includes(2502))
})

test('applyStoreV2 no filtra historial entre ámbitos', () => {
  const store = H.migrateStoreV1(structuredClone(legacy), 'local:legacy')
  const key = Object.keys(store.scopes)[0]
  const verified = id.accreditedIdentity({
    game: 'wow-forever', region: 'us', ruleset: 'PvE', auctionPool: 'pool-A',
    postingChannel: 'neutral', localScope: 'local:verified', rawSourceKey: 'Realm-A',
    fromDay: 2502, toDay: 2502, sourceLabel: 'aislada', verifiedAt: '2026-11-16T20:00:00.000Z',
  })
  const snap = {
    schemaVersion: 2,
    realms: [{ name: 'Realm-B', identity: verified, items: [{ sourceKey: '2589', itemId: 2589, unitPriceCopper: 130, observedDay: 2502, history: [{ day: 2502, low: 130, high: 130, available: 2 }] }] }],
  }
  const applied = H.applyStoreV2(snap, store)
  // Realm-B del ámbito legacy NO se ve tocado por el snapshot verificado.
  assert.equal(applied.realms[0].items[0].history.length, 1)
  assert.equal(store.scopes[key].realms['Realm-B'].items['2589'].length, 1)
})

test('vista legacy para rollback conserva el par A/B original', () => {
  const v2 = H.migrateStoreV1(structuredClone(legacy), 'local:legacy')
  const view = H.legacyView(v2)
  assert.equal(view.v, 1)
  assert.deepEqual(view.realms, legacy.realms)
})
