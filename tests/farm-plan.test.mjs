// node --test tests/farm-plan.test.mjs — motor de farmeo v2 (standalone/farm-plan.js).
// Dataset schema 2 sintético y precios a mano: verifica fórmulas, topes de venta
// compartidos y el planificador. Ningún número pretende calibración del juego.
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const TODAY = Math.floor((Date.now() - Date.UTC(2020, 0, 1)) / 86400000)
const fresh = () => {
  const p = require.resolve('../standalone/farm-plan.js')
  delete require.cache[p]
  return require('../standalone/farm-plan.js')
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))

// Zona 1 "Badlands" (contested) y zona 2 "Durotar" (horde).
// Mob 10: elemental de aire (100 % ítem 900, sin monedas). Mob 20: bestia variada.
// Mob 30: humanoide con monedas. Mob 40: nivel alto (no elegible a nivel 40).
function dataset(over = {}) {
  return {
    schemaVersion: 2,
    zones: { '1': ['Badlands', 'ek', 'contested', 35, 45], '2': ['Durotar', 'kalimdor', 'horde', 1, 10] },
    mobs: {
      '10': ['Aire', 39, 40, 'normal', '1', 10, 300, 'ah'],
      '20': ['Bestia', 39, 40, 'normal', '1', 10, 300, 'ah'],
      '30': ['Humano', 39, 40, 'normal', '2', 10, 300, 'ah'],
      '40': ['Gigante', 50, 50, 'normal', '1', 10, 300, 'ah'],
    },
    mobX: {
      '10': [1600, 0, 4, 0, 30, 0],
      '20': [1600, 0, 1, 20, 30, 1],
      '30': [1600, 80, 7, 40, 30, 0],
      '40': [5000, 0, 5, 0, 30, 0],
    },
    items: {
      '900': ['Aire Elemental', 1, 7, 0, 0, 0, 30, 0, -1, 400, [['m', 10, 100, 1, 1]]],
      '901': ['Colmillo', 0, 15, 0, 0, 0, 30, 0, -1, 300, [['m', 20, 100, 1, 1]]],
      '902': ['Cuero', 1, 7, 0, 0, 0, 30, 0, -1, 50, [['s', 20, 100, 1, 1]]],
      '903': ['Seda', 1, 7, 0, 0, 0, 30, 0, -1, 100, []],
    },
    mobLoot: { '30': [903, 5000, 10] },        // 50 % Seda: fuera del índice con tope
    skinLoot: { '20': [902, 10000, 10] },
    itemStack: { '900': 10, '902': 20, '903': 20 },
    camps: [
      ['1', 500, 500, 30, [[10, 5], [20, 5]]],   // mezcla aire + bestia
      ['1', 200, 200, 30, [[40, 6], [20, 2]]],   // casi todo no elegible
    ],
    objects: {},
    ...over,
  }
}
const profile = (o = {}) => ({ level: 40, fac: 'horde', cls: 'hunter', prof: { skin: false }, ...o })
const hist = (itemId, lows, available) => ({
  itemId, unitPriceCopper: lows.at(-1), observedDay: TODAY,
  history: lows.map((low, i) => ({ day: TODAY - (lows.length - 1 - i), low, high: low, available })),
})

test('marketModel: mediana y cuartiles de la ventana; ≤5 ofertas = delgado', () => {
  const P = fresh()
  const m = P.marketModel([hist(900, [100, 200, 300, 400, 5000], 50), hist(901, [1000], 3)])
  assert.equal(m.get(900).price, 300)
  assert.equal(m.get(900).p25, 200)
  assert.equal(m.get(900).p75, 400)
  assert.equal(m.get(900).thin, false)
  assert.equal(m.get(901).thin, true)
  const viejo = { ...hist(900, [100], 50), history: [{ day: TODAY - 40, low: 1, high: 1, available: 50 }, { day: TODAY, low: 100, high: 100, available: 50 }] }
  assert.equal(P.marketModel([viejo]).get(900).price, 100, 'los días fuera de la ventana no cuentan')
})

test('sellCaps: ventas propias mandan; si no κ × ofertas; delgado → 0', () => {
  const P = fresh()
  const market = P.marketModel([hist(900, [500], 400), hist(901, [500], 3), hist(902, [500], 400)])
  const caps = P.sellCaps(market, new Map([[902, { perDay: 33, events: 12 }], [900, { perDay: 99, events: 1 }]]), { kappa: 0.05 })
  assert.equal(caps.get(902).units, 33)
  assert.equal(caps.get(902).basis, 'ventas-propias')
  assert.equal(caps.get(900).units, 20, 'con <3 ventas se ignora el historial propio')
  assert.equal(caps.get(900).basis, 'kappa-ofertas')
  assert.equal(caps.get(901).units, 0)
  assert.equal(caps.get(901).basis, 'mercado-delgado')
})

