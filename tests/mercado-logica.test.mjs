import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  catalogoMercado, fuentesItem, nombreItem, normBuscador, textosBusqueda,
  fuenteEnRango, filtrarMercado, ordenarMercado, frescura, snapshotVisible,
  planImportacion, snapshotValido, infoHistorial, perfilMotor, hubZonesDe,
  ajustesBase, ajustesFarm, normalizarAjustes, geometriaGrafico, fmtCobre,
  HunterMarket, HunterHistory, PAGE_SIZE,
} from '../desktop/src/mercado-logica.js'

const req = createRequire(import.meta.url)
const itemsJson = req('../data/items.json')
const dungeonsJson = req('../data/dungeons.json')
const zonasJson = req('../data/zonas.json')
const CATALOGO = catalogoMercado(itemsJson, dungeonsJson)

const FIX = 'AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Prueba"]={version=2,' +
  '["2589"]={m=120,h={["2140"]=130},l={["2140"]=120},a={["2140"]=20}},' +
  '["6469"]={m=99999,h={["2141"]=100000},l={["2141"]=99999},a={["2141"]=5}}}}'
const raw = () => HunterMarket.parseAuctionator(new TextEncoder().encode(FIX))
const item = (key, extra = {}) => ({ sourceKey: key, itemId: null, unitPriceCopper: 100, observedDay: 2140, history: [{ day: 2140, low: 100, high: 110, available: 5 }], ...extra })

test('catálogo: nombres es/en y fuentes desde items.json + dungeons.json', () => {
  assert.equal(CATALOGO.schemaVersion, 1)
  const e = CATALOGO.items['2589']
  assert.ok(e, '2589 tiene fuentes')
  assert.equal(e.name, 'Linen Cloth')
  assert.equal(e.nameEs, 'Paño de lino')
  assert.ok(e.sources.length > 0)
  const s = e.sources[0]
  for (const k of ['boss', 'dungeon', 'location', 'levelMin', 'levelMax', 'chance', 'raid', 'reference']) assert.ok(k in s, k)
  assert.match(s.reference, /^data\/dungeons\.json#\d+\/\d+$/)
  // ítems sin fuente quedan fuera
  assert.equal(CATALOGO.items['9999'], undefined)
  // orden por id numérico
  const ids = Object.keys(CATALOGO.items).map(Number)
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b))
})

test('fuentesItem resuelve nombres es/en vía reference', () => {
  const fuentes = fuentesItem(CATALOGO.items['2589'], dungeonsJson)
  assert.ok(fuentes.length)
  const conNombres = fuentes.find((s) => s.bossN && s.dungeonN)
  assert.ok(conNombres, 'alguna fuente resuelve dungeon+jefe en español')
  assert.ok(conNombres.bossN.es && conNombres.dungeonN.es)
})

test('parse + planImportacion + snapshotVisible + snapshotValido', () => {
  const r = raw()
  assert.equal(r.realms.length, 1)
  assert.equal(r.realms[0].name, 'Prueba')
  assert.equal(r.realms[0].items.length, 2)
  assert.ok(snapshotValido(r))
  const plan = planImportacion(r, {})
  assert.ok(snapshotValido(plan.snapshot))
  const i2589 = plan.snapshot.realms[0].items.find((i) => i.sourceKey === '2589')
  assert.equal(i2589.itemId, 2589)
  assert.equal(i2589.unitPriceCopper, 120)
  const vis = snapshotVisible({ snapshot: plan.snapshot }, { store: plan.store })
  const v2589 = vis.realms[0].items.find((i) => i.sourceKey === '2589')
  assert.equal(v2589.itemId, 2589)
  assert.equal(v2589.unitPriceCopper, 120)
  // store acumulado: filas compactas por sourceKey
  const rows = plan.store.realms.Prueba.items['2589']
  assert.ok(Array.isArray(rows) && rows.length >= 1)
  assert.ok(infoHistorial(plan.store).days >= 1)
  // segunda importación fusiona sin duplicar días
  const r2 = HunterMarket.parseAuctionator(new TextEncoder().encode(
    FIX.replace('m=120', 'm=130')))
  const plan2 = planImportacion(r2, { snapshotActual: vis, historyStore: plan.store })
  const rows2 = plan2.store.realms.Prueba.items['2589']
  const dias = new Set(rows2.map((x) => x[0]))
  assert.equal(dias.size, rows2.length, 'sin días duplicados tras reimportar')
})

