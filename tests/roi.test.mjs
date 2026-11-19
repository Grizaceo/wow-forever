// node --test tests/roi.test.mjs — ROI con histórico: media móvil, tendencia y retorno.
// Fixtures sintéticos deterministas (valores calculados a mano) + humo con datos reales.
// Mismos valores esperados que tests/test_roi.py (paridad Python ↔ JS).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  serieHistorico, mediaMovil, tendencia, preciosHistoricos, roiRuta,
} from '../src/crafteo.js'

// items.json: id -> [es, en, calidad, nivel_req, nivel_item, venta_cobre, clase,
// subclase, ligado, compra_cobre, vendedor]. Índice 5 = venta al vendedor.
const fila = (compra, vendedor) => ['X', 'X', 1, 0, 0, 0, 0, 0, 0, compra, vendedor]
const filaV = (venta) => ['X', 'X', 1, 0, 0, venta, 0, 0, 0, 0, 0]
const ITEMS = { 100: fila(0, 0), 300: filaV(20), 400: filaV(0) }
const rango = (aprende, amarillo, verde, gris) => ({ aprende, amarillo, verde, gris })
const R = (spell, como, rg, reactivos, extra = {}) => ({ spell, como, rango: rg, reactivos, n: { es: 'r' + spell }, ...extra })
const S = (day, low, avail) => ({ day, low, avail })

test('serieHistorico: ordena, normaliza triples v1 y objetos del snapshot', () => {
  assert.deepEqual(serieHistorico([[2506, 30, 5], [2504, 10, 2], [2505, 20, 3]]),
    [S(2504, 10, 2), S(2505, 20, 3), S(2506, 30, 5)])
  assert.deepEqual(serieHistorico([{ day: 2505, low: 20, available: 3 }, { day: 2504, low: 10, available: 2 }]),
    [S(2504, 10, 2), S(2505, 20, 3)])
  // avail ausente -> null
  assert.deepEqual(serieHistorico([[2504, 10]]), [S(2504, 10, null)])
})

test('serieHistorico: descarta observaciones inválidas y no-listas', () => {
  assert.deepEqual(serieHistorico([[2504, 0, 2], [2504.5, 10, 1], ['x', 10, 1], [2505, -5, 1], null, 42, [2506, 30, 5]]),
    [S(2506, 30, 5)])
  assert.deepEqual(serieHistorico('x'), [])
  assert.deepEqual(serieHistorico(null), [])
})

test('mediaMovil: todos los días, ventana, redondeo half-up y vacío', () => {
  const s = [S(2504, 10, 1), S(2505, 20, 1), S(2506, 30, 1)]
  assert.deepEqual(mediaMovil(s), { media: 20, n: 3, desde: 2504, hasta: 2506 })
  assert.deepEqual(mediaMovil(s, 2), { media: 25, n: 2, desde: 2505, hasta: 2506 })
  assert.deepEqual(mediaMovil(s, 0), { media: 20, n: 3, desde: 2504, hasta: 2506 })
  assert.deepEqual(mediaMovil(s, null), { media: 20, n: 3, desde: 2504, hasta: 2506 })
  assert.equal(mediaMovil([S(2504, 10, 1), S(2505, 11, 1)]).media, 11) // 10.5 -> 11
  assert.equal(mediaMovil([]), null)
  assert.equal(mediaMovil(null), null)
})

test('tendencia: sube/baja/plana, umbral ±2%, redondeo y <2 puntos', () => {
  assert.deepEqual(tendencia([S(2504, 10, 1), S(2505, 20, 1)]), { direccion: 'sube', deltaPct: 100 })
  assert.deepEqual(tendencia([S(2504, 20, 1), S(2505, 10, 1)]), { direccion: 'baja', deltaPct: -50 })
  assert.deepEqual(tendencia([S(2504, 100, 1), S(2505, 101, 1)]), { direccion: 'plana', deltaPct: 1 })
  assert.deepEqual(tendencia([S(2504, 100, 1), S(2505, 102, 1)]), { direccion: 'plana', deltaPct: 2 }) // >2 estricto
  assert.deepEqual(tendencia([S(2504, 100, 1), S(2505, 103, 1)]), { direccion: 'sube', deltaPct: 3 })
  assert.deepEqual(tendencia([S(2504, 3, 1), S(2505, 4, 1)]), { direccion: 'sube', deltaPct: 33.3 })
  assert.equal(tendencia([S(2504, 10, 1)]), null)
  assert.equal(tendencia([]), null)
  assert.equal(tendencia([S(2504, 0, 1), S(2505, 10, 1)]), null) // primero no positivo
})

test('preciosHistoricos: media por ítem + meta, descarta ids inválidos y series vacías', () => {
  const { precios, meta } = preciosHistoricos({
    100: [[2504, 10, 2], [2505, 20, 3]],
    200: [[2504, 50, 1]],
    bad: 'x',
    0: [[2504, 5, 1]],
  })
  assert.equal(precios.get(100), 15)
  assert.equal(precios.get(200), 50)
  assert.equal(precios.size, 2)
  assert.deepEqual(meta[100], { media: 15, n: 2, desde: 2504, hasta: 2505, direccion: 'sube', deltaPct: 100 })
  assert.deepEqual(meta[200], { media: 50, n: 1, desde: 2504, hasta: 2504, direccion: null, deltaPct: null })
  // ventana 1 -> solo el último día
  assert.equal(preciosHistoricos({ 100: [[2504, 10, 2], [2505, 20, 3]] }, 1).precios.get(100), 20)
})

// rA: naranja todo el tramo 0..10 (amarillo=10) => p=1, 10 crafts exactos.
// reactivo 100 a 10c => coste 100. crea 300 (venta vendedor 20c).
const rA = R(1, 'entrenador', rango(0, 10, 10, 10), [[100, 1]], { crea: [300, 1] })

