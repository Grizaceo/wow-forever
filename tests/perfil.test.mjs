// node --test tests/perfil.test.mjs — usa el data/personaje.json real generado.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
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

test('las 56 combinaciones valen en todos los niveles de prueba', () => {
  const niveles = [1, 10, 20, 40, 60]
  for (const [raza, clase] of personaje.combinaciones) {
    const faccion = personaje.razas[String(raza)].faccion
    for (const nivel of niveles) {
      const r = validarPerfil({ raza, clase, nivel }, personaje)
      assert.equal(r.ok, true, `raza ${raza} clase ${clase} nivel ${nivel}: ${r.errores}`)
      assert.equal(r.perfil.faccion, faccion)
      assert.equal(r.perfil.nivel, nivel)
    }
  }
})

test('casos pedidos: paladín Horda, chamán Alianza, razas 95/96', () => {
  const casos = [
    [{ raza: NOMUERTO, clase: PALADIN, nivel: 60 }, 'horda'],
    [{ raza: ENANO, clase: CHAMAN, nivel: 1 }, 'alianza'],
    [{ raza: 95, clase: GUERRERO, nivel: 1 }, 'alianza'],
    [{ raza: 96, clase: DRUIDA, nivel: 60 }, 'horda'],
  ]
  for (const [entrada, faccion] of casos) {
    const r = validarPerfil(entrada, personaje)
    assert.equal(r.ok, true, r.errores.join(','))
    assert.equal(r.perfil.faccion, faccion)
  }
})

test('profesiones: IDs válidos, duplicados, desconocidos y tope de 2', () => {
  const base = { raza: ORCO, clase: GUERRERO, nivel: 5 }
  assert.deepEqual(validarPerfil({ ...base, profesiones: [164, 186], secundarias: [185, 129, 356] }, personaje).perfil.secundarias, [129, 185, 356])
  const malo = validarPerfil({ ...base, profesiones: [164, '186', 164, 393, 202, 0, -1, 1.5], secundarias: [164, 999] }, personaje)
  assert.deepEqual(malo.perfil.profesiones, [164, 186])
  assert.ok(malo.errores.includes('profesiones') && malo.errores.includes('secundarias'))
})

test('reino: trim, corte a 64 y tipo inválido', () => {
  const base = { raza: ORCO, clase: GUERRERO, nivel: 5 }
  assert.equal(validarPerfil({ ...base, reino: '  Mi reino  ' }, personaje).perfil.reino, 'Mi reino')
  assert.equal(validarPerfil({ ...base, reino: 'x'.repeat(100) }, personaje).perfil.reino.length, 64)
  const r = validarPerfil({ ...base, reino: 123 }, personaje)
  assert.ok(r.errores.includes('reino'))
  assert.equal(r.perfil.reino, '')
})

test('paridad JS/Python: fixture compartido tests/fixtures/perfil-paridad.json', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/perfil-paridad.json', import.meta.url), 'utf8'))
  assert.equal(fx.contrato, 'perfil-v1')
  for (const c of fx.casos) {
    assert.deepEqual(validarPerfil(c.entrada, personaje), c.esperado, c.nombre)
  }
})

// Paridad EJECUTADA: Python valida en su propio proceso con su propia copia del
// contrato; Node valida aquí. No se compara contra un `esperado` pregenerado.
function pararEnPython(casos, personajePara = personaje) {
  const script = new URL('../skills/wow-forever/scripts/perfil.py', import.meta.url).pathname
  const r = spawnSync('python3', [script], {
    input: JSON.stringify({ personaje: personajePara, casos }),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  assert.equal(r.status, 0, `python3 falló: ${r.stderr}`)
  return JSON.parse(r.stdout)
}

test('paridad EJECUTADA JS/Python: fixture + 56 combinaciones x 5 niveles', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/perfil-paridad.json', import.meta.url), 'utf8'))
  const casos = fx.casos.map((c) => c.entrada)
  for (const [raza, clase] of personaje.combinaciones) {
    for (const nivel of [1, 10, 20, 40, 60]) casos.push({ raza, clase, nivel })
  }
  const salida = pararEnPython(casos)
  assert.equal(salida.length, casos.length)
  for (let i = 0; i < casos.length; i++) {
    // JSON.stringify es la forma persistida: Infinity -> null, surrogados sueltos -> \udXXX.
    const js = JSON.parse(JSON.stringify(validarPerfil(casos[i], personaje)))
    assert.deepEqual(salida[i], js, `caso ${i}: ${JSON.stringify(casos[i])}`)
  }
})

test('paridad EJECUTADA con personaje atípico y entradas array/string/null', () => {
  const raro = JSON.parse(JSON.stringify(personaje))
  raro.razas['1'] = 'notdict'
  raro.razas['2'] = {}
  raro.clases['3'] = 'x'
  const casos = [
    { raza: 1, clase: 1, nivel: 5 },
    { raza: 2, clase: 1, nivel: 5 },
    { raza: 1, clase: 3, nivel: 5 },
    null, 'x', [], {},
    { raza: '9'.repeat(400), clase: 3, nivel: 5 },
    { raza: 1, clase: 3, nivel: '9'.repeat(400) },
  ]
  const salida = pararEnPython(casos, raro)
  for (let i = 0; i < casos.length; i++) {
    const js = JSON.parse(JSON.stringify(validarPerfil(casos[i], raro)))
    assert.deepEqual(salida[i], js, `caso ${i}: ${JSON.stringify(casos[i])}`)
  }
})

test('perfilParaAgente: resumen con nombres e IDs, sin el reino', async () => {
  const { perfilParaAgente } = await import('../src/perfil.js')
  const profesiones = JSON.parse(readFileSync(new URL('../data/profesiones.json', import.meta.url), 'utf8')).profesiones
  const nombres = Object.fromEntries(Object.entries(profesiones).map(([id, p]) => [id, p.n]))
  const r = validarPerfil({ raza: NOMUERTO, clase: PALADIN, nivel: 24, profesiones: [164, 186], secundarias: [185], reino: 'Mi reino' }, personaje)
  assert.equal(perfilParaAgente(r.perfil, personaje, nombres),
    'Mi personaje de WoW Forever (plugin wow-forever): Horda · No-muerto (Undead, raza 5) · Paladín (Paladin, clase 2) · nivel 24 · ' +
    'profesiones: Herrería (Blacksmithing, id 164), Minería (Mining, id 186) · secundarias: Cocina (Cooking, id 185)')
  const enano = validarPerfil({ raza: ENANO, clase: CHAMAN, nivel: 1, profesiones: [], secundarias: [] }, personaje)
  assert.equal(perfilParaAgente(enano.perfil, personaje, nombres),
    'Mi personaje de WoW Forever (plugin wow-forever): Alianza · Enano (Dwarf, raza 3) · Chamán (Shaman, clase 7) · nivel 1')
  assert.equal(perfilParaAgente({ faccion: 'horda', raza: null, clase: 2 }, personaje, nombres), null)
})