test('búsqueda: ID, nombre es/en, jefe y dungeon; sin acentos', () => {
  const items = raw().realms[0].items
  const textos = textosBusqueda(items, CATALOGO, itemsJson, dungeonsJson)
  assert.ok(filtrarMercado(items, { textos, q: '2589' }).some((i) => i.sourceKey === '2589'))
  assert.ok(filtrarMercado(items, { textos, q: 'lino' }).some((i) => i.sourceKey === '2589'), 'nombre ES')
  assert.ok(filtrarMercado(items, { textos, q: 'linen' }).some((i) => i.sourceKey === '2589'), 'nombre EN')
  assert.ok(filtrarMercado(items, { textos, q: 'venomstrike' }).some((i) => i.sourceKey === '6469'))
  assert.equal(filtrarMercado(items, { textos, q: 'inexistente' }).length, 0)
  assert.equal(normBuscador('Corazón  Ágil'), 'corazon agil')
  // jefe/dungeon: 2589 tiene fuentes en Ragefire Chasm (Bazzalan)
  assert.ok(filtrarMercado(items, { textos, q: 'bazzalan' }).some((i) => i.sourceKey === '2589'), 'por jefe')
  assert.ok(filtrarMercado(items, { textos, q: 'ragefire' }).some((i) => i.sourceKey === '2589'), 'por dungeon')
})

test('filtros: recientes, con fuente en rango, variantes', () => {
  const dia = 2145
  const items = [
    item('a', { itemId: 2589, observedDay: 2144 }),   // reciente (1 día)
    item('b', { itemId: 6469, observedDay: 2130 }),   // antiguo (15 días)
    item('c', { itemId: null, observedDay: 2144 }),   // variante reciente
    item('d', { itemId: 2589, observedDay: null }),   // sin fecha
  ]
  const textos = textosBusqueda(items, CATALOGO, itemsJson, dungeonsJson)
  const rec = filtrarMercado(items, { textos, recientes: true, dia })
  assert.deepEqual(rec.map((i) => i.sourceKey).sort(), ['a', 'c'])
  const fuente = filtrarMercado(items, { textos, conFuente: true, nivel: 15, catalogo: CATALOGO })
  assert.ok(fuente.every((i) => i.itemId === 2589), JSON.stringify(fuente.map((i) => i.sourceKey)))
  assert.ok(fuenteEnRango(items[0], 15, CATALOGO))
  assert.ok(!fuenteEnRango(items[1], 15, CATALOGO) || fuenteEnRango(items[1], 20, CATALOGO))
  assert.equal(fuenteEnRango(items[2], 15, CATALOGO), false)
})

test('orden: nombre, precio, ofertas, roi/gph', () => {
  const items = [
    item('b', { itemId: 2589, unitPriceCopper: 50 }),
    item('a', { itemId: 6469, unitPriceCopper: 200 }),
    item('c', { itemId: null, sourceKey: '9999:1', unitPriceCopper: 10 }),
  ]
  const porPrecio = ordenarMercado(items, 'precio', { lang: 'es', itemsJson, catalogo: CATALOGO })
  assert.deepEqual(porPrecio.map((i) => i.sourceKey), ['a', 'b', '9999:1'], 'precio descendente como el catálogo')
  const porNombre = ordenarMercado(items, 'nombre', { lang: 'es', itemsJson, catalogo: CATALOGO })
  // "Paño de lino" antes que "Venomstrike"; la variante ordena por su clave
  assert.ok(porNombre.findIndex((i) => i.sourceKey === 'b') < porNombre.findIndex((i) => i.sourceKey === 'a'))
  const ofertaFake = (i) => (i.sourceKey === '9999:1' ? { score: 5 } : i.sourceKey === 'a' ? { score: 1 } : { score: -1 })
  const porOfertas = ordenarMercado(items, 'ofertas', { oferta: ofertaFake })
  assert.equal(porOfertas[0].sourceKey, '9999:1')
  const porRoi = ordenarMercado(items, 'roi', { metrica: (i) => (i.sourceKey === 'b' ? { farmable: true, roi: 0.5 } : { farmable: false }) })
  assert.equal(porRoi[0].sourceKey, 'b')
})

test('frescura: importación, día más reciente y aviso >3 días', () => {
  const plan = planImportacion(raw(), {})
  const f = frescura(plan.snapshot, 'Prueba')
  assert.equal(f.items, 2)
  assert.equal(f.maxDay, 2141)
  assert.ok(f.diasDesde > 3, 'datos de 2005 → más de 3 días → aviso')
  assert.equal(f.aviso, true)
  assert.equal(frescura(null, 'Prueba'), null)
  const f2 = frescura(plan.snapshot, 'Otro')
  assert.equal(f2.items, 0)
  assert.equal(f2.maxDay, null)
  assert.equal(f2.aviso, false)
})

