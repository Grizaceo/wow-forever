// node --test tests/perfil.test.mjs — usa el data/personaje.json real generado.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { migrarPerfil, razasPara, validarPerfil, NIVEL_MAX } from '../src/perfil.js'

const personaje = JSON.parse(readFileSync(new URL('../data/personaje.json', import.meta.url), 'utf8'))
const HUMANO = 1, ENANO = 3, NOMUERTO = 5, ORCO = 2, CIELONATO_H = 96
const GUERRERO = 1, PALADIN = 2, CAZADOR = 3, CHAMAN = 7, DRUIDA = 11

test('un perfil completo y válido pasa sin cambios', () => {
  const r = validarPerfil({ raza: NOMUERTO, clase: PALADIN, nivel: 24, profesiones: [164, 186], secundarias: [356, 185], reino: ' Reino ' }, personaje)
  assert.equal(r.ok, true, r.errores.join(','))
  assert.deepEqual(r.perfil, { v: 1, faccion: 'horda', raza: NOMUERTO, clase: PALADIN, nivel: 24, profesiones: [164, 186], secundarias: [185, 356], reino: 'Reino' })
})

test('las combinaciones nuevas de Forever son válidas y las imposibles no', () => {
  assert.equal(validarPerfil({ raza: HUMANO, clase: CAZADOR, nivel: 1 }, personaje).ok, true)
  assert.equal(validarPerfil({ raza: ENANO, clase: CHAMAN, nivel: 1 }, personaje).ok, true)
  assert.equal(validarPerfil({ raza: CIELONATO_H, clase: DRUIDA, nivel: 1 }, personaje).ok, true)
  assert.deepEqual(validarPerfil({ raza: HUMANO, clase: DRUIDA, nivel: 1 }, personaje).errores, ['combinacion'])
})

test('la facción sale de la raza y una contradicción es error', () => {
  const r = validarPerfil({ raza: ORCO, clase: GUERRERO, nivel: 5, faccion: 'alianza' }, personaje)
  assert.equal(r.perfil.faccion, 'horda')
  assert.ok(r.errores.includes('faccion'))
})

test('nivel fuera de rango, profesiones de más o desconocidas', () => {
  const r = validarPerfil({ raza: ORCO, clase: GUERRERO, nivel: 99, profesiones: [171, 171, 164, 186, 9999], secundarias: [185, 171] }, personaje)
  assert.equal(r.perfil.nivel, NIVEL_MAX)
  assert.deepEqual(r.perfil.profesiones, [171, 164])
  assert.deepEqual(r.perfil.secundarias, [185])
  for (const e of ['nivel', 'profesiones', 'secundarias']) assert.ok(r.errores.includes(e), e)
})

test('entrada basura no lanza y no inventa datos', () => {
  for (const x of [null, undefined, 42, 'x', [], { raza: 'orco' }]) {
    const r = validarPerfil(x, personaje)
    assert.equal(r.ok, false)
    assert.equal(r.perfil.raza, null)
  }
})

test('las 9 clases tienen al menos una raza en cada facción', () => {
  for (const clase of Object.keys(personaje.clases).map(Number)) {
    for (const faccion of ['alianza', 'horda']) assert.ok(razasPara(personaje, faccion, clase).length > 0, `${clase} ${faccion}`)
  }
})

test('migración desde la guía anterior conserva clase, facción y nivel', () => {
  const m = migrarPerfil({ cls: 'shaman', fac: 'alliance', lvl: 33, eng: true }, personaje)
  assert.equal(m.razaSupuesta, true)
  assert.equal(m.perfil.raza, ENANO)
  assert.equal(m.perfil.faccion, 'alianza')
  assert.equal(m.perfil.clase, CHAMAN)
  assert.equal(m.perfil.nivel, 33)
  assert.deepEqual(m.perfil.profesiones, [202])
  assert.equal(migrarPerfil({ cls: 'hunter', fac: 'horde', lvl: '12' }, personaje).perfil.raza, ORCO)
  const vacio = migrarPerfil({}, personaje)
  assert.equal(vacio.razaSupuesta, false)
  assert.equal(vacio.perfil.clase, null)
})