test('softRate: mínimo suave entre ciclo y respawn', () => {
  const P = fresh()
  assert.ok(near(P.softRate(100, 100), 100 / Math.SQRT2))
  assert.ok(P.softRate(100, 10000) < 100 && P.softRate(100, 10000) > 99.9)
  assert.ok(P.softRate(10000, 50) < 50 && P.softRate(10000, 50) > 49.9)
  assert.equal(P.softRate(100, 0), 0)
})

test('ritmo físico: más distancia, más vida o menos DPS → menos muertes/h', () => {
  const P = fresh()
  P.configure({ HunterDropData: dataset() })
  const solo = ctx => P.farms(ctx).find(f => f.id === 't10')
  const base = solo({ profile: profile() })
  P._reset(); P.configure({ HunterDropData: dataset({ mobX: { ...dataset().mobX, '10': [1600, 0, 4, 0, 300, 0] } }) })
  const lejos = solo({ profile: profile() })
  assert.ok(lejos.rate < base.rate)
  P._reset(); P.configure({ HunterDropData: dataset() })
  const lento = solo({ profile: profile(), style: { dpsK: 1 } })
  assert.ok(lento.rate < base.rate)
  assert.ok(near(base.fightSec, 1600 / 80))
  assert.ok(near(lento.fightSec, 1600 / 40))
})

test('valor por muerte: monedas + botín compartido + mobLoot; desuello solo con la profesión', () => {
  const P = fresh()
  P.configure({ HunterDropData: dataset() })
  const ctxSin = { profile: profile(), market: new Map(), caps: new Map() }
  const humano = P.farms(ctxSin).find(f => f.id === 't30')
  assert.equal(humano.coins, 80)
  assert.equal(humano.rest, 40)
  assert.ok(near(humano.units.get(903), 0.5), 'la seda llega por mobLoot aunque items[].sources esté vacío')
  const bestia = P.farms(ctxSin).find(f => f.id === 't20')
  assert.equal(bestia.units.has(902), false)
  P._reset(); P.configure({ HunterDropData: dataset() })
  const conPiel = P.farms({ profile: profile({ prof: { skin: true } }) }).find(f => f.id === 't20')
  assert.ok(near(conPiel.units.get(902), 1))
  assert.ok(conPiel.handleSec > bestia.handleSec, 'desollar cuesta tiempo')
})

test('elegibilidad: mobs muy altos fuera; campamento con <80 % elegible fuera', () => {
  const P = fresh()
  P.configure({ HunterDropData: dataset() })
  const ids = P.farms({ profile: profile() }).map(f => f.id)
  assert.ok(!ids.includes('t40'))
  assert.ok(ids.includes('c0'))
  assert.ok(!ids.includes('c1'))
})

test('tope de venta compartido: dos campamentos con el mismo ítem se reparten el cupo', () => {
  const P = fresh()
  P.configure({ HunterDropData: dataset() })
  const market = P.marketModel([hist(900, [10000], 100)])
  const caps = new Map([[900, { units: 5, basis: 'kappa-ofertas' }]])
  const ctx = { profile: profile(), market, caps, settings: { pvp: false } }
  const list = P.farms(ctx).filter(f => f.id === 't10' || f.id === 'c0')
  const a = P.hourly(list[0], ctx).gold, b = P.hourly(list[1], ctx).gold
  const r = P.plan(ctx, { hours: 1 })
  assert.ok(r.best.gold < a + b, 'el cupo de 5 unidades no se duplica')
  const ahUnits = r.best.top.find(t => t.itemId === 900)?.ahUnits ?? 0
  assert.ok(ahUnits <= 5 + 1e-9)
})

test('escenario Elemental Air: sin tope gana el aire; con tope chico gana lo variado', () => {
  const P = fresh()
  P.configure({ HunterDropData: dataset() })
  const market = P.marketModel([hist(900, [3500], 500), hist(901, [2000], 500)])
  const run = kappa => {
    P._reset(); P.configure({ HunterDropData: dataset() })
    const ctx = { profile: profile(), market, caps: P.sellCaps(market, null, { kappa }), settings: { pvp: false } }
    return P.ranking(ctx, 5)
  }
  assert.equal(run(10)[0].id, 't10', 'sin tope efectivo, el aire (100 % de drop, 3500 c) es lo mejor')
  const conTope = run(0.01)
  assert.notEqual(conTope[0].id, 't10', 'con 5 unidades vendibles, el aire pierde frente a la bestia variada')
})

