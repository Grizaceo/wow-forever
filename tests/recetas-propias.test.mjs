// node --test tests/recetas-propias.test.mjs
// Recetas propias: semilla declarada contra los datos reales, normalización del estado,
// alternar sin mutar, semilla-vs-guardado (incluido «lo borré») y guardado con relectura.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  CLAVE, SEMILLA, VERSION, alternar, guardarPropias, leerPropias, normalizarEstado,
  normalizarLista, resumenRecetario,
} from '../desktop/src/recetas-propias.js'

const datos = JSON.parse(readFileSync(new URL('../data/profesiones.json', import.meta.url), 'utf8'))
const cocina = datos.profesiones['185']

// La lista tal como la declaró el jugador (nombre en inglés de la receta).
const DECLARADAS = [
  'Undermine Clam Chowder', 'Charred Wolf Meat',
  'Crispy Lizard Tail', 'Herb Baked Egg',
  'Roasted Boar Meat',
  'Tender Wolf Steak', 'Hot Wolf Ribs', 'Hot Lion Chops',
  'Strider Stew',
  'Baked Salmon', 'Lobster Stew', 'Nightfin Soup', 'Spotted Yellowtail', 'Smoked Sagefish', 'Rainbow Fin Albacore',
  'Mightfish Steak', 'Poached Sunscale Salmon', 'Cooked Glossy Mightfish', 'Mithril Headed Trout', 'Longjaw Mud Snapper', 'Brilliant Smallfish',
  'Grilled Squid',
  'Filet of Redgill', 'Rockscale Cod', 'Bristle Whisker Catfish',
]

const mem = (inicial = {}) => {
  const m = new Map(Object.entries(inicial))
  return {
    m,
    storage: {
      get: async (k) => (m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null),
      set: async (k, v) => { m.set(k, JSON.parse(JSON.stringify(v))) },
    },
  }
}

test('la semilla son las 25 recetas declaradas y existen en Cocina', () => {
  assert.equal(SEMILLA.length, 25)
  assert.equal(DECLARADAS.length, 25)
  assert.deepEqual(normalizarLista(SEMILLA), [...new Set(SEMILLA)].sort((a, b) => a - b), 'sin repetidos')
  const porNombre = new Map(cocina.recetas.map((r) => [r.n.en, r.spell]))
  for (const nombre of DECLARADAS) {
    const spell = porNombre.get(nombre)
    assert.ok(Number.isSafeInteger(spell), `«${nombre}» no es una receta de Cocina en los datos`)
    assert.ok(SEMILLA.includes(spell), `«${nombre}» (spell ${spell}) falta en SEMILLA`)
  }
  // Y al revés: cada spell de la semilla pertenece a Cocina, sin sobrantes.
  const spells = new Set(cocina.recetas.map((r) => r.spell))
  for (const s of SEMILLA) assert.ok(spells.has(s), `el spell ${s} no está en Cocina`)
})

test('normalizarLista: enteros positivos, sin repetir, ordenados', () => {
  assert.deepEqual(normalizarLista([9, 3, 3, -1, 0, 2.5, '7', null, 1]), [1, 3, 9])
  assert.deepEqual(normalizarLista(undefined), [])
  assert.deepEqual(normalizarLista('258'), [])
})

test('normalizarEstado acepta solo el contrato {v, spells:[…]}', () => {
  assert.deepEqual(normalizarEstado({ v: VERSION, spells: [5, 2] }), [2, 5])
  assert.deepEqual(normalizarEstado({ v: VERSION, spells: [] }), [])
  assert.equal(normalizarEstado(null), null)
  assert.equal(normalizarEstado([]), null)
  assert.equal(normalizarEstado({ v: VERSION + 1, spells: [2] }), null)
  assert.equal(normalizarEstado({ v: VERSION, spells: 'x' }), null)
  assert.equal(normalizarEstado({ v: VERSION, spells: [2, 'x'] }), null)
})

test('alternar marca y desmarca sin mutar la lista recibida', () => {
  const base = [10, 20]
  assert.deepEqual(alternar(base, 30), [10, 20, 30])
  assert.deepEqual(alternar(base, 10), [20])
  assert.deepEqual(base, [10, 20], 'la lista original no se toca')
  assert.deepEqual(alternar(base, 0), [10, 20])
  assert.deepEqual(alternar(base, 'x'), [10, 20])
})

test('sin estado guardado se siembra; con estado vacío guardado NO se vuelve a sembrar', async () => {
  const vacio = mem()
  const a = await leerPropias(vacio)
  assert.equal(a.origen, 'semilla')
  assert.deepEqual(a.spells, normalizarLista(SEMILLA))

  const borrado = mem({ [CLAVE]: { v: VERSION, spells: [] } })
  const b = await leerPropias(borrado)
  assert.equal(b.origen, 'guardadas')
  assert.deepEqual(b.spells, [], 'si el jugador borró todas, no reaparecen')

  const corrupto = mem({ [CLAVE]: { v: 999, spells: [1, 2] } })
  assert.deepEqual((await leerPropias(corrupto)).spells, normalizarLista(SEMILLA))
})

test('guardarPropias persiste y confirma releyendo', async () => {
  const ctx = mem()
  const guardadas = await guardarPropias(ctx, [20626, 2538, 20626])
  assert.deepEqual(guardadas, [2538, 20626])
  assert.deepEqual(ctx.m.get(CLAVE), { v: VERSION, spells: [2538, 20626] })
  assert.deepEqual((await leerPropias(ctx)).spells, [2538, 20626])
})

test('guardarPropias falla si el storage no devuelve lo escrito', async () => {
  const ctx = { storage: { get: async () => null, set: async () => {} } }
  await assert.rejects(() => guardarPropias(ctx, [1]), /No se confirmó/)
})

test('resumenRecetario cuenta propias y lista los spells faltantes ordenados', () => {
  const recetas = [{ spell: 30 }, { spell: 10 }, { spell: 20 }, { n: {} }]
  const r = resumenRecetario(recetas, [10, 30])
  assert.deepEqual(r, { tiene: 2, total: 3, faltantes: [20] })
  assert.deepEqual(resumenRecetario(null, [1]), { tiene: 0, total: 0, faltantes: [] })
  assert.deepEqual(resumenRecetario(recetas, []), { tiene: 0, total: 3, faltantes: [10, 20, 30] })
})
