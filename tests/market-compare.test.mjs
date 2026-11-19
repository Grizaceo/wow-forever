// Motor de comparación puro: unión por sourceKey exacto, precio por unidad,
// neto solo con comisión verificada, sin inferencias de liquidez.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import Identity from '../standalone/market-identity.js'
import HunterCompare from '../standalone/market-compare.js'
const { accreditedIdentity } = Identity
const { compare } = HunterCompare

const id = (channel, over = {}) => accreditedIdentity({
  game: 'wow-forever', region: 'us', ruleset: 'PvE', auctionPool: channel === 'neutral' ? 'pool-B' : 'pool-A',
  postingChannel: channel, localScope: 'local:scope-1', rawSourceKey: 'Realm-AA',
  fromDay: 2500, toDay: 2502, sourceLabel: 'observación aislada', verifiedAt: '2026-11-16T20:00:00.000Z',
  ...over,
})
const row = (sourceKey, unitPriceCopper, observedDay, over = {}) => ({
  sourceKey, itemId: /^\d+$/.test(sourceKey) ? Number(sourceKey) : null,
  unitPriceCopper, observedDay, available: 4, confirmed: true,
  coverage: { itemRows: 10, scannedRows: 100 }, ...over,
})
const pool = (id_, identity, rows, over = {}) => ({ id: id_, identity, rows, ...over })
const rate = (bps, verified = true) => ({ rateBps: bps, verified, sourceLabel: 'tarifa observada', asOfDay: 2500 })
const OPT = { todayDay: 2502, commission: { capital: rate(500), neutral: rate(1500) } }

test('pools compatibles: unión por sourceKey, delta en cobre, neto con comisión verificada', () => {
  const r = compare([
    pool('A', id('capital'), [row('2589', 1000, 2502)]),
    pool('B', id('neutral'), [row('2589', 1200, 2502)]),
  ], OPT)
  assert.equal(r.status, 'comparable')
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0].sourceKey, '2589')
  assert.equal(r.rows[0].a.netCopper, 950)
  assert.equal(r.rows[0].b.netCopper, 1020)
  assert.equal(r.rows[0].deltaCopper, 70)
  assert.equal(r.rows[0].netScenario, false)
})

test('un solo pool con dos canales: una serie de precios, solo escenarios de comisión', () => {
  const r = compare([pool('A', id('capital'), [row('2589', 1000, 2502)], {
    alternateChannel: { channel: 'neutral', commission: rate(1500) },
  })], OPT)
  assert.equal(r.status, 'single-pool')
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0].grossCopper, 1000)
  assert.equal(r.rows[0].netScenario, true)
  assert.equal(r.rows[0].recommendation, null)
  assert.equal(r.rows[0].channels.length, 2)
  assert.equal(r.rows[0].channels[0].netCopper, 950)
  assert.equal(r.rows[0].channels[1].netCopper, 850)
})

test('pools incompatibles o procedencia desconocida: bloqueo sin filas', () => {
  const unknown = { ...id('capital'), provenance: { ...id('capital').provenance, confidence: 'unknown' } }
  for (const p of [
    [pool('A', id('capital'), [row('1', 5, 2502)]), pool('B', id('neutral', { region: 'eu' }), [row('1', 6, 2502)])],
    [pool('A', unknown, [row('1', 5, 2502)]), pool('B', id('neutral'), [row('1', 6, 2502)])],
  ]) {
    const r = compare(p, OPT)
    assert.equal(r.status, 'blocked')
    assert.equal(r.rows.length, 0)
    assert.ok(r.reasons.length >= 1)
  }
})

