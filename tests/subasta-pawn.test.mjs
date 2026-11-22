// Pruebas de desktop/src/subasta-pawn.js: puntuador determinista de ofertas
// contra los pesos Pawn del personaje.
//
// Contrato bajo prueba: score = Σ stats*pesos, delta = score - score(equipado del
// slot), plata_por_punto = precio/100/delta, orden delta DESC y empate itemID ASC.
// Sin red, sin reloj, sin LLM: mismas entradas -> misma tabla.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseBridge } from '../desktop/src/bridge.js'
import { parsePawnCatalogo, parseEquipado } from '../desktop/src/item-stats.js'
import { rankear, puntuar, precioPorItem, redondear2, MOTIVOS, EPSILON } from '../desktop/src/subasta-pawn.js'

const enc = s => new TextEncoder().encode(s)

// Catálogo mínimo: cabeza mejorable, peto ya puesto, dos anillos, un trinket con
// un stat terciario y una pieza con equipLoc que el mapa no conoce.
const catalogo = parsePawnCatalogo({
  v: 1,
  colhido: 1763300100,
  fonte: 6,
  resolvidos: 5,
  itens: {
    1001: { i: 40, l: 'INVTYPE_HEAD', c: 4, s: 3, k: { ITEM_MOD_AGILITY_SHORT: 10, ITEM_MOD_STAMINA_SHORT: 10 } },
    1002: { i: 44, l: 'INVTYPE_CHEST', c: 4, s: 3, k: { ITEM_MOD_AGILITY_SHORT: 20, ITEM_MOD_STAMINA_SHORT: 5 } },
    1003: { i: 40, l: 'INVTYPE_FINGER', c: 4, s: 3, k: { ITEM_MOD_AGILITY_SHORT: 8 } },
    1004: { i: 40, l: 'INVTYPE_FINGER', c: 4, s: 3, k: { ITEM_MOD_AGILITY_SHORT: 12 } },
    1005: { i: 35, l: 'INVTYPE_TRINKET', c: 4, s: 0, k: { ITEM_MOD_CR_SPEED_SHORT: 3 } },
    1006: { i: 30, l: 'INVTYPE_QUE_NO_EXISTE', c: 4, s: 0, k: { ITEM_MOD_AGILITY_SHORT: 99 } },
    1007: { i: 40, l: 'INVTYPE_WAIST', c: 4, s: 3, k: { ITEM_MOD_AGILITY_SHORT: 0 } },
  },
})

const escala = { escala: '"Classic":HUNTER1', localized: 'Hunter: Beast Mastery', pesos: { Agility: 2, Stamina: 1 }, capturado: 1763300000 }

// Equipado: peto con Agility 20 + Stamina 5 (score 45), anillo 11 con Agility 6.
const equipado = parseEquipado({
  5: { id: 1002, i: 44, l: 'INVTYPE_CHEST', k: { ITEM_MOD_AGILITY_SHORT: 20, ITEM_MOD_STAMINA_SHORT: 5 } },
  11: { id: 9001, i: 40, l: 'INVTYPE_FINGER', k: { ITEM_MOD_AGILITY_SHORT: 6 } },
})

const oferta = (itemId, cobre) => ({ itemId, unitPriceCopper: cobre })

test('fórmula: score, delta y plata por punto con la aritmética del contrato', () => {
  const r = rankear({ ofertas: [oferta(1001, 1500)], escala, equipado, catalogo })
  assert.equal(r.estado, 'listo')
  assert.equal(r.filas.length, 1)
  const f = r.filas[0]
  assert.equal(f.score, 30, '10*2 + 10*1')
  assert.equal(f.baseTipo, 'vacio', 'no hay casco equipado en el fixture')
  assert.equal(f.delta, 30)
  assert.equal(f.plataPorPunto, 0.5, '(1500/100)/30')
  assert.equal(f.precio, 1500)
  assert.equal(f.slot, 'HEAD')
  assert.equal(f.ilvl, 40)
})

test('delta negativo contra el ítem equipado y plata por punto nula', () => {
  const r = rankear({ ofertas: [oferta(1002, 999)], escala, equipado, catalogo })
  const f = r.filas[0]
  assert.equal(f.score, 45)
  assert.equal(f.base, 45)
  assert.equal(f.delta, 0, 'mismo ítem que llevo: delta 0')
  assert.equal(f.baseItemID, 1002)
  assert.equal(f.plataPorPunto, null, 'delta ≤ 0 no tiene precio por punto, ni Infinity ni 0')
  assert.equal(r.filas[0].itemID, 1002)
})

test('anillo: la base es el mejor de los dos slots equipados', () => {
  const r = rankear({ ofertas: [oferta(1003, 1000)], escala, equipado, catalogo })
  const f = r.filas[0]
  assert.equal(f.base, 12, 'anillo con Agility 6 -> score 12')
  assert.equal(f.baseSlot, 11)
  assert.equal(f.score, 16)
  assert.equal(f.delta, 4)
  assert.equal(f.plataPorPunto, 2.5, '(1000/100)/4')
})

