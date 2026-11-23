// Pruebas de desktop/src/item-stats.js: catálogo de stats por ítem que cosecha
// el addon (WoWForeverBridgeDB.pawnCatalogo) y equipo por slot (pawn.equipado).
//
// El fixture crudo es un SavedVariables en Lua de verdad, no un objeto JS: el
// lector del repo devuelve TODA tabla Lua como objeto con claves string
// (standalone/market.js:769-779), y los tests con arrays JS reales no detectan
// esa trampa. Datos inventados y anonimizados.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseBridge } from '../desktop/src/bridge.js'
import { parsePawnCaptura } from '../desktop/src/pawn.js'
import {
  CLAVE_STATS,
  VERSION_CATALOGO,
  MAX_ITENS,
  MAPA_STATS,
  CLAVES_PAWN,
  SIN_CLAVE_PAWN,
  SLOTS_EQUIPLOC,
  mapearStats,
  slotDeEquipLoc,
  parsePawnCatalogo,
  parseEquipado,
  equipadoPorSlot,
  estadoPawnStats,
  sincronizarPawnStats,
  lerPawnStats,
} from '../desktop/src/item-stats.js'

const enc = s => new TextEncoder().encode(s)

// Puente mínimo en Lua con el catálogo y el equipo por slot, con la forma exacta
// que escribe addon/WoWForeverBridge/Pawn.lua: claves numéricas de ítem y de
// slot, stats crudos de C_Item.GetItemStats.
const BRIDGE_LUA = `
WoWForeverBridgeDB={
version=1,
retentionDays=14,
entries={},
pawn={
v=1,
escala='"Classic":HUNTER1',
localized="Hunter: Beast Mastery",
provider="Classic",
classID=3,
specID=1,
pesos={Agility=2,Stamina=0.5},
equipo={valores={[1]={escala='"Classic":HUNTER1',valor=47.5,localized="Hunter: Beast Mastery"}},ilvl=42},
equipado={
[5]={id=2002,i=44,l="INVTYPE_CHEST",c=4,s=3,k={ITEM_MOD_AGILITY_SHORT=20}},
[11]={id=2004,i=40,l="INVTYPE_FINGER",c=4,s=3,k={ITEM_MOD_AGILITY_SHORT=6}},
[12]={id=2005,i=40,l="INVTYPE_FINGER",c=4,s=3,k={}},
},
capturado=1763300000,
origem="addon",
},
pawnCatalogo={
v=1,
colhido=1763300100,
ciclo=3,
cursor=2010,
volta=1,
fonte=5,
resolvidos=4,
pendentes=1,
itens={
[2001]={id=2001,i=40,l="INVTYPE_HEAD",c=4,s=3,k={ITEM_MOD_AGILITY_SHORT=12,ITEM_MOD_STAMINA_SHORT=10}},
[2002]={id=2002,i=44,l="INVTYPE_CHEST",c=4,s=3,k={ITEM_MOD_AGILITY_SHORT=20}},
[2003]={id=2003,i=40,l="INVTYPE_FINGER",c=4,s=3,k={ITEM_MOD_AGILITY_SHORT=8,ITEM_MOD_SPIRIT_SHORT=4}},
[2006]={id=2006,i=35,l="INVTYPE_TRINKET",c=4,s=0,k={ITEM_MOD_CR_SPEED_SHORT=3}},
[2007]={id=2007,i=30,l="INVTYPE_WEAPONMAINHAND",c=2,s=7,k={ITEM_MOD_DAMAGE_PER_SECOND_SHORT=12.4,ITEM_MOD_STAMINA_SHORT=0}},
},
},
}
`

const puente = parseBridge(enc(BRIDGE_LUA))

test('parseBridge expone pawnCatalogo y equipado desde el puente en Lua', () => {
  assert.ok(puente.pawnCatalogo, 'pawnCatalogo presente')
  assert.equal(puente.pawnCatalogo.v, VERSION_CATALOGO)
  assert.equal(puente.pawnCatalogo.colhido, 1763300100)
  assert.equal(puente.pawnCatalogo.fonte, 5)
  assert.equal(puente.pawnCatalogo.pendentes, 1)
  assert.deepEqual(Object.keys(puente.pawnCatalogo.itens).sort(), ['2001', '2002', '2003', '2006', '2007'])
  assert.ok(!Array.isArray(puente.pawnCatalogo.itens), 'las tablas Lua NO llegan como array')
  assert.equal(puente.pawn.equipado.length, 3, 'equipado por slot normalizado')
  assert.deepEqual(puente.pawn.equipado.map(e => e.slot), [5, 11, 12])
  assert.equal(puente.pawn.equipado[0].itemID, 2002)
  assert.equal(puente.pawn.equipado[0].stats.ITEM_MOD_AGILITY_SHORT, 20)
})

