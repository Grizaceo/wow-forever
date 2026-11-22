import { test } from 'node:test'
import assert from 'node:assert/strict'
import H from '../standalone/market-history.js'
import I from '../standalone/market-identity.js'
import { planImportacion, HISTORY_MAX_BYTES } from '../desktop/src/mercado-logica.js'

// Identidad legacy: la que recibe todo scan v1 de Auctionator (todo UNKNOWN).
const LEGACY = Object.values(H.migrateStoreV1(H.emptyStore(), 'local:legacy').scopes)[0].identity

const snap = (name, precio, day = 2500, identity = LEGACY) => ({
  schemaVersion: 2,
  sourceVersion: 8,
  importedAt: '2026-11-16T20:00:00Z',
  warnings: [],
  observation: { scope: 'legacy', fromDay: day, toDay: day, capturedAt: '2026-11-16T20:00:00Z' },
  realms: [{
    name,
    identity: structuredClone(identity),
    items: [{
      sourceKey: '1', itemId: 1, unitPriceCopper: precio, observedDay: day, available: 2,
      history: [{ day, low: precio, high: precio, available: 2 }],
    }],
  }],
})

test('la misma identidad opaca con etiqueta de facción distinta se unifica en un solo reino', () => {
  const previo = snap('PvP', 100, 2500)
  const nuevo = snap('PvP Horde', 200, 2501)
  const plan = planImportacion(nuevo, { snapshotActual: previo, historyStore: H.storeV2FromSnapshot(previo) })

  assert.equal(plan.snapshot.realms.length, 1, 'el snapshot no debe duplicar el pool')
  assert.equal(plan.snapshot.realms[0].name, 'PvP Horde', 'gana la etiqueta del scan nuevo')
  assert.equal(plan.snapshot.realms[0].items[0].unitPriceCopper, 200, 'precio del scan nuevo')
  assert.equal(plan.snapshot.warnings.length, 1, 'la unificación se declara')
  assert.match(plan.snapshot.warnings[0], /PvP Horde/)
  assert.match(plan.snapshot.warnings[0], /PvP/)
  assert.ok(plan.snapshot.warnings[0].includes('sin identidad verificada'), 'el aviso nombra la causa')
})

test('el histórico del reino viejo se mueve al nombre nuevo sin partir la serie', () => {
  const previo = snap('PvP', 100, 2500)
  const nuevo = snap('PvP Horde', 200, 2501)
  const plan = planImportacion(nuevo, { snapshotActual: previo, historyStore: H.storeV2FromSnapshot(previo) })

  const scopes = Object.values(plan.store.scopes)
  assert.equal(scopes.length, 1, 'un solo ámbito')
  const nombres = Object.keys(scopes[0].realms)
  assert.deepEqual(nombres, ['PvP Horde'], 'no queda el nombre viejo')
  const dias = scopes[0].realms['PvP Horde'].items['1'].map((r) => r[0])
  assert.deepEqual(dias, [2500, 2501], 'la serie conserva el día previo y suma el nuevo')
  assert.ok(H.validStoreV2(plan.store))
})

test('una identidad acreditada con nombre distinto NO se colapsa', () => {
  const acc = (pool) => I.accreditedIdentity({
    game: 'wow-forever', region: 'us', ruleset: 'PvE', auctionPool: pool, postingChannel: pool,
    localScope: 'test', rawSourceKey: pool, fromDay: 2500, toDay: 2500,
    sourceLabel: 'synthetic', verifiedAt: '2026-11-16T20:00:00Z',
  })
  const id = acc('A')
  const previo = snap('PvP', 100, 2500, id)
  const nuevo = snap('PvP Horde', 200, 2501, id)
  const plan = planImportacion(nuevo, { snapshotActual: previo, historyStore: H.storeV2FromSnapshot(previo) })

  assert.equal(plan.snapshot.realms.length, 2, 'con identidad acreditada el nombre sigue siendo parte del pool')
  assert.equal(Object.keys(plan.store.scopes)[0] !== undefined, true)
  assert.deepEqual(plan.snapshot.warnings, [], 'sin unificación no hay aviso')
})

test('el tamaño de la captura no consume el presupuesto del histórico', () => {
  const vacio = H.emptyStoreV2()
  const grande = snap('PvE', 100, 2500)
  // sourceKey largo: un snapshot legítimamente enorme (no es un caso de nombres).
  grande.realms[0].items = Array.from({ length: 12000 }, (_, i) => ({
    sourceKey: 'k'.repeat(250) + i, itemId: i + 1, unitPriceCopper: 100, observedDay: 2500,
    available: 2, history: [{ day: 2500, low: 100, high: 100, available: 2 }],
  }))
  const {snapshot, store} = planImportacion(grande, { snapshotActual: null, historyStore: vacio })
  assert.ok(H.byteSize(snapshot) > HISTORY_MAX_BYTES, 'la captura supera el antiguo tope de la pareja')
  assert.equal(snapshot.realms[0].items.length, 12000)
  assert.ok(H.byteSize(store) <= HISTORY_MAX_BYTES)
  assert.equal(Object.keys(Object.values(store.scopes)[0].realms.PvE.items).length, 12000)
})

test('un día que supera el presupuesto histórico no reemplaza el histórico por uno vacío', () => {
  const previo = snap('PvE', 50, 2499)
  const grande = snap('PvE', 100, 2500)
  grande.realms[0].items = Array.from({ length: 16000 }, (_, i) => ({
    ...grande.realms[0].items[0], sourceKey: 'k'.repeat(280) + i, itemId: i + 1,
  }))
  assert.throws(() => planImportacion(grande, {
    snapshotActual: previo, historyStore: H.storeV2FromSnapshot(previo),
  }), /histórico.+presupuesto/)
})