test('stats sin peso en la escala valen 0 y se informan sin cambiar el número', () => {
  const r = rankear({ ofertas: [oferta(1005, 700)], escala, equipado, catalogo })
  const f = r.filas[0]
  assert.equal(f.score, 0, 'MovementSpeed no tiene peso: aporta 0, no se adivina')
  assert.deepEqual(f.sinPeso, [{ stat: 'MovementSpeed', valor: 3 }])
  assert.equal(f.delta, 0)
  assert.equal(f.plataPorPunto, null)
})

test('precio: se usa el MENOR precio unitario del ítem, sin depender del orden', () => {
  const a = precioPorItem([oferta(1001, 900), oferta(1001, 300), oferta(1001, 500)])
  assert.deepEqual(a.map(x => [x.itemID, x.precio, x.ofertas]), [[1001, 300, 3]])
  const b = precioPorItem([oferta(1001, 500), oferta(1001, 300), oferta(1001, 900)])
  assert.deepEqual(b, a)
})

test('exclusiones: cada motivo declarado y contado', () => {
  const r = rankear({
    ofertas: [
      oferta(9999, 500),   // no está en el catálogo
      oferta(1006, 500),   // equipLoc desconocido
      oferta(1007, 500),   // sin stats útiles (todo 0)
      oferta(1002, 800),   // su slot (CHEST) está equipado sin stats: a ciegas
      oferta(1001, 0),     // oferta sin precio: no cuenta, pero no borra la válida
      oferta(1001, 1500),  // válida
    ],
    escala,
    equipado: parseEquipado({ 5: { id: 1002, l: 'INVTYPE_CHEST', k: {} } }),
    catalogo,
  })
  assert.equal(r.estado, 'listo')
  assert.deepEqual(r.excluidos.map(e => [e.itemID, e.motivo]), [
    [1002, MOTIVOS.SIN_EQUIPADO_STATS],
    [1006, MOTIVOS.SIN_SLOT],
    [1007, MOTIVOS.SIN_STATS],
    [9999, MOTIVOS.SIN_STATS],
  ])
  assert.deepEqual(r.resumen.porMotivo, {
    [MOTIVOS.SIN_STATS]: 2,
    [MOTIVOS.SIN_SLOT]: 1,
    [MOTIVOS.SIN_EQUIPADO_STATS]: 1,
  })
  assert.equal(r.filas.length, 1, 'la oferta 1001 con precio válido compite; la de 0 no la anula')
  assert.equal(r.filas[0].itemID, 1001)
  assert.equal(r.filas[0].precio, 1500)
  assert.equal(r.resumen.items, 5, '1001 aparece dos veces en ofertas pero es un ítem')
})

test('precio inválido: si todas las ofertas del ítem son ≤ 0 se excluye con motivo', () => {
  const r = rankear({ ofertas: [oferta(1001, 0), oferta(1001, -5)], escala, equipado, catalogo })
  assert.equal(r.filas.length, 0)
  assert.deepEqual(r.excluidos.map(e => [e.itemID, e.motivo]), [[1001, MOTIVOS.PRECIO_INVALIDO]])
})

test('estado SIN DATOS con motivo cuando falta una entrada imprescindible', () => {
  const sinEscala = rankear({ ofertas: [oferta(1001, 1)], escala: { pesos: {} }, equipado, catalogo })
  assert.deepEqual([sinEscala.estado, sinEscala.motivo], ['sin-datos', MOTIVOS.SIN_ESCALA])
  const sinCatalogo = rankear({ ofertas: [oferta(1001, 1)], escala, equipado, catalogo: { itens: {} } })
  assert.deepEqual([sinCatalogo.estado, sinCatalogo.motivo], ['sin-datos', MOTIVOS.SIN_CATALOGO])
  const sinOfertas = rankear({ ofertas: [], escala, equipado, catalogo })
  assert.deepEqual([sinOfertas.estado, sinOfertas.motivo], ['sin-datos', MOTIVOS.SIN_OFERTAS])
  assert.deepEqual(sinOfertas.filas, [])
})

test('orden: delta DESC y empate por itemID ASC', () => {
  const r = rankear({
    ofertas: [oferta(1003, 100), oferta(1001, 100), oferta(1004, 100)],
    escala,
    equipado,
    catalogo,
  })
  // 1001 HEAD sin equipado: 30. 1004 FINGER 12 Agility = 24 menos base 12 = 12.
  // 1003 FINGER 8 Agility = 16 menos base 12 = 4.
  assert.deepEqual(r.filas.map(f => [f.itemID, f.delta]), [[1001, 30], [1004, 12], [1003, 4]])
})

