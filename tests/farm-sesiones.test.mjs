// node --test tests/farm-sesiones.test.mjs — sesiones de WoWForeverFarm en el plugin.
// SavedVariables sintético con la forma que escribe el addon; dataset mínimo schema 2.
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import {
  parseFarm, normalizarSesion, fusionarSesiones, metricasSesion, perfilJugador, observados,
  ventasPorDia, exportAgente, FARM_FILE,
} from '../desktop/src/farm-sesiones.js'
const require = createRequire(import.meta.url)
const FarmPlan = require('../standalone/farm-plan.js')

const lua = (s) => new TextEncoder().encode(s)
const DATASET = {
  schemaVersion: 2,
  zones: { '1443': ['Desolace', 'kalimdor', 'contested', 30, 40] },
  mobs: {
    '4127': ['Hiena', 39, 40, 'normal', '1443', 20, 300, 'ah'],
    '11578': ['Torbellino', 39, 40, 'normal', '1443', 13, 300, 'ah'],
  },
  mobX: { '4127': [1600, 0, 1, 10, 20, 1], '11578': [1600, 0, 4, 0, 60, 0] },
  items: {
    '4234': ['Cuero pesado', 1, 7, 0, 0, 0, 30, 0, -1, 60, [['s', 4127, 100, 1, 1]]],
    '7069': ['Aire', 1, 7, 0, 0, 0, 30, 0, -1, 400, [['m', 11578, 80, 1, 1]]],
    '2589': ['Tela', 1, 7, 0, 0, 0, 30, 0, -1, 13, [['m', 4127, 20, 1, 1]]],
  },
  mobLoot: {}, skinLoot: { '4127': [4234, 10000, 10] }, itemStack: {}, camps: [], objects: {},
}
FarmPlan.configure({ HunterDropData: DATASET })

const SV = `WoWForeverFarmDB = {
["version"] = 1,
["sessions"] = {
{
["v"] = 1, ["start"] = 1795500000, ["stop"] = 1795503600, ["level"] = 40, ["class"] = "HUNTER", ["faction"] = "Horde",
["active"] = 3600, ["paused"] = 120, ["combat"] = 1800, ["looting"] = 300, ["fights"] = 80, ["deaths"] = 1,
["kills"] = { [4127] = 60, [11578] = 20, },
["killBy"] = { ["target"] = 70, ["cleu"] = 0, ["loot"] = 10, },
["corpses"] = { [4127] = 55, [11578] = 16, },
["items"] = { [4127] = { [2589] = 12, }, [11578] = { [7069] = 16, }, },
["skins"] = { [4127] = 50, },
["skinItems"] = { [4127] = { [4234] = 50, }, },
["gather"] = {}, ["gatherItems"] = {}, ["other"] = { [999] = 1, },
["money"] = { ["loot"] = 5000, ["merchant"] = 20000, ["other"] = -300, },
["coinsBy"] = { [4127] = 1000, },
["zones"] = { [1443] = 3500, },
["path"] = "1443:50.0,25.0;1443:51.0,25.5",
["ammo"] = { ["start"] = 1000, ["stop"] = 200, }, ["bags"] = { ["start"] = 40, ["stop"] = 12, },
["methods"] = { ["loot"] = true, ["target"] = true, ["cleu"] = false, ["position"] = true, },
}, -- [1]
{ ["v"] = 9, ["start"] = 5, }, -- [2]
"basura", -- [3]
},
["current"] = { ["v"] = 1, ["start"] = 1795600000, ["state"] = "running", ["active"] = 60, ["kills"] = {}, },
["ui"] = { ["shown"] = true, },
}
`

