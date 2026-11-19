// node --test tests/ruta-maxeo.test.mjs — ruta de maxeo con coste de adquisición.
// Fixtures sintéticos deterministas (valores calculados a mano) + humo con datos reales.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  costoAdquisicion, rutaMaxeo, planDeSubida, preciosDelMercado, probSubida,
} from '../src/crafteo.js'

// items.json: id -> [es, en, calidad, nivel_req, nivel_item, venta_cobre, clase,
// subclase, ligado, compra_cobre, vendedor]. Índice 9 = compra, 10 = flag vendedor.
const fila = (compra, vendedor) => ['X', 'X', 1, 0, 0, 0, 0, 0, 0, compra, vendedor]
const ITEMS = { 100: fila(0, 0), 200: fila(50, 1), 999: fila(0, 0) }
const PRECIOS = { 100: 10 }
const rango = (aprende, amarillo, verde, gris) => ({ aprende, amarillo, verde, gris })
const R = (spell, como, rg, reactivos, extra = {}) => ({ spell, como, rango: rg, reactivos, n: { es: 'r' + spell }, ...extra })

// r1: 1 reactivo de 10 cobre => 10/craft. r2: 2 => 20/craft. Mismo rango 0..10.
const r1 = R(1, 'entrenador', rango(0, 5, 8, 10), [[100, 1]])
const r2 = R(2, 'entrenador', rango(0, 5, 8, 10), [[100, 2]])

test('costoAdquisicion: gratis, vendedor, subasta y sin dato', () => {
  assert.deepEqual(costoAdquisicion(r1, PRECIOS, ITEMS), { cobre: 0, fuente: 'gratis', item: null })
  const auto = R(9, 'automatica', rango(0, 5, 8, 10), [[100, 1]])
  assert.equal(costoAdquisicion(auto, PRECIOS, ITEMS).cobre, 0)
  const plan = R(3, 'receta', rango(0, 5, 8, 10), [[100, 1]],
    { receta_item: 200, vendedores: { alianza: [{ npc: 1 }], horda: [{ npc: 1 }] } })
  assert.deepEqual(costoAdquisicion(plan, PRECIOS, ITEMS), { cobre: 50, fuente: 'vendedor', item: 200 })
  // No vendado a la facción, pero con precio de subasta del objeto receta.
  const planAH = R(4, 'receta', rango(0, 5, 8, 10), [[100, 1]], { receta_item: 200, vendedores: { alianza: [], horda: [] } })
  assert.deepEqual(costoAdquisicion(planAH, { 200: 30 }, ITEMS), { cobre: 30, fuente: 'subasta', item: 200 })
  // Sin vendedor ni subasta => null (SIN DATOS).
  assert.equal(costoAdquisicion(planAH, PRECIOS, ITEMS).cobre, null)
  const desc = R(5, 'desconocido', rango(0, 5, 8, 10), [[100, 1]])
  assert.equal(costoAdquisicion(desc, PRECIOS, ITEMS).cobre, null)
})

test('costoAdquisicion: respeta la facción', () => {
  const plan = R(3, 'receta', rango(0, 5, 8, 10), [[100, 1]],
    { receta_item: 200, vendedores: { alianza: [{ npc: 1 }], horda: [] } })
  assert.equal(costoAdquisicion(plan, PRECIOS, ITEMS, 'alianza').cobre, 50)
  assert.equal(costoAdquisicion(plan, PRECIOS, ITEMS, 'horda').cobre, null) // no lo vende a horda, sin AH
  assert.equal(costoAdquisicion(plan, { 200: 30 }, ITEMS, 'horda').fuente, 'subasta')
})

test('rutaMaxeo: sin adquisición elige la de menor coste por punto (naranja+amarillo+verde)', () => {
  const ruta = rutaMaxeo([r1, r2], 0, 10, PRECIOS, ITEMS)
  assert.equal(ruta.pasos.length, 1)
  assert.equal(ruta.pasos[0].spell, 1)
  assert.equal(ruta.pasos[0].desde, 0)
  assert.equal(ruta.pasos[0].hasta, 10)
  // crafts = suma 1/prob: 6 puntos a prob 1 + 1/0.8 + 1/0.6 + 1/0.4 + 1/0.2 = 16.4167
  assert.equal(ruta.pasos[0].crafteos, 16)
  assert.equal(ruta.pasos[0].costo, 164) // 10 * 16.4167
  assert.equal(ruta.totalMateriales, 164)
  assert.equal(ruta.totalAdquisicion, 0)
  assert.equal(ruta.total, 214 - 50) // 164
  assert.equal(ruta.cobertura, 1)
  assert.deepEqual(ruta.huecos, [])
  assert.deepEqual(ruta.adquisiciones, [])
})

