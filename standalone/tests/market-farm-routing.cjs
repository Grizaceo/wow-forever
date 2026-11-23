'use strict'

// Regresión del caso real Horda: Elemental Air en Desolace frente a Magic
// Dust en Westfall. Usa el dataset CMaNGOS local; los precios son escenarios
// declarados, no una afirmación sobre ventas o drops observados en Forever.
const test = require('node:test')
const assert = require('node:assert/strict')
const Drops = require('../drop-data.js')
const Farm = require('../market-farm.js')

Farm.configure({ HunterDropData: Drops, HunterDropDataPrivate: null, HunterMarketCatalog: { items: {} } })

const PROFILE = { level: 38, fac: 'horde', cls: 'hunter', hubZones: [] }
const SETTINGS = { gph: 5, session: 2, comp: 'low', pvp: true, prof: {}, n: 5 }
const PRICE = { 2091: 17100, 7069: 3999 }
const metric = (id, settings = SETTINGS) => Farm.itemMetrics({
  itemId: id,
  unitPriceCopper: PRICE[id],
  observedDay: 0,
  history: [{ day: 0, low: PRICE[id], high: PRICE[id], available: 20 }],
}, PROFILE, settings)
const close = (actual, expected, epsilon = 1e-7) => {
  assert.ok(Number.isFinite(actual), `valor no finito: ${actual}`)
  assert.ok(Math.abs(actual - expected) <= epsilon * Math.max(1, Math.abs(expected)),
    `${actual} ≠ ${expected}`)
}

test('Desolace reconoce el vuelo Horda de Shadowprey Village', () => {
  const travel = Farm.travelFor('Desolace', 'horde', [], 2)
  assert.equal(travel.fp, true)
  assert.equal(travel.min, 22)
  close(travel.factor, 2 / (2 + 22 / 60)) // fp corrige etiqueta; no recalibra minutos
})

test('el oro/h objetivo usa 10000 cobre por oro y la ruta completa', () => {
  const { best } = metric(2091)
  assert.ok(best)
  const expectedFactor = best.travel.factor * best.risk.mult // competencia low = 1
  const expectedDenom = best.K * best.u * expectedFactor
  close(best.routeFactor, expectedFactor)
  close(best.denom, expectedDenom)
  close(best.farmCostPerUnit, (5 * 10000) / expectedDenom)
  close(best.roi, (PRICE[2091] * 0.95 - best.farmCostPerUnit) / best.farmCostPerUnit)
  close(best.gph, PRICE[2091] * 0.95 * expectedDenom)
  assert.ok(best.gph < best.campGph, 'el viaje y el riesgo no pueden aumentar el bruto del campamento')
})

test('los campamentos alternativos aportan disponibilidad, no drops paralelos', () => {
  const { best } = metric(7069)
  assert.ok(best)
  assert.equal(best.routeCamps.length, 3)
  assert.equal(best.alternativeCamps, 2)
  assert.equal(best.spawnTotal, 37)
  assert.deepEqual(best.routeCamps.map(c => String(c.id)).sort(), ['11576', '11577', '11578'])
  assert.equal(best.campGph, Math.max(...best.routeCamps.map(c => c.campGph)))
  assert.ok(best.routeCamps.reduce((sum, c) => sum + c.campGph, 0) > best.campGph,
    'el test necesita alternativas reales para detectar una suma paralela')
})

test('la densidad sigue limitada por spawns y respawn', () => {
  const { best } = metric(7069)
  assert.ok(best.K <= best.spawns * 3600 / Math.max(best.respawnSec || 60, 60))
  assert.equal(best.spawnTotal, 37) // contexto de ruta; no reemplaza el límite físico del campamento
})

test('con PvP activo Elemental Air supera el margen de Magic Dust', () => {
  const air = metric(7069)
  const dust = metric(2091)
  assert.ok(air.best.travel.min < dust.best.travel.min)
  assert.ok(air.roi > dust.roi, `Air ${air.roi} debería superar Dust ${dust.roi}`)
  assert.equal(air.best.zoneKey, Drops.mobs['11578'][4])
  assert.equal(dust.best.zoneKey, Drops.mobs['832'][4])
})

test('competencia media/alta se descuenta exactamente una vez y zoneComp prevalece', () => {
  const base = metric(7069)
  for (const [comp, factor] of [['low', 1], ['med', 0.75], ['high', 0.45]]) {
    const result = metric(7069, { ...SETTINGS, comp })
    for (const s of result.sources.filter(s => s.eligible)) {
      const original = base.sources.find(b => b.id === s.id && b.kind === s.kind && b.zoneKey === s.zoneKey)
      close(s.gph, original.gph * factor)
      close(s.routeFactor, original.routeFactor * factor)
      close(s.farmCostPerUnit, original.farmCostPerUnit / factor)
    }
  }
  const zk = base.best.zoneKey
  const override = metric(7069, { ...SETTINGS, zoneComp: { [zk]: 'high' } })
  for (const s of override.sources.filter(s => s.eligible)) {
    const original = base.sources.find(b => b.id === s.id && b.kind === s.kind && b.zoneKey === s.zoneKey)
    close(s.gph, original.gph * (s.zoneKey === zk ? 0.45 : 1))
  }
})

test('duplicar objetivo oro/h duplica coste, no producción', () => {
  const base = metric(7069).best
  const twice = metric(7069, { ...SETTINGS, gph: 10 }).best
  close(twice.gph, base.gph)
  close(twice.farmCostPerUnit, 2 * base.farmCostPerUnit)
  close(twice.roi + 1, (base.roi + 1) / 2)
})

test('resumen y fuentes comparten ganador; tampoco se suman zonas', () => {
  for (const comp of ['low', 'med', 'high']) {
    const m = metric(7069, { ...SETTINGS, comp })
    assert.strictEqual(m.best, m.sources[0])
    const eligible = m.sources.filter(s => s.eligible)
    close(m.gph, Math.max(...eligible.map(s => s.gph)))
    assert.ok(m.gph < eligible.reduce((sum, s) => sum + s.gph, 0))
  }
})

test('desactivar PvP retira el riesgo sin fingir el mismo veredicto', () => {
  const settings = { ...SETTINGS, pvp: false }
  const air = metric(7069, settings)
  const dust = metric(2091, settings)
  close(air.best.routeFactor, air.best.travel.factor)
  close(dust.best.routeFactor, dust.best.travel.factor)
  assert.ok(dust.roi > air.roi, 'sin penalización PvP este escenario conserva otra preferencia')
})