test('parseFarm: normaliza sesiones válidas y separa la abierta', () => {
  assert.equal(FARM_FILE, 'WoWForeverFarm.lua')
  const r = parseFarm(lua(SV))
  assert.equal(r.sessions.length, 1)
  const s = r.sessions[0]
  assert.equal(s.id, 's1795500000')
  assert.equal(s.kills['4127'], 60)
  assert.equal(s.skinItems['4127']['4234'], 50)
  assert.equal(s.money.merchant, 20000)
  assert.deepEqual(s.killBy, { party: 0, died: 0, xp: 0, slain: 0, dies: 0, target: 70, loot: 10, cleu: 0 })
  assert.equal(s.killsAnon, 0); assert.equal(s.travel, 0); assert.deepEqual(s.got, {})
  assert.equal(s.methods.target, true)
  assert.equal(s.methods.cleu, false)
  assert.equal(s.open, false)
  assert.ok(r.current && r.current.open, 'la sesión abierta se informa aparte')
  assert.throws(() => parseFarm(lua('WoWForeverFarmDB = { ["version"] = 2 }')), /versión/)
  assert.throws(() => parseFarm(new Uint8Array(0)), /vacío/)
})

test('normalizarSesion: rechaza campos fuera de rango sin romper', () => {
  assert.equal(normalizarSesion({ v: 1 }), null)
  const s = normalizarSesion({ v: 1, start: 10, stop: 20, active: -5, combat: 999, kills: { '12': 3, 'x': 4, '13': -1 }, path: 'DROP TABLE' })
  assert.equal(s.active, 0)
  assert.equal(s.combat, 0, 'combate nunca supera el tiempo activo')
  assert.deepEqual(s.kills, { '12': 3 })
  assert.equal(s.path, '')
})

test('fusionarSesiones: lo del juego reemplaza y lo podado se conserva', () => {
  const a = { id: 's1', start: 1, active: 10 }, b = { id: 's2', start: 2, active: 20 }
  const b2 = { id: 's2', start: 2, active: 99 }, c = { id: 's3', start: 3 }
  const r = fusionarSesiones([a, b], [b2, c])
  assert.deepEqual(r.map((x) => x.id), ['s1', 's2', 's3'])
  assert.equal(r[1].active, 99)
})

test('metricasSesion: tiempos, ritmo, valor y predicción del motor', () => {
  const s = parseFarm(lua(SV)).sessions[0]
  const m0 = metricasSesion(s, null, DATASET)
  assert.equal(m0.muertes, 80)
  assert.equal(m0.muertesH, 80)
  assert.equal(m0.peleaS, 1800 / 80)
  assert.equal(m0.saqueoS, 300 / (71 + 50))
  assert.equal(m0.combatePct, 0.5)
  assert.equal(m0.monedas, 5000)
  assert.equal(m0.valorVendedor, 12 * 13 + 16 * 400 + 50 * 60, 'ítem sin dataset vale 0')
  assert.equal(m0.zona, '1443')
  assert.equal(m0.metodoMuertes, 'directo')
  assert.equal(m0.mobs[0].nombre, 'Hiena')
  const market = FarmPlan.marketModel([{ itemId: 7069, unitPriceCopper: 3000, observedDay: 2500, history: [{ day: 2500, low: 3000, high: 3000, available: 100 }] }])
  const ctx = { profile: { level: 40, fac: 'horde', cls: 'hunter', prof: { skin: true } }, market, caps: FarmPlan.sellCaps(market, null, { kappa: 1 }), settings: { pvp: true } }
  const m = metricasSesion(s, ctx, DATASET)
  assert.ok(m.valorSubasta > m.valorVendedor, 'el aire vale más en subasta')
  assert.ok(m.prediccion && m.prediccion.oroH > 0)
  assert.ok(Number.isFinite(m.prediccion.errorRitmo))
  assert.ok(Number.isFinite(m.prediccion.errorBotin))
})