test('orden por valor completo, redondeo solo de presentación', () => {
  const cat = parsePawnCatalogo({
    v: 1,
    itens: {
      200: { i: 10, l: 'INVTYPE_HEAD', k: { ITEM_MOD_AGILITY_SHORT: 1 } },
      100: { i: 10, l: 'INVTYPE_HEAD', k: { ITEM_MOD_STAMINA_SHORT: 1 } },
    },
  })
  const r = rankear({
    ofertas: [oferta(100, 10), oferta(200, 10)],
    escala: { pesos: { Agility: 1.004, Stamina: 1 } },
    equipado: [],
    catalogo: cat,
  })
  assert.deepEqual(r.filas.map(f => f.itemID), [200, 100], '1.004 > 1 aunque ambos redondeen a 1')
  assert.deepEqual(r.filas.map(f => f.delta), [1, 1])
  assert.equal(redondear2(30.000000000000004), 30)
  assert.equal(redondear2(1.234), 1.23)
  assert.equal(redondear2(1.236), 1.24)
  assert.equal(redondear2(null), null)
})

test('delta exactamente 0 y casi 0 no producen precio por punto', () => {
  const cat = parsePawnCatalogo({ v: 1, itens: { 300: { i: 10, l: 'INVTYPE_HEAD', k: { ITEM_MOD_AGILITY_SHORT: 5 } } } })
  const eq = parseEquipado({ 1: { id: 301, l: 'INVTYPE_HEAD', k: { ITEM_MOD_AGILITY_SHORT: 5 } } })
  const r = rankear({ ofertas: [oferta(300, 1000)], escala: { pesos: { Agility: 2 } }, equipado: eq, catalogo: cat })
  assert.equal(r.filas[0].delta, 0)
  assert.equal(r.filas[0].plataPorPunto, null, 'delta 0 no se divide por EPSILON')
})

test('determinismo: barajar ofertas y claves del catálogo da la misma tabla', () => {
  const ofertas = [oferta(1001, 1500), oferta(1003, 900), oferta(1004, 1200), oferta(1005, 300)]
  const base = JSON.stringify(rankear({ ofertas, escala, equipado, catalogo }))
  const barajado = JSON.stringify(rankear({ ofertas: [...ofertas].reverse(), escala, equipado, catalogo }))
  assert.equal(barajado, base)
  const catInvertido = parsePawnCatalogo({
    v: 1,
    colhido: catalogo.colhido,
    fonte: catalogo.fonte,
    resolvidos: catalogo.resolvidos,
    itens: Object.fromEntries(Object.entries(catalogo.itens).reverse()),
  })
  assert.equal(JSON.stringify(rankear({ ofertas, escala, equipado, catalogo: catInvertido })), base)
})

test('procedencia declarada: escala, cosecha y fórmula, sin inventar datos', () => {
  const r = rankear({ ofertas: [oferta(1001, 1500)], escala, equipado, catalogo })
  assert.equal(r.procedencia.escala.localized, 'Hunter: Beast Mastery')
  assert.equal(r.procedencia.stats.colhido, 1763300100)
  assert.equal(r.procedencia.stats.fonte, 6)
  assert.equal(r.procedencia.formula, 'delta DESC, empate itemID ASC')
  assert.equal(EPSILON > 0, true)
})

test('de punta a punta con un puente Lua real: mismo ranking que con objetos JS', () => {
  const lua = `
WoWForeverBridgeDB={
version=1,retentionDays=14,entries={},
pawn={v=1,escala='"Classic":HUNTER1',localized="Hunter: Beast Mastery",classID=3,specID=1,origem="addon",
pesos={Agility=2,Stamina=1},equipo={valores={[1]={escala='"Classic":HUNTER1',valor=45,localized="Hunter: Beast Mastery"}},ilvl=42},
equipado={[5]={id=1002,i=44,l="INVTYPE_CHEST",k={ITEM_MOD_AGILITY_SHORT=20,ITEM_MOD_STAMINA_SHORT=5}},
[11]={id=9001,i=40,l="INVTYPE_FINGER",k={ITEM_MOD_AGILITY_SHORT=6}}},
capturado=1763300000},
pawnCatalogo={v=1,colhido=1763300100,fonte=6,resolvidos=5,itens={
[1001]={id=1001,i=40,l="INVTYPE_HEAD",k={ITEM_MOD_AGILITY_SHORT=10,ITEM_MOD_STAMINA_SHORT=10}},
[1003]={id=1003,i=40,l="INVTYPE_FINGER",k={ITEM_MOD_AGILITY_SHORT=8}},
[1004]={id=1004,i=40,l="INVTYPE_FINGER",k={ITEM_MOD_AGILITY_SHORT=12}},
}},
}
`
  const puente = parseBridge(enc(lua))
  const ofertas = [oferta(1001, 1500), oferta(1003, 900), oferta(1004, 1200)]
  const desdeLua = rankear({
    ofertas,
    escala: puente.pawn,
    equipado: puente.pawn.equipado,
    catalogo: puente.pawnCatalogo,
  })
  const desdeJs = rankear({ ofertas, escala, equipado, catalogo })
  assert.equal(JSON.stringify(desdeLua.filas), JSON.stringify(desdeJs.filas))
  assert.deepEqual(desdeLua.filas.map(f => [f.itemID, f.delta]), [[1001, 30], [1004, 12], [1003, 4]])
})
