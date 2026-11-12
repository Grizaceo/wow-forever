// node --test tests/crafteo.test.mjs — usa los datos reales de data/*.json.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  dificultad, probSubida, preciosDelMercado, costoUnidad, costoReceta,
  valorCreado, margen, planDeSubida,
  dificultadReceta,
} from '../src/crafteo.js'

const profesiones = JSON.parse(readFileSync(new URL('../data/profesiones.json', import.meta.url), 'utf8'))
const items = JSON.parse(readFileSync(new URL('../data/items.json', import.meta.url), 'utf8')).items
const FA = profesiones.profesiones['129'].recetas
const receta = (spell) => FA.find((r) => r.spell === spell)
const VENDER_LINO = receta(3275)          // Venda de lino, Primeros auxilios
const VENDA_GRUESA = receta(3276)        // Venda de lino gruesa (aprende 40)

const MERCADO = {
  realm: 'Prueba',
  snapshot: { schemaVersion: 1, sourceVersion: 8, importedAt: '2026-11-10T12:00:00.000Z',
    warnings: [], realms: [{ name: 'Prueba', items: [
      { sourceKey: '2589', itemId: 2589, unitPriceCopper: 120, observedDay: 2140,
        history: [{ day: 2140, low: 120, high: 130, available: 20 }] },
      { sourceKey: '999999', itemId: null, unitPriceCopper: 50, observedDay: 2140, history: [] },
    ] }] },
}

test('dificultad de la Venda de lino en los umbrales de Classic', () => {
  assert.equal(VENDER_LINO.rango.amarillo, 30)
  assert.equal(VENDER_LINO.rango.verde, 45)
  assert.equal(VENDER_LINO.rango.gris, 60)
  assert.equal(dificultad(VENDER_LINO.rango, 1), 'naranja')
  assert.equal(dificultad(VENDER_LINO.rango, 29), 'naranja')
  assert.equal(dificultad(VENDER_LINO.rango, 30), 'amarillo')
  assert.equal(dificultad(VENDER_LINO.rango, 44), 'amarillo')
  assert.equal(dificultad(VENDER_LINO.rango, 45), 'verde')
  assert.equal(dificultad(VENDER_LINO.rango, 59), 'verde')
  assert.equal(dificultad(VENDER_LINO.rango, 60), 'gris')
  assert.equal(dificultad(VENDER_LINO.rango, 300), 'gris')
})

test('dificultad: no se aprende antes de tiempo y desconocida sin umbrales', () => {
  assert.equal(VENDA_GRUESA.rango.aprende, 40)
  assert.equal(dificultad(VENDA_GRUESA.rango, 39), 'no')
  assert.equal(dificultad(VENDA_GRUESA.rango, 40), 'naranja')
  const sinUmbrales = { aprende: null, amarillo: null, verde: null, gris: null }
  assert.equal(dificultad(sinUmbrales, 10), 'desconocida')
  assert.equal(dificultad(null, 10), 'desconocida')
  assert.equal(dificultad(VENDER_LINO.rango, 'x'), 'desconocida')
})

test('probSubida: 1 en naranja, decae en amarillo/verde, 0 en gris', () => {
  assert.equal(probSubida(VENDER_LINO.rango, 1), 1)
  assert.equal(probSubida(VENDER_LINO.rango, 30), 1)
  assert.ok(Math.abs(probSubida(VENDER_LINO.rango, 40) - 2 / 3) < 1e-9)
  assert.equal(probSubida(VENDER_LINO.rango, 45), 0.5)
  assert.ok(Math.abs(probSubida(VENDER_LINO.rango, 55) - 1 / 6) < 1e-9)
  assert.equal(probSubida(VENDER_LINO.rango, 60), 0)
  assert.equal(probSubida(VENDER_LINO.rango, 75), 0)
  assert.equal(probSubida(VENDA_GRUESA.rango, 20), 0)   // 'no'
})

test('preciosDelMercado: reino pedido, market.realm o el primero; vacío sin mercado', () => {
  const p = preciosDelMercado(MERCADO, 'Prueba')
  assert.equal(p.get(2589), 120)
  assert.equal(p.size, 1)                              // el itemId null no entra
  assert.equal(preciosDelMercado(MERCADO, 'Otro').get(2589), 120)  // cae a market.realm/primero
  assert.equal(preciosDelMercado(MERCADO, null).get(2589), 120)
  assert.equal(preciosDelMercado({}, 'Prueba').size, 0)
  assert.equal(preciosDelMercado(null, 'Prueba').size, 0)
  const dos = { snapshot: { realms: [
    { name: 'A', items: [{ itemId: 1, unitPriceCopper: 5 }] },
    { name: 'B', items: [{ itemId: 1, unitPriceCopper: 9 }] },
  ] } }
  assert.equal(preciosDelMercado(dos, 'B').get(1), 9)
  assert.equal(preciosDelMercado(dos, null).get(1), 5) // sin market.realm: el primero
})