test('perfilJugador: sin muestra suficiente usa lo declarado; con muestra calibra', () => {
  const s = parseFarm(lua(SV)).sessions[0]
  const poco = perfilJugador([{ ...s, kills: { '4127': 3 } }], DATASET)
  assert.equal(poco.source, 'default')
  assert.equal(poco.dpsK, FarmPlan.STYLE_DEFAULT.dpsK)
  const e = perfilJugador([s], DATASET, { nivel: 40 })
  assert.equal(e.source, 'sesiones')
  assert.equal(e.muertes, 80)
  // 1600 de vida / nivel 40 / 22,5 s de pelea = 1,78
  assert.ok(Math.abs(e.dpsK - 1600 / 40 / 22.5) < 1e-9)
  assert.ok(Math.abs(e.lootSec - 300 / 121) < 1e-9)
  assert.ok(e.downtime >= 0 && e.downtime <= 0.7)
  assert.ok(e.uncertainty < FarmPlan.STYLE_DEFAULT.uncertainty)
  assert.equal(perfilJugador([s], DATASET, { nivel: 55 }).source, 'default', 'otro rango de nivel no calibra')
})

test('observados: solo sesiones con muertes directas; el motor ajusta hacia lo visto', () => {
  const s = parseFarm(lua(SV)).sessions[0]
  const sinDirecto = observados([{ ...s, methods: { loot: true } }])
  assert.equal(sinDirecto.sesiones, 0)
  const o = observados([s])
  assert.equal(o.mobs.get('11578').kills, 20)
  assert.equal(o.mobs.get('11578').items.get(7069), 16)
  assert.ok(o.mobs.get('4127').skinOnly.has(4234))
  const base = { profile: { level: 40, fac: 'horde', cls: 'hunter', prof: { skin: false } }, market: new Map(), caps: new Map() }
  FarmPlan._reset(); FarmPlan.configure({ HunterDropData: DATASET })
  const prior = FarmPlan.farms(base).find((f) => f.id === 't11578').units.get(7069)
  FarmPlan._reset(); FarmPlan.configure({ HunterDropData: DATASET })
  const post = FarmPlan.farms({ ...base, observed: o }).find((f) => f.id === 't11578').units.get(7069)
  assert.equal(prior, 0.8)
  // (50·0,8 + 16) / (50 + 20) = 0,8 → la sesión confirmó 80 %
  assert.ok(Math.abs(post - (50 * 0.8 + 16) / 70) < 1e-12)
  FarmPlan._reset(); FarmPlan.configure({ HunterDropData: DATASET })
  const hiena = FarmPlan.farms({ ...base, observed: o }).find((f) => f.id === 't4127')
  assert.equal(hiena.units.has(4234), false, 'sin Desollar el cuero observado no cuenta')
  assert.ok(hiena.coins > 0, 'las monedas observadas suben las del dataset (0)')
})

test('ventasPorDia: ventas de subasta en la ventana, por día', () => {
  const now = 1795600000 * 1000
  const snap = { realms: [{ name: 'X', records: [
    { kind: 'sale', source: 'Auction', itemId: 4234, quantity: 100, time: 1795600000 - 10 * 86400 },
    { kind: 'sale', source: 'Auction', itemId: 4234, quantity: 50, time: 1795600000 - 86400 },
    { kind: 'sale', source: 'Vendor', itemId: 4234, quantity: 999, time: 1795600000 - 86400 },
    { kind: 'sale', source: 'Auction', itemId: 7069, quantity: 5, time: 1795600000 - 90 * 86400 },
  ] }] }
  const v = ventasPorDia(snap, { ahora: now, dias: 30 })
  assert.equal(v.get(4234).units, 150)
  assert.equal(v.get(4234).events, 2)
  assert.ok(Math.abs(v.get(4234).perDay - 15) < 1e-9)
  assert.equal(v.has(7069), false, 'fuera de la ventana')
})

test('exportAgente: agregados en oro, sin nombres ni ruta', () => {
  const s = parseFarm(lua(SV)).sessions[0]
  const m = metricasSesion(s, null, DATASET)
  const e = exportAgente({ sesiones: [s], metricas: [m], estilo: perfilJugador([s], DATASET, { nivel: 40 }),
    perfil: { nivel: 40, clase: 3, faccion: 'horda', nombre: 'NO-DEBE-SALIR' } })
  const txt = JSON.stringify(e)
  assert.equal(e.schema, 1)
  assert.equal(e.sesiones[0].muertes, 80)
  assert.equal(e.sesiones[0].monedasOro, 0.5)
  assert.equal(e.estilo.fuente, 'sesiones')
  assert.ok(!txt.includes('NO-DEBE-SALIR'))
  assert.ok(!txt.includes('1443:50.0'), 'la ruta de posiciones no sale')
  assert.equal(e.plan, null)
})