test('fecha futura y fecha obsoleta: futuro bloquea, obsoleto se marca', () => {
  const future = compare([
    pool('A', id('capital'), [row('1', 5, 9999)]), pool('B', id('neutral'), [row('1', 6, 2502)]),
  ], OPT)
  assert.equal(future.status, 'blocked')
  assert.match(future.reasons.join(' '), /future/)
  const stale = compare([
    pool('A', id('capital'), [row('1', 5, 2480)]), pool('B', id('neutral'), [row('1', 6, 2480)]),
  ], { ...OPT, freshDays: 3 })
  assert.equal(stale.status, 'comparable')
  assert.equal(stale.rows[0].a.stale, true)
  assert.equal(stale.rows[0].recommendation, null)
})

test('sesgo excesivo bloquea recomendación con reloj fijo', () => {
  const r = compare([
    pool('A', id('capital'), [row('1', 100, 2502)]), pool('B', id('neutral'), [row('1', 1000, 2502)]),
  ], { ...OPT, skewMax: 2 })
  assert.equal(r.status, 'blocked')
  assert.match(r.reasons.join(' '), /skew/)
})

test('variantes: sourceKey exacto, base y variante nunca se fusionan', () => {
  const r = compare([
    pool('A', id('capital'), [row('2589', 1000, 2502), row('2589:variant:7', 900, 2502)]),
    pool('B', id('neutral'), [row('2589', 1200, 2502)]),
  ], OPT)
  assert.equal(r.status, 'comparable')
  assert.equal(r.rows.length, 2)
  const variant = r.rows.find((x) => x.sourceKey === '2589:variant:7')
  assert.equal(variant.itemId, null)
  assert.equal(variant.b, null)
  assert.equal(variant.deltaCopper, null)
  assert.equal(variant.recommendation, null)
})

test('comisión no verificada: neto es escenario explícito, nunca recomendación de beneficio', () => {
  const r = compare([
    pool('A', id('capital'), [row('1', 1000, 2502)]),
    pool('B', id('neutral'), [row('1', 1100, 2502)]),
  ], { ...OPT, commission: { capital: rate(500), neutral: rate(1500, false) } })
  assert.equal(r.rows[0].netScenario, true)
  assert.equal(r.rows[0].recommendation, null)
  assert.match(r.rows[0].reasons.join(' '), /commission/)
})

test('comisión ausente: se compara bruto y se marca escenario', () => {
  const r = compare([
    pool('A', id('capital'), [row('1', 1000, 2502)]), pool('B', id('neutral'), [row('1', 1100, 2502)]),
  ], { todayDay: 2502 })
  assert.equal(r.rows[0].netScenario, true)
  assert.equal(r.rows[0].deltaCopper, 100)
  assert.equal(r.rows[0].a.netCopper, null)
})

test('cobre seguro: desbordamiento y precio inválido no producen float ni crash', () => {
  const over = compare([
    pool('A', id('capital'), [row('1', Number.MAX_SAFE_INTEGER, 2502)]),
    pool('B', id('neutral'), [row('1', 10, 2502)]),
  ], { ...OPT, skewMax: 1e15 })
  assert.equal(over.rows[0].netScenario, true)
  assert.ok(over.rows[0].reasons.some((x) => /overflow|超限|overflow/i.test(x)))
  const bad = compare([
    pool('A', id('capital'), [row('1', 0, 2502)]), pool('B', id('neutral'), [row('1', 10, 2502)]),
  ], OPT)
  assert.equal(bad.status, 'blocked')
  assert.match(bad.reasons.join(' '), /price/)
})

test('empate: delta 0 sin recomendación; cantidad publicada no implica liquidez', () => {
  const r = compare([
    pool('A', id('capital'), [row('1', 1000, 2502, { available: 200 })]),
    pool('B', id('neutral'), [row('1', 1000, 2502, { available: 1 })]),
  ], { ...OPT, commission: { capital: rate(500), neutral: rate(500) } })
  assert.equal(r.rows[0].deltaCopper, 0)
  assert.equal(r.rows[0].recommendation, null)
  assert.equal(r.rows[0].a.available, 200)
  assert.equal(r.rows[0].b.available, 1)
  assert.equal(r.liquidityClaim, null)
})