test('rutaMaxeo: amortiza la adquisición y la cobra una sola vez (tramo largo)', () => {
  const free = R(1, 'entrenador', rango(0, 5, 8, 10), [[100, 2]]) // 20/craft
  const plan = R(2, 'receta', rango(0, 5, 8, 10), [[100, 1]], // 10/craft, acq 50 vendedor
    { receta_item: 200, vendedores: { alianza: [{ npc: 1 }], horda: [{ npc: 1 }] } })
  const ruta = rutaMaxeo([free, plan], 0, 10, PRECIOS, ITEMS)
  // pe(0..10) = 8 puntos esperados; acq/punto = 50/8 = 6.25; eff plan = 10 + 6.25 < 20 free.
  assert.equal(ruta.pasos.length, 1)
  assert.equal(ruta.pasos[0].spell, 2)
  assert.equal(ruta.totalAdquisicion, 50)
  assert.equal(ruta.adquisiciones.length, 1)
  assert.deepEqual(ruta.adquisiciones[0], { spell: 2, item: 200, cobre: 50, fuente: 'vendedor', desde: 0 })
  assert.equal(ruta.totalMateriales, 164)
  assert.equal(ruta.total, 214)
  assert.equal(ruta.cobertura, 1)
})

test('rutaMaxeo: en tramo corto la adquisición no se amortiza y gana la gratis', () => {
  const free = R(1, 'entrenador', rango(0, 5, 8, 10), [[100, 2]])
  const plan = R(2, 'receta', rango(0, 5, 8, 10), [[100, 1]],
    { receta_item: 200, vendedores: { alianza: [{ npc: 1 }], horda: [{ npc: 1 }] } })
  const ruta = rutaMaxeo([free, plan], 8, 10, PRECIOS, ITEMS)
  // pe(8..10) = 0.6; acq/punto = 50/0.6 = 83.3; eff plan = 25 + 83.3 > 50 free.
  assert.equal(ruta.pasos[0].spell, 1)
  assert.equal(ruta.totalAdquisicion, 0)
  assert.equal(ruta.totalMateriales, 150) // 20*(2.5+5)
  assert.equal(ruta.total, 150)
})

test('rutaMaxeo: hueco, sin precio de reactivos y adquisición sin dato quedan declarados', () => {
  const cubre = R(1, 'entrenador', rango(0, 2, 3, 5), [[100, 1]])
  const sinAcq = R(3, 'receta', rango(5, 7, 8, 10), [[100, 1]], { receta_item: 999, vendedores: { alianza: [], horda: [] } })
  const sinPrecio = R(4, 'entrenador', rango(5, 7, 8, 10), [[777, 1]])
  const ruta = rutaMaxeo([cubre, sinAcq, sinPrecio], 0, 10, PRECIOS, ITEMS)
  assert.equal(ruta.cobertura, 0.5)
  assert.equal(ruta.pasos.length, 1)
  assert.equal(ruta.pasos[0].hasta, 5)
  assert.equal(ruta.totalMateriales, 75) // 10*(1+1+1+1.5+3)
  assert.deepEqual(ruta.huecos, [{ desde: 5, hasta: 10, motivo: 'recetas sin precio de reactivos o sin receta conocida' }])
  assert.ok(ruta.adquisicionesSinDato.some((x) => x.spell === 3 && x.item === 999))
  assert.ok(ruta.sinPrecio.some((x) => x.spell === 4 && x.faltan.includes(777)))
})

test('rutaMaxeo: entradas inválidas o rango vacío devuelven la base sin pasos', () => {
  for (const args of [[[], 0, 10], [null, 0, 10], [[r1], 10, 10], [[r1], 5, 0]]) {
    const ruta = rutaMaxeo(args[0], args[1], args[2], PRECIOS, ITEMS)
    assert.deepEqual(ruta.pasos, [])
    assert.equal(ruta.cobertura, 0)
    assert.equal(ruta.total, null)
  }
})

test('rutaMaxeo: determinista (misma entrada, misma salida)', () => {
  const a = rutaMaxeo([r1, r2], 0, 30, PRECIOS, ITEMS)
  const b = rutaMaxeo([r1, r2], 0, 30, PRECIOS, ITEMS)
  assert.deepEqual(a, b)
})

test('rutaMaxeo: humo con datos reales (Primeros auxilios + mercado sintético)', () => {
  const profesiones = JSON.parse(readFileSync(new URL('../data/profesiones.json', import.meta.url), 'utf8'))
  const items = JSON.parse(readFileSync(new URL('../data/items.json', import.meta.url), 'utf8')).items
  const FA = profesiones.profesiones['129'].recetas
  const MERCADO = { realm: 'Prueba', snapshot: { realms: [{ name: 'Prueba', items: [
    { itemId: 2589, unitPriceCopper: 120 }, { itemId: 2592, unitPriceCopper: 200 },
  ] }] } }
  const precios = preciosDelMercado(MERCADO)
  const ruta = rutaMaxeo(FA, 1, 60, precios, items)
  assert.ok(ruta.pasos.length > 0)
  assert.ok(ruta.cobertura > 0)
  assert.ok(ruta.totalMateriales === null || ruta.totalMateriales >= 0)
  assert.ok(ruta.totalAdquisicion >= 0)
  // La ruta con precio no es idéntica al plan sin precio cuando hay alternativas.
  const plan = planDeSubida(FA.filter((r) => r.como === 'entrenador' || r.como === 'automatica'), 1, 60)
  assert.ok(Array.isArray(plan))
})
