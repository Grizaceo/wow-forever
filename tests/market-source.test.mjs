// Fuente aislada válida: solo observación fresca con identidad explícita.
// El histórico crudo de Auctionator nunca se promueve a procedencia conocida.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import HunterSource from '../standalone/market-source.js'
const { SCHEMA, validObservationInput } = HunterSource
// Synthetic adapter flag: validates mechanics, not any game provenance.
const parseSeparateSourceObservations = input => HunterSource.parseSeparateSourceObservations(input, true)

const doc = (over = {}) => ({
  schema: SCHEMA,
  identity: {
    game: 'wow-forever', region: 'us', ruleset: 'PvE', auctionPool: 'pool-A',
    postingChannel: 'capital', localScope: 'local:scope-1', rawSourceKey: 'Realm-AA',
    sourceLabel: 'captura aislada', verifiedAt: '2026-11-16T20:00:00.000Z',
  },
  observation: { scope: 'fresh-scan', fromDay: 2500, toDay: 2502, capturedAt: '2026-11-16T20:00:00.000Z' },
  items: [
    { sourceKey: '2589', itemId: 2589, unitPriceCopper: 12345, observedDay: 2501, available: 3 },
  ],
  ...over,
})

test('observación aislada válida produce snapshot v2 con procedencia verificada', () => {
  const snap = parseSeparateSourceObservations(JSON.stringify(doc()))
  assert.equal(snap.schemaVersion, 2)
  assert.equal(snap.realms.length, 1)
  assert.equal(snap.realms[0].identity.provenance.confidence, 'verified')
  assert.equal(snap.realms[0].identity.provenance.scope.observationKind, 'fresh-scan')
  assert.equal(snap.realms[0].identity.rawSourceKey, 'Realm-AA')
  assert.equal(snap.realms[0].items[0].confirmed, true)
  assert.equal(snap.realms[0].items[0].unitPriceCopper, 12345)
})

test('export crudo de Auctionator se rechaza: no otorga procedencia', () => {
  const raw = JSON.stringify({ AUCTIONATOR_PRICE_DATABASE: { 'Realm-AA': { '2589': { T: [2501, 12345, 2] } } } })
  assert.throws(() => parseSeparateSourceObservations(raw), /crudo/)
  assert.equal(validObservationInput(JSON.parse(raw)), false)
})

test('sin ventana fresca o con ventana amplia se rechaza', () => {
  const legacy = doc({ observation: { scope: 'legacy-import', fromDay: 2000, toDay: 2502, capturedAt: '2026-11-16T20:00:00.000Z' } })
  assert.equal(validObservationInput(legacy), false)
  const wide = doc({ observation: { scope: 'fresh-scan', fromDay: 2400, toDay: 2502, capturedAt: '2026-11-16T20:00:00.000Z' } })
  assert.equal(validObservationInput(wide), false)
})

test('día futuro y precio inválido fail closed', () => {
  const future = doc({ items: [{ sourceKey: '2589', itemId: 2589, unitPriceCopper: 100, observedDay: 9999 }] })
  assert.equal(validObservationInput(future), false)
  const zero = doc({ items: [{ sourceKey: '2589', itemId: 2589, unitPriceCopper: 0, observedDay: 2501 }] })
  assert.equal(validObservationInput(zero), false)
})

test('variante NO se promueve al ID base: itemId solo para clave decimal exacta', () => {
  const variant = doc({ items: [{ sourceKey: '2589:variant:7', itemId: 2589, unitPriceCopper: 100, observedDay: 2501 }] })
  assert.equal(validObservationInput(variant), false)
  const plainNoId = doc({ items: [{ sourceKey: '2589', unitPriceCopper: 100, observedDay: 2501 }] })
  const snap = parseSeparateSourceObservations(JSON.stringify(plainNoId))
  assert.equal(snap.realms[0].items[0].itemId, 2589)
})

test('identidad incompleta o metadatos personales se rechazan', () => {
  const missing = doc({ identity: { ...doc().identity, region: undefined } })
  assert.equal(validObservationInput(missing), false)
  const personal = doc({ identity: { ...doc().identity, localScope: 'WTF/Account/Bob' } })
  assert.equal(validObservationInput(personal), false)
})

test('duplicados ambiguos y mezcla de reinos sin identidad por reino', () => {
  const dup = doc({ items: [
    { sourceKey: '1', itemId: 1, unitPriceCopper: 5, observedDay: 2501 },
    { sourceKey: '1', itemId: 1, unitPriceCopper: 9, observedDay: 2502 },
  ] })
  assert.equal(validObservationInput(dup), false)
  const realms = doc({
    realms: [
      { realm: 'A', items: [{ sourceKey: '1', itemId: 1, unitPriceCopper: 5, observedDay: 2501 }] },
      { realm: 'B', items: [{ sourceKey: '1', itemId: 1, unitPriceCopper: 7, observedDay: 2501 }] },
    ],
  })
  const snap = parseSeparateSourceObservations(JSON.stringify(realms))
  assert.equal(snap.realms.length, 2)
  assert.notEqual(snap.realms[0].identity.rawSourceKey, snap.realms[1].identity.rawSourceKey)
})