test('costoUnidad: vendedor gana a la subasta; subasta; y sin datos', () => {
  const vacio = new Map()
  // Paño de lino (2589): no es de vendedor -> subasta cuando hay precio.
  assert.deepEqual(costoUnidad(2589, new Map([[2589, 120]]), items), { cobre: 120, fuente: 'subasta' })
  assert.deepEqual(costoUnidad(2589, vacio, items), { cobre: null, fuente: null })
  // Hilo basto (2320): vendedor=1, compra_cobre=10 -> precio de vendedor aunque haya subasta.
  const hilo = items['2320']
  assert.equal(hilo[10], 1)
  assert.equal(hilo[9], 10)
  assert.deepEqual(costoUnidad(2320, new Map([[2320, 999]]), items), { cobre: 10, fuente: 'vendedor' })
  assert.deepEqual(costoUnidad(2320, vacio, items), { cobre: 10, fuente: 'vendedor' })
  assert.deepEqual(costoUnidad(999999, vacio, items), { cobre: null, fuente: null })
})

test('costoReceta de la Venda de lino con precio de subasta de Paño de lino', () => {
  const c = costoReceta(VENDER_LINO, new Map([[2589, 120]]), items)
  assert.equal(c.total, 120)
  assert.deepEqual(c.faltan, [])
  assert.equal(c.partes.length, 1)
  assert.deepEqual(c.partes[0], { item: 2589, cant: 1, cobre: 120, fuente: 'subasta' })
  // Sin precio del paño no hay total.
  const sin = costoReceta(VENDER_LINO, new Map(), items)
  assert.equal(sin.total, null)
  assert.deepEqual(sin.faltan, [2589])
})

test('valorCreado: subasta, venta al vendedor de respaldo, null en encantamientos', () => {
  // 1251 (Venda de lino) no está en el mercado -> respaldo venta_cobre = 10.
  assert.equal(items['1251'][5], 10)
  assert.equal(valorCreado(VENDER_LINO, new Map(), items), 10)
  // Con subasta del producto creado manda la subasta.
  assert.equal(valorCreado(VENDER_LINO, new Map([[1251, 50]]), items), 50)
  // Encantamiento: crea null -> null (y margen null).
  const enc = profesiones.profesiones['333'].recetas.find((r) => r.crea === null)
  assert.ok(enc)
  assert.equal(valorCreado(enc, new Map([[10940, 800]]), items), null)
  assert.equal(margen(enc, new Map(), items), null)
  // Margen de la venda con subasta: 120 costo, valor 10 -> -110.
  assert.equal(margen(VENDER_LINO, new Map([[2589, 120]]), items), 10 - 120)
})

test('planDeSubida de Primeros auxilios de 1 a 75 cubre todo y termina', () => {
  const plan = planDeSubida(FA, 1, 75, new Map(), items)
  assert.ok(plan.length > 0)
  assert.equal(plan[0].desde, 1)
  assert.equal(plan[plan.length - 1].hasta, 75)
  for (let i = 0; i < plan.length; i++) {
    if (i) assert.equal(plan[i].desde, plan[i - 1].hasta, 'hueco en el plan')
    assert.ok(plan[i].spell !== undefined)
    assert.ok(plan[i].crafteos >= 0)
  }
  // Con mercado (paño a 120) el plan sigue cubriendo y algunos pasos tienen costo.
  const conPrecio = planDeSubida(FA, 1, 75, new Map([[2589, 120]]), items)
  assert.equal(conPrecio[0].desde, 1)
  assert.equal(conPrecio[conPrecio.length - 1].hasta, 75)
  assert.ok(conPrecio.some((p) => p.costo !== null))
  // Entradas inválidas no lanzan.
  assert.deepEqual(planDeSubida(FA, 75, 1, new Map(), items), [])
  assert.deepEqual(planDeSubida(FA, 1, 75, new Map(), items).length > 0, true)
  assert.deepEqual(planDeSubida(null, 1, 75, new Map(), items), [])
})

test('dificultadReceta: sin requisito conocido no se presenta como aprendible', () => {
  const herreria = profesiones.profesiones['164'].recetas
  const nueva = herreria.find((r) => r.n.en === 'Blessed Plate Gauntlet')
  assert.ok(nueva, 'receta nueva de Forever en los datos')
  assert.equal(nueva.rango.aprende, null)
  assert.equal(nueva.como, 'desconocido')
  assert.equal(dificultad(nueva.rango, 120), 'naranja')          // el umbral solo, sin requisito
  assert.equal(dificultadReceta(nueva, 120), 'desconocida')
  assert.equal(dificultadReceta(nueva, 300), 'gris')
  const auto = herreria.find((r) => r.como === 'automatica')
  assert.equal(auto.rango.aprende, null)
  assert.equal(dificultadReceta(auto, 0), 'naranja')             // automática: se aprende al tomar la profesión
  assert.equal(dificultadReceta(VENDA_GRUESA, 39), 'no')
  assert.equal(dificultadReceta(VENDA_GRUESA, 40), dificultad(VENDA_GRUESA.rango, 40))
})
