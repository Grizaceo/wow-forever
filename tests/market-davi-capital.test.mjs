// Contrato DAVI para capital/neutral: el contexto de comparación es una
// allowlist de datos confirmados; nunca afirma liquidez ni beneficio.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import Identity from '../standalone/market-identity.js'
import Compare from '../standalone/market-compare.js'
import { construirContextoComparacionCapitalNeutral } from '../desktop/src/davi.js'

const meta = (channel) => Identity.accreditedIdentity({
  game: 'wow-forever', region: 'us', ruleset: 'PvE', auctionPool: channel==='capital'?'pool-A':'pool-B',
  postingChannel: channel, localScope: 'local:verified', rawSourceKey: 'Realm-A',
  fromDay: 2501, toDay: 2502, sourceLabel: 'aislada', verifiedAt: '2026-11-16T20:00:00.000Z',
})
const rate = bps => ({ rateBps: bps, verified: true, sourceLabel: 'tarifa observada', asOfDay: 2501 })
const row = (key, price, day) => ({ sourceKey: key, itemId: Number(key), unitPriceCopper: price, observedDay: day, confirmed: true, coverage: { itemRows: 10, scannedRows: 100 } })

test('contexto de comparación verificada: solo datos confirmados y sin reclamo de liquidez', () => {
  const r = Compare.compare([
    { id: 'capital', identity: meta('capital'), rows: [row('2589', 100, 2502)] },
    { id: 'neutral', identity: meta('neutral'), rows: [row('2589', 120, 2502)] },
  ], { todayDay: 2503, commission: { capital: rate(500), neutral: rate(500) } })
  const ctx = construirContextoComparacionCapitalNeutral({ resultado: r })
  assert.equal(ctx.status, 'comparable')
  assert.equal(ctx.partes.filas.length, 1)
  assert.equal(ctx.partes.filas[0].sourceKey, '2589')
  assert.equal(ctx.partes.filas[0].deltaCopper, 19)
  assert.equal(ctx.partes.filas[0].netScenario, false)
  assert.equal(ctx.liquidityClaim, null)
  assert.ok(ctx.limites.some(l => /liquidez|beneficio/i.test(l)))
  assert.equal(ctx.procedencia.length, 2)
})

test('comparación bloqueada: contexto fail-closed con razón, sin filas', () => {
  const u = Identity.unknownIdentity('Realm-A')
  const r = Compare.compare([
    { id: 'a', identity: u, rows: [row('2589', 100, 2502)] },
    { id: 'b', identity: u, rows: [row('2589', 120, 2502)] },
  ], { todayDay: 2503 })
  const ctx = construirContextoComparacionCapitalNeutral({ resultado: r })
  assert.equal(ctx.status, 'blocked')
  assert.equal(ctx.partes.filas.length, 0)
  assert.match(ctx.reason, /unknown|procedencia/i)
})

test('sin comisión verificada: el delta se marca como escenario, nunca recomendación', () => {
  const r = Compare.compare([
    { id: 'capital', identity: meta('capital'), rows: [row('2589', 100, 2502)] },
    { id: 'neutral', identity: meta('neutral'), rows: [row('2589', 120, 2502)] },
  ], { todayDay: 2503 })
  const ctx = construirContextoComparacionCapitalNeutral({ resultado: r })
  assert.equal(ctx.partes.filas[0].netScenario, true)
  assert.equal(ctx.partes.filas[0].recomendacion, null)
})