test('plan: respeta las horas incluyendo el viaje y entrega rango y aportes', () => {
  const P = fresh()
  P.configure({ HunterDropData: dataset() })
  const market = P.marketModel([hist(900, [3500], 500), hist(901, [2000], 500), hist(903, [500], 500)])
  const ctx = { profile: profile(), market, caps: P.sellCaps(market, null, { kappa: 0.05 }), settings: { pvp: false } }
  const r = P.plan(ctx, { hours: 2 })
  const mins = r.best.legs.reduce((s, l) => s + l.minutes, 0)
  assert.ok(mins + r.best.travelMin + r.best.bagTripMin <= 120)
  assert.ok(r.best.low <= r.best.gph && r.best.gph <= r.best.high)
  assert.ok(r.best.top.length > 0)
  assert.ok(r.best.legs.every(l => l.farm.zoneKey && l.farm.names.length))
})

test('plan: los viajes al vendedor por bolsas llenas salen del tiempo de la sesión', () => {
  const P = fresh()
  P.configure({ HunterDropData: dataset() })
  const market = P.marketModel([hist(900, [3500], 500), hist(901, [2000], 500), hist(903, [500], 500)])
  const ctx = { profile: profile(), market, caps: P.sellCaps(market, null, { kappa: 0.05 }), settings: { pvp: false },
    style: { ...P.STYLE_DEFAULT, bagFree: 3 } }
  const r = P.plan(ctx, { hours: 2 })
  assert.ok(r.best.bagTrips > 0, 'con 3 casillas libres las bolsas se llenan')
  const mins = r.best.legs.reduce((s, l) => s + l.minutes, 0)
  assert.ok(mins + r.best.travelMin + r.best.bagTripMin <= 120, `farmeo ${mins} + traslado ${r.best.travelMin} + vendedor ${r.best.bagTripMin} min caben en 2 h`)
  assert.ok(near(r.best.gph, r.best.gold / 2), 'oro/h = oro del plan / horas de sesión')
})

test('munición: solo el cazador la paga', () => {
  const P = fresh()
  P.configure({ HunterDropData: dataset() })
  const market = new Map()
  const f = P.farms({ profile: profile() }).find(x => x.id === 't30')
  const caz = P.hourly(f, { profile: profile(), market, caps: new Map() })
  const gue = P.hourly(f, { profile: profile({ cls: 'warrior' }), market, caps: new Map() })
  assert.ok(caz.ammo > 0)
  assert.equal(gue.ammo, 0)
  assert.ok(near(gue.gold - caz.gold, caz.ammo))
})

test('itemFarms: campamentos donde cae el ítem, con su parte del oro', () => {
  const P = fresh()
  P.configure({ HunterDropData: dataset() })
  const market = P.marketModel([hist(900, [3500], 500), hist(901, [2000], 500)])
  const ctx = { profile: profile(), market, caps: P.sellCaps(market, null, { kappa: 1 }), settings: { pvp: false } }
  const r = P.itemFarms(900, ctx)
  assert.deepEqual(r.map(f => f.id).sort(), ['c0', 't10'])
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].gph >= r[i].gph)
  const solo = r.find(f => f.id === 't10'), mezcla = r.find(f => f.id === 'c0')
  assert.ok(solo.itemShare > 0.99)
  assert.ok(mezcla.itemShare < solo.itemShare)
})

test('itemIndex: cada ítem se describe una sola vez (la tabla llama get por fila al ordenar)', () => {
  const P = fresh()
  P.configure({ HunterDropData: dataset() })
  const market = P.marketModel([hist(900, [3500], 500), hist(901, [2000], 500)])
  const ctx = { profile: profile(), market, caps: P.sellCaps(market, null, { kappa: 1 }), settings: { pvp: false }, cacheKey: 'memo' }
  const idx = P.itemIndex(ctx)
  const a = idx.get(900), b = idx.get('900')
  assert.ok(a.length > 0)
  assert.equal(a, b, 'la segunda consulta devuelve el mismo resultado sin recalcular')
  assert.deepEqual(idx.get(12345), [])
})

test('sin dataset schema 2 el motor no inventa campamentos', () => {
  const P = fresh()
  P.configure({ HunterDropData: { ...dataset(), schemaVersion: 1 } })
  assert.deepEqual(P.farms({ profile: profile() }), [])
  assert.equal(P.plan({ profile: profile(), market: new Map(), caps: new Map() }), null)
})