test('roiRuta: retorno vendedor (suelo) y estimado (AH), ROI y neto', () => {
  const roi = roiRuta([rA], 0, 10, { 100: 10, 300: 50 }, ITEMS)
  assert.equal(roi.coste, 100)
  assert.equal(roi.retornoVendedor, 200) // 10 crafts × 20c
  assert.equal(roi.retornoEstimado, 500) // 10 × max(50 AH, 20 vend)
  assert.equal(roi.roiVendedor, 2)
  assert.equal(roi.roiEstimado, 5)
  assert.equal(roi.netoVendedor, 100)
  assert.equal(roi.netoEstimado, 400)
  assert.equal(roi.pasosConValor, 1)
  assert.equal(roi.pasosSinValor, 0)
  assert.equal(roi.cobertura, 1)
  assert.equal(roi.huecos, 0)
})

test('roiRuta: AH por debajo del vendedor => el estimado usa el mayor (suelo)', () => {
  const roi = roiRuta([rA], 0, 10, { 100: 10, 300: 5 }, ITEMS)
  assert.equal(roi.retornoVendedor, 200)
  assert.equal(roi.retornoEstimado, 200) // max(5, 20) = 20
  assert.equal(roi.roiEstimado, 2)
})

test('roiRuta: yield >1 multiplica el retorno', () => {
  const rY = R(1, 'entrenador', rango(0, 10, 10, 10), [[100, 1]], { crea: [300, 2] })
  const roi = roiRuta([rY], 0, 10, { 100: 10, 300: 50 }, ITEMS)
  assert.equal(roi.retornoVendedor, 400) // 10 × 20 × 2
  assert.equal(roi.retornoEstimado, 1000) // 10 × 50 × 2
})

test('roiRuta: crea null (encantamiento) e ítem sin valor => SIN DATOS, retorno 0', () => {
  const rEnc = R(2, 'entrenador', rango(0, 10, 10, 10), [[100, 1]], { crea: null })
  const enc = roiRuta([rEnc], 0, 10, { 100: 10 }, ITEMS)
  assert.equal(enc.pasosSinValor, 1)
  assert.equal(enc.pasosConValor, 0)
  assert.equal(enc.retornoVendedor, 0)
  assert.equal(enc.retornoEstimado, 0)
  assert.equal(enc.roiVendedor, 0) // 0 / coste 100
  assert.equal(enc.netoVendedor, -100)
  const rSin = R(3, 'entrenador', rango(0, 10, 10, 10), [[100, 1]], { crea: [777, 1] })
  const sin = roiRuta([rSin], 0, 10, { 100: 10 }, ITEMS) // 777 sin fila ni precio
  assert.equal(sin.pasosSinValor, 1)
  assert.equal(sin.retornoEstimado, 0)
})

test('roiRuta: sin ruta (coste null) => ROI y neto null', () => {
  const rD = R(4, 'entrenador', rango(0, 10, 10, 10), [[888, 1]]) // 888 sin precio
  const roi = roiRuta([rD], 0, 10, { 100: 10 }, ITEMS)
  assert.equal(roi.coste, null)
  assert.equal(roi.roiVendedor, null)
  assert.equal(roi.roiEstimado, null)
  assert.equal(roi.netoVendedor, null)
  assert.equal(roi.netoEstimado, null)
  assert.equal(roi.cobertura, 0)
  assert.equal(roi.huecos, 1)
})

test('roiRuta: resumen de tendencia sobre reactivos (con y sin meta)', () => {
  const conMeta = roiRuta([rA], 0, 10, { 100: 10, 300: 50 }, ITEMS, { meta: { 100: { direccion: 'sube' } } })
  assert.deepEqual(conMeta.tendenciaResumen, { suben: 1, bajan: 0, planas: 0, sinHist: 0 })
  const sinMeta = roiRuta([rA], 0, 10, { 100: 10, 300: 50 }, ITEMS)
  assert.equal(sinMeta.tendenciaResumen, null)
  const metaAjena = roiRuta([rA], 0, 10, { 100: 10, 300: 50 }, ITEMS, { meta: { 200: { direccion: 'baja' } } })
  assert.deepEqual(metaAjena.tendenciaResumen, { suben: 0, bajan: 0, planas: 0, sinHist: 1 })
})

test('roiRuta: determinista', () => {
  assert.deepEqual(roiRuta([rA], 0, 10, { 100: 10, 300: 50 }, ITEMS),
    roiRuta([rA], 0, 10, { 100: 10, 300: 50 }, ITEMS))
})

test('humo real: Herrería con precios sintéticos, estimado >= suelo', () => {
  const profs = JSON.parse(readFileSync(new URL('../data/profesiones.json', import.meta.url), 'utf8')).profesiones
  const items = JSON.parse(readFileSync(new URL('../data/items.json', import.meta.url), 'utf8')).items
  const recetas = profs['164'].recetas
  const ids = new Set()
  for (const r of recetas) {
    for (const par of r.reactivos || []) ids.add(Array.isArray(par) ? par[0] : par)
    if (r.crea) ids.add(Array.isArray(r.crea) ? r.crea[0] : r.crea)
    if (r.receta_item) ids.add(r.receta_item)
  }
  const precios = {}
  for (const i of ids) precios[i] = (i % 500) + 1
  const roi = roiRuta(recetas, 1, 300, precios, items, { faccion: 'horda' })
  assert.ok(roi.cobertura > 0)
  assert.ok(roi.coste > 0)
  assert.ok(roi.retornoEstimado >= roi.retornoVendedor)
  assert.ok(roi.roiVendedor !== null)
})