test('perfilMotor y ajustes: mapeo clase/facción y recolección', () => {
  const cazador = { nivel: 30, clase: 3, faccion: 'horda', profesiones: [165, 393], secundarias: [185] }
  const p = perfilMotor(cazador, 'Durotar / Barrens')
  assert.deepEqual(p, { level: 30, cls: 'hunter', fac: 'horde', spec: '', pref: 'any', hubZones: 'Durotar / Barrens' })
  const paladin = perfilMotor({ nivel: 24, clase: 2, faccion: 'horda' })
  assert.equal(paladin.cls, 'otro')
  assert.equal(paladin.fac, 'horde')
  const cham = perfilMotor({ nivel: 40, clase: 7, faccion: 'alianza' })
  assert.equal(cham.cls, 'shaman')
  assert.equal(cham.fac, 'alliance')
  const ab = ajustesBase(cazador)
  assert.deepEqual(ab.prof, { skin: true, herb: false, mine: false })
  assert.equal(ab.comp, 'auto')
  assert.equal(ab.gph, 5)
  const n = normalizarAjustes({ comp: 'raro', gph: -3, prof: { skin: 1 }, n: 99, session: 3 })
  assert.equal(n.comp, 'auto')
  assert.equal(n.gph, 5)
  assert.equal(n.prof.skin, true)
  assert.equal(n.n, 5)
  assert.equal(n.session, 2)
  const af = ajustesFarm(cazador, { gph: 12, prof: { herb: true } })
  assert.equal(af.gph, 12)
  assert.deepEqual(af.prof, { skin: true, herb: true, mine: false })
})

test('hubZonesDe: banda curada primero, fallback zonas.json sin facción contraria', () => {
  const { GUIDE_HUNTER } = req('../standalone/guide-hunter.js')
  const rutas = GUIDE_HUNTER.factions.horde.routes
  const hub = hubZonesDe(30, rutas, zonasJson, 'horda')
  assert.ok(hub.length > 0, 'banda curada para nv 30')
  // nv 15 horda: propias + disputadas; alianza fuera
  const horda = hubZonesDe(15, null, zonasJson, 'horda')
  for (const n of ['The Barrens', 'Silverpine Forest', 'Redridge Mountains', 'Stonetalon Mountains']) {
    assert.ok(horda.includes(n), `${n} en horda15`)
  }
  for (const n of ['Loch Modan', 'Westfall', 'Darkshore', 'Dun Morogh']) {
    assert.ok(!horda.includes(n), `${n} no debe estar en horda15`)
  }
  // alianza ve las suyas y no las de horda
  const alianza = hubZonesDe(15, null, zonasJson, 'alianza')
  assert.ok(alianza.includes('Westfall'))
  assert.ok(!alianza.includes('The Barrens'))
  // nivel sin zonas → cadena vacía
  assert.equal(hubZonesDe(70, null, zonasJson, 'horda'), '')
})

test('geometriaGrafico: misma forma que market-chart, null sin puntos', () => {
  assert.equal(geometriaGrafico([]), null)
  assert.equal(geometriaGrafico(null), null)
  const hist = [
    { day: 2138, low: 100, high: 120, available: 3 },
    { day: 2139, low: 90, high: 110, available: 4 },
    { day: 2140, low: 110, high: 130, available: 5 },
    { day: 2140, low: 105, high: 120, available: 2 },
  ]
  const g = geometriaGrafico(hist, { current: 105 })
  assert.ok(g.linea.startsWith('M'))
  assert.ok(g.area.endsWith('Z'))
  assert.ok(g.actual, 'precio actual dentro del dominio')
  assert.ok(g.ticksY.length >= 1 && g.ticksY.length <= 6)
  assert.ok(g.ticksX.length >= 1 && g.ticksX.length <= 5)
  // actual fuera del dominio → null
  const g2 = geometriaGrafico(hist, { current: 999 })
  assert.equal(g2.actual, null)
  // sparkline sin ejes
  const sp = geometriaGrafico(hist, { axes: false, w: 150, h: 34, pad: { l: 4, r: 4, t: 5, b: 5 } })
  assert.equal(sp.ticksY, undefined)
  assert.equal(fmtCobre(156000), '15.6g')
  assert.equal(fmtCobre(8500), '85s')
})

test('nombreItem: items.json es/en, catálogo, variante', () => {
  const i2589 = { itemId: 2589 }
  assert.equal(nombreItem(i2589, itemsJson, CATALOGO, 'es'), 'Paño de lino')
  assert.equal(nombreItem(i2589, itemsJson, CATALOGO, 'en'), 'Linen Cloth')
  assert.equal(nombreItem({ itemId: null, sourceKey: 'x:1' }, itemsJson, CATALOGO, 'es'), null)
})

test('PAGE_SIZE = 50', () => assert.equal(PAGE_SIZE, 50))