test('evaluate: ranking, cada mob elegible farmeado solo y los precios que explican su valor', () => {
  const P = fresh()
  P.configure({ HunterDropData: dataset() })
  const market = P.marketModel([hist(900, [3000, 3500, 3200], 500), hist(901, [2000], 500)])
  const ctx = { profile: profile(), market, caps: P.sellCaps(market, null, { kappa: 0.05 }), settings: { pvp: false } }
  const ev = P.evaluate(ctx)
  assert.deepEqual(ev.mobs.map(m => m.name).sort(), ['Aire', 'Bestia', 'Humano'], 'el Gigante (nv 50) no es elegible')
  assert.equal(ev.totalMobs, 3)
  assert.deepEqual(ev.mobs.map(m => m.pos), [1, 2, 3])
  for (let i = 1; i < ev.mobs.length; i++) assert.ok(ev.mobs[i - 1].gph >= ev.mobs[i].gph, 'ordenado por oro/h')
  const aire = ev.mobs.find(m => m.npcId === 10)
  assert.deepEqual(aire.lvl, [39, 40])
  assert.equal(aire.kind, 'target')
  assert.ok(ev.ranking.length >= ev.mobs.length, 'el ranking también trae el campamento mixto')
  for (const d of [...ev.ranking, ...ev.mobs]) for (const t of d.top) assert.ok(ev.items.has(t.itemId), `precio de ${t.itemId}`)
  const p = ev.items.get(900)
  assert.equal(p.price, 3200, 'mediana de los mínimos diarios')
  assert.equal(p.last, 3200, 'el último mínimo se informa aparte')
  assert.equal(p.capBasis, 'kappa-ofertas'); assert.ok(near(p.capUnits, 25))
  assert.equal(p.vendor, 400)
  const top = aire.top.find(t => t.itemId === 900)
  assert.ok(top.ahUnits <= 25 + 1e-9 && top.units >= top.ahUnits, 'unidades a subasta limitadas por el tope')
  const corto = P.evaluate(ctx, { ranking: 1, mobs: 1 })
  assert.equal(corto.ranking.length, 1); assert.equal(corto.mobs.length, 1); assert.equal(corto.totalMobs, 3)
})

test('evaluate: sin dataset schema 2 no inventa nada', () => {
  const P = fresh()
  P.configure({ HunterDropData: { schemaVersion: 1 } })
  const ev = P.evaluate({ profile: profile(), market: new Map(), caps: new Map(), settings: {} })
  assert.deepEqual([ev.ranking.length, ev.mobs.length, ev.totalMobs, ev.items.size], [0, 0, 0, 0])
})

test('goal: horas hasta la meta con el oro/h central y el rango del plan', () => {
  const P = fresh()
  const best = { gph: 100000, low: 80000, high: 125000 }          // 10 o/h (8–12,5)
  const g = P.goal(best, 1000000, 400000)                          // meta 100 o, tiene 40 o
  assert.equal(g.falta, 600000)
  assert.ok(near(g.horas, 6)); assert.ok(near(g.horasMin, 4.8)); assert.ok(near(g.horasMax, 7.5))
  assert.equal(P.goal(best, 1000000, 2000000).horas, 0, 'meta ya alcanzada')
  assert.equal(P.goal(best, 0, 0), null, 'sin meta')
  assert.equal(P.goal(null, 1000000, 0), null, 'sin plan')
  assert.equal(P.goal({ gph: 0, low: 0, high: 0 }, 1000000, 0).horas, null, 'un plan que no rinde no da horas')
})

test('describe: avisa cuando un solo ítem sostiene ≥ 80 % del oro', () => {
  const P = fresh()
  P.configure({ HunterDropData: dataset() })
  const market = P.marketModel([hist(900, [3500], 500), hist(901, [2000], 500)])
  const ctx = { profile: profile(), market, caps: P.sellCaps(market, null, { kappa: 10 }), settings: { pvp: false } }
  const ev = P.evaluate(ctx)
  const aire = ev.mobs.find(m => m.npcId === 10)
  assert.equal(aire.concentrated.itemId, 900, 'el aire es 100 % un ítem')
  assert.ok(aire.concentrated.share >= P.CONC_SHARE)
  const mixto = ev.ranking.find(d => d.kind === 'clear')
  assert.ok(mixto.top[0].share < P.CONC_SHARE ? mixto.concentrated === null : mixto.concentrated !== null, 'coherente con su reparto')
})
