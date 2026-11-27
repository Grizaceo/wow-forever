'use strict'

// Regresión del motor v2 (farm-plan.js) sobre el dataset CMaNGOS schema 2 real.
// Los precios son escenarios declarados, no ventas ni drops observados en Forever.
const test = require('node:test')
const assert = require('node:assert/strict')
const Drops = require('../drop-data.js')
const P = require('../farm-plan.js')

P.configure({ HunterDropData: Drops })
const TODAY = Math.floor((Date.now() - Date.UTC(2020, 0, 1)) / 86400000)
const obs = (itemId, low, available) => ({ itemId, unitPriceCopper: low, observedDay: TODAY,
  history: [{ day: TODAY, low, high: low, available }] })
const profile = { level: 38, fac: 'horde', cls: 'hunter', prof: { skin: false } }
const AIR = 7069

test('Whirlwind Ripper disperso rinde menos muertes/h que Shredder agrupado', () => {
  P._reset(); P.configure({ HunterDropData: Drops })
  const fs = P.farms({ profile })
  const ripper = fs.find(f => f.id === 't11576'), shredder = fs.find(f => f.id === 't11578')
  assert.ok(ripper && shredder)
  assert.ok(ripper.nnYards > 3 * shredder.nnYards)
  assert.ok(ripper.rate < 0.7 * shredder.rate)
})

test('los élites del evento de AQ no generan campamentos', () => {
  P._reset(); P.configure({ HunterDropData: Drops })
  const fs = P.farms({ profile: { ...profile, level: 40 } })
  assert.ok(!fs.some(f => f.members.some(m => m.npcId === 15748)))
})

test('Elemental Air: el tope de venta recorta el valor de los campamentos de aire', () => {
  P._reset(); P.configure({ HunterDropData: Drops })
  const market = P.marketModel([obs(AIR, 3500, 500)])
  const best = kappa => P.itemFarms(AIR, { profile, market, caps: P.sellCaps(market, null, { kappa }), settings: { pvp: true } })[0]
  const libre = best(10), chico = best(0.02)
  assert.match(libre.zone, /Desolace/)
  assert.ok(libre.itemShare > 0.8)
  assert.ok(chico.gph < 0.6 * libre.gph, `${chico.gph} vs ${libre.gph}`)
})

test('plan real de 2 h: tramos dentro del presupuesto, con rango y zonas conocidas', () => {
  P._reset(); P.configure({ HunterDropData: Drops })
  const market = P.marketModel([obs(AIR, 3500, 500), obs(4234, 200, 9000), obs(4304, 500, 9000)])
  const ctx = { profile: { ...profile, level: 40, prof: { skin: true } }, market,
    caps: P.sellCaps(market, null, { kappa: 0.05 }), settings: { pvp: true } }
  const r = P.plan(ctx, { hours: 2 })
  assert.ok(r && r.best.legs.length >= 1)
  assert.ok(r.best.legs.reduce((s, l) => s + l.minutes, 0) + r.best.travelMin <= 120)
  assert.ok(r.best.gph > 0 && r.best.low < r.best.gph && r.best.gph < r.best.high)
  for (const z of r.best.zones) assert.ok(Drops.zones[z.zoneKey])
})