// Addon 0.2.0: sin registro de combate (Forever lo cierra). Muertes por PARTY_KILL,
// XP y cadáveres; algunas sin mob conocido; botín recibido según el chat; viaje.
const SV2 = `WoWForeverFarmDB = {
["version"] = 1,
["sessions"] = {
{
["v"] = 1, ["start"] = 1795700000, ["stop"] = 1795703700, ["level"] = 40, ["class"] = "HUNTER",
["active"] = 3600, ["travel"] = 240, ["deadTime"] = 90, ["xp"] = 24000, ["paused"] = 0,
["combat"] = 1800, ["looting"] = 300, ["fights"] = 80, ["deaths"] = 1,
["kills"] = { [4127] = 70, }, ["killsAnon"] = 10,
["killBy"] = { ["party"] = 72, ["xp"] = 3, ["loot"] = 5, ["raro"] = 9, },
["signals"] = { ["party"] = 80, ["party_oculto"] = 10, ["xp"] = 75, ["otro"] = 1, },
["corpses"] = { [4127] = 70, }, ["items"] = { [4127] = { [2589] = 20, }, },
["got"] = { [2589] = 18, [4234] = 40, },
["skins"] = {}, ["skinItems"] = {}, ["gather"] = {}, ["gatherItems"] = {}, ["other"] = {},
["money"] = { ["loot"] = 4000, ["merchant"] = 0, ["other"] = 0, }, ["coinsBy"] = {}, ["zones"] = { [1443] = 3600, },
["methods"] = { ["party"] = true, ["xp"] = true, ["loot"] = true, ["lootchat"] = true, ["secretos"] = true, },
},
},
["ui"] = {},
}
`

test('sesión 0.2.0: muertes sin mob, botín recibido, viaje, XP y avisos', () => {
  const [s] = parseFarm(lua(SV2)).sessions
  assert.equal(s.killsAnon, 10)
  assert.equal(s.killBy.party, 72); assert.equal(s.killBy.raro, undefined, 'métodos desconocidos fuera')
  assert.deepEqual(s.signals, { party: 80, party_oculto: 10, xp: 75 })
  assert.equal(s.travel, 240); assert.equal(s.deadTime, 90); assert.equal(s.xp, 24000)
  assert.equal(s.methods.party, true); assert.equal(s.methods.lootchat, true)
  const m = metricasSesion(s, null, DATASET)
  assert.equal(m.muertes, 80, 'las muertes sin mob cuentan en el total')
  assert.equal(m.metodoMuertes, 'directo')
  assert.equal(m.botinDe, 'chat')
  assert.equal(m.items.find((x) => x.itemId === 2589).unidades, 18, 'manda lo recibido, no la ventana')
  assert.equal(m.items.find((x) => x.itemId === 4234).unidades, 40)
  assert.equal(m.viajeS, 240); assert.equal(m.muertoS, 90); assert.equal(Math.round(m.xpH), 24000)
  // 10 de 80 sin mob (12,5 %) > 10 %: no se usa para tasas de drop por mob
  assert.equal(observados([s]).sesiones, 0)
  const casi = { ...s, killsAnon: 5 }
  assert.equal(observados([casi]).sesiones, 1, 'con ≤10 % sin mob sí se usa')
  const ag = exportAgente({ sesiones: [s], metricas: [m] })
  assert.equal(ag.sesiones[0].viajeMin, 4); assert.equal(ag.sesiones[0].muertesSinMob, 10); assert.equal(ag.sesiones[0].botinDe, 'chat')
})