test('catálogo: stats crudos se conservan, ceros se descartan', () => {
  const cat = puente.pawnCatalogo
  assert.deepEqual(cat.itens[2001].stats, { ITEM_MOD_AGILITY_SHORT: 12, ITEM_MOD_STAMINA_SHORT: 10 })
  assert.equal(cat.itens[2001].ilvl, 40)
  assert.equal(cat.itens[2001].equipLoc, 'INVTYPE_HEAD')
  assert.equal(cat.itens[2001].classID, 4)
  assert.equal(cat.itens[2001].subClassID, 3)
  assert.deepEqual(cat.itens[2007].stats, { ITEM_MOD_DAMAGE_PER_SECOND_SHORT: 12.4 },
    'un stat en 0 no se guarda como si valiera algo')
  assert.deepEqual(cat.itens[2002].stats, { ITEM_MOD_AGILITY_SHORT: 20 })
})

test('parsePawnCatalogo: entrada inválida devuelve null, nunca basura', () => {
  assert.equal(parsePawnCatalogo(null), null)
  assert.equal(parsePawnCatalogo([]), null)
  assert.equal(parsePawnCatalogo({}), null)
  assert.equal(parsePawnCatalogo({ v: 2, itens: {} }), null, 'versión desconocida')
  const vacio = parsePawnCatalogo({ v: 1, itens: 'no' })
  assert.deepEqual(vacio.itens, {}, 'itens inválido -> vacío')
  assert.equal(vacio.colhido, null)
})

test('parsePawnCatalogo: ignora claves no numéricas y acota tamaño', () => {
  const cat = parsePawnCatalogo({
    v: 1,
    itens: { 'abc': { i: 1 }, '0': { i: 1 }, '-5': { i: 1 }, '2001': { i: 40, l: 'INVTYPE_HEAD', k: { A: 1 } } },
  })
  assert.deepEqual(Object.keys(cat.itens), ['2001'])
  const grande = { v: 1, itens: {} }
  for (let i = 1; i <= MAX_ITENS + 5; i++) grande.itens[String(i)] = { i: 10, l: 'INVTYPE_HEAD', k: { A: 1 } }
  assert.equal(Object.keys(parsePawnCatalogo(grande).itens).length, MAX_ITENS)
})

test('parsePawnCatalogo es idempotente (guardar y releer no degrada)', () => {
  const uno = puente.pawnCatalogo
  const dos = parsePawnCatalogo(JSON.parse(JSON.stringify(uno)))
  assert.deepEqual(dos, uno)
})

test('mapa de stats: es idempotente con claves Pawn ya normalizadas', () => {
  // El storage `pawn-stats` guarda el catálogo con claves Pawn. Volver a
  // normalizarlo (lerPawnStats -> rankear) no debe degradar nada ni marcar
  // «sin mapa» lo que ya está traducido.
  const { pesos, sinMapa } = mapearStats({ Agility: 4, Stamina: 2, MovementSpeed: 1 })
  assert.deepEqual(pesos, { Agility: 4, Stamina: 2, MovementSpeed: 1 })
  assert.deepEqual(sinMapa, [])
  assert.ok(CLAVES_PAWN.has('Agility') && CLAVES_PAWN.has('Stamina'))
  assert.ok(!CLAVES_PAWN.has('ITEM_MOD_AGILITY_SHORT'), 'la clave cruda no es Pawn')
})

test('mapa de stats: traduce a claves Pawn y reporta lo que no conoce', () => {
  assert.equal(MAPA_STATS.ITEM_MOD_AGILITY_SHORT, 'Agility')
  assert.equal(MAPA_STATS.RESISTANCE0_NAME, 'Armor')
  assert.equal(MAPA_STATS.RESISTANCE6_NAME, 'ArcaneResist')
  assert.equal(MAPA_STATS.ITEM_MOD_HIT_MELEE_RATING, 'HitRating')
  assert.equal(MAPA_STATS.ITEM_MOD_VERSATILITY, 'Versatility')
  assert.ok(SIN_CLAVE_PAWN.includes('RESISTANCE1_NAME'), 'Holy no tiene clave Pawn: se reporta')
  assert.ok(!('ITEM_MOD_AGILITY_SHORT' in Object.fromEntries(SIN_CLAVE_PAWN.map(k => [k, 1]))))
  const { pesos, sinMapa } = mapearStats({
    ITEM_MOD_AGILITY_SHORT: 10,
    ITEM_MOD_STAMINA_SHORT: 6,
    ITEM_MOD_CR_SPEED_SHORT: 2,
    STAT_DESCONOCIDO_SHORT: 9,
    ITEM_MOD_SPIRIT_SHORT: 0,
  })
  assert.deepEqual(pesos, { Agility: 10, Stamina: 6, MovementSpeed: 2 })
  assert.deepEqual(sinMapa, ['STAT_DESCONOCIDO_SHORT'])
})

