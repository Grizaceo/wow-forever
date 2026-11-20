// node --test tests/oficios.test.mjs
// Niveles de oficio declarados a mano (oficios.js): semilla real (Pesca 93), normalización,
// prioridad de lo guardado, «lo borré» sin resiembra y guardado con relectura.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  CLAVE, NIVEL_MAX, PESCA, SEMILLA, VERSION, guardarNiveles, leerNiveles, nivelDe,
  normalizarEstado, normalizarNiveles,
} from '../desktop/src/oficios.js'

const datos = JSON.parse(readFileSync(new URL('../data/profesiones.json', import.meta.url), 'utf8'))
const pesca = datos.profesiones[String(PESCA)]

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

test('la semilla es Pesca 93 y la profesión existe como secundaria de recolección', () => {
  assert.equal(SEMILLA[PESCA], 93)
  assert.deepEqual(Object.keys(SEMILLA), [String(PESCA)])
  assert.ok(pesca, 'la profesión 356 tiene que estar en los datos')
  assert.equal(pesca.tipo, 'secundaria')
  assert.equal(pesca.recoleccion, true)
})

test('normalizarNiveles descarta ids y niveles inválidos', () => {
  const out = normalizarNiveles({
    356: 93, '185': '75', 0: 10, [-1]: 10, 'abc': 10, 99999: 10,
    357: NIVEL_MAX + 1, 186: -1, 187: 12.5, 188: null,
  })
  assert.deepEqual(out, { 356: 93, 185: 75 })
  assert.deepEqual(normalizarNiveles(null), {})
  assert.deepEqual(normalizarNiveles([1, 2]), {})
})

test('normalizarEstado es estricto con la forma guardada', () => {
  assert.deepEqual(normalizarEstado({ v: VERSION, niveles: { 356: 93 } }), { 356: 93 })
  assert.deepEqual(normalizarEstado({ v: VERSION, niveles: {} }), {}, 'vacío es válido: lo borró')
  assert.equal(normalizarEstado({ v: VERSION + 1, niveles: { 356: 93 } }), null)
  assert.equal(normalizarEstado({ v: VERSION }), null)
  assert.equal(normalizarEstado({ v: VERSION, niveles: [] }), null)
  assert.equal(normalizarEstado({ v: VERSION, niveles: { 356: 301 } }), null)
  assert.equal(normalizarEstado({ v: VERSION, niveles: { x: 93 } }), null)
  assert.equal(normalizarEstado('basura'), null)
})

test('sin nada guardado se lee la semilla declarada', async () => {
  const { niveles, origen } = await leerNiveles(mem())
  assert.equal(origen, 'semilla')
  assert.deepEqual(niveles, { 356: 93 })
})

test('lo guardado manda sobre la semilla', async () => {
  const ctx = mem({ [CLAVE]: { v: VERSION, niveles: { 356: 150, 185: 300 } } })
  const { niveles, origen } = await leerNiveles(ctx)
  assert.equal(origen, 'declarados')
  assert.deepEqual(niveles, { 356: 150, 185: 300 })
})

test('un estado vacío guardado no vuelve a sembrar', async () => {
  const ctx = mem({ [CLAVE]: { v: VERSION, niveles: {} } })
  const { niveles, origen } = await leerNiveles(ctx)
  assert.equal(origen, 'declarados')
  assert.deepEqual(niveles, {})
})

test('un estado corrupto cae a la semilla en vez de romper la vista', async () => {
  const ctx = mem({ [CLAVE]: { v: 99, niveles: 'nada' } })
  const { niveles, origen } = await leerNiveles(ctx)
  assert.equal(origen, 'semilla')
  assert.deepEqual(niveles, { 356: 93 })
  const roto = { storage: { get: async () => { throw new Error('sin storage') } } }
  assert.deepEqual((await leerNiveles(roto)).niveles, { 356: 93 })
})

test('guardarNiveles persiste, confirma y rechaza lo que no se recupera', async () => {
  const ctx = mem()
  const limpio = await guardarNiveles(ctx, { 356: '140', 0: 5, 185: 999 })
  assert.deepEqual(limpio, { 356: 140 })
  assert.deepEqual(ctx.m.get(CLAVE), { v: VERSION, niveles: { 356: 140 } })
  assert.deepEqual((await leerNiveles(ctx)).niveles, { 356: 140 })
  const mudo = { storage: { get: async () => null, set: async () => {} } }
  await assert.rejects(() => guardarNiveles(mudo, { 356: 140 }), /No se confirmó/)
})

test('nivelDe es seguro con valores fuera de contrato', () => {
  assert.equal(nivelDe({ 356: 93 }, PESCA), 93)
  assert.equal(nivelDe({ 356: 999 }, PESCA, 7), 7)
  assert.equal(nivelDe({}, PESCA, null), null)
  assert.equal(nivelDe(null, PESCA), 0)
})