test('mapa de stats: dos claves crudas que apuntan a la misma clave Pawn se suman', () => {
  const { pesos } = mapearStats({ RESISTANCE0_NAME: 100, ITEM_MOD_ARMOR_SHORT: 25 })
  assert.equal(pesos.Armor, 125)
})

test('slots: equipLoc desconocido no se adivina', () => {
  assert.deepEqual(slotDeEquipLoc('INVTYPE_FINGER').ids, [11, 12])
  assert.equal(slotDeEquipLoc('INVTYPE_2HWEAPON').slot, 'MAINHAND')
  assert.equal(slotDeEquipLoc('INVTYPE_ROBE').slot, 'CHEST')
  assert.equal(slotDeEquipLoc('INVTYPE_QUE_NO_EXISTE'), null)
  assert.equal(slotDeEquipLoc(null), null)
  assert.equal(Object.keys(SLOTS_EQUIPLOC).every(k => k.startsWith('INVTYPE_')), true)
})

test('parseEquipado acepta la forma de Lua y la ya normalizada', () => {
  const crudo = { '5': { id: 2002, i: 44, l: 'INVTYPE_CHEST', k: { ITEM_MOD_AGILITY_SHORT: 20 } }, '1': { id: 9, i: 10, l: 'INVTYPE_HEAD', k: { A: 1 } } }
  const normalizado = parseEquipado(crudo)
  assert.deepEqual(normalizado.map(e => e.slot), [1, 5])
  assert.deepEqual(parseEquipado(normalizado), normalizado, 'roundtrip estable')
  assert.deepEqual(parseEquipado(null), [])
  assert.deepEqual(parseEquipado({ 'x': {} }), [])
  const porSlot = equipadoPorSlot(normalizado)
  assert.deepEqual(Object.keys(porSlot), ['HEAD', 'CHEST'])
})

test('parseEquipado deduplica slots y ordena', () => {
  const e = parseEquipado([
    { slot: 12, itemID: 3, equipLoc: 'INVTYPE_FINGER', stats: { ITEM_MOD_AGILITY_SHORT: 1 } },
    { slot: 11, itemID: 2, equipLoc: 'INVTYPE_FINGER', stats: { ITEM_MOD_AGILITY_SHORT: 2 } },
    { slot: 11, itemID: 99, equipLoc: 'INVTYPE_FINGER', stats: { ITEM_MOD_AGILITY_SHORT: 9 } },
  ])
  assert.deepEqual(e.map(x => x.slot), [11, 12])
  assert.equal(e[0].itemID, 2, 'gana la primera aparición del slot')
})

test('parsePawnCaptura: la captura del addon trae equipado sin perderlo al releer', () => {
  const cap = parsePawnCaptura(puente.pawn)
  assert.ok(cap)
  assert.equal(cap.equipado.length, 3)
  const releido = parsePawnCaptura(JSON.parse(JSON.stringify(cap)))
  assert.deepEqual(releido, cap)
})

test('estadoPawnStats: sin datos declara vacío honesto', () => {
  const st = estadoPawnStats(null, 1763300000)
  assert.deepEqual(st.itens, {})
  assert.equal(st.colhido, null)
  assert.equal(st.leido, 1763300000)
  assert.equal(st.fonte, 0)
})

test('sincronizarPawnStats guarda el catálogo y no borra el bueno sin datos', async () => {
  const store = new Map()
  const ctx = { storage: { get: async k => store.get(k) ?? null, set: async (k, v) => { store.set(k, v) } } }
  const r1 = await sincronizarPawnStats(ctx, puente, 1763300200)
  assert.equal(r1.status, 'ok')
  assert.equal(store.get(CLAVE_STATS).resolvidos, 4)
  assert.equal(store.get(CLAVE_STATS).leido, 1763300200)
  const r2 = await sincronizarPawnStats(ctx, { pawnCatalogo: null }, 1763300300)
  assert.equal(r2.status, 'sin-cambios')
  assert.equal((await lerPawnStats(ctx)).resolvidos, 4, 'una lectura sin catálogo no borra la cosecha')
})
