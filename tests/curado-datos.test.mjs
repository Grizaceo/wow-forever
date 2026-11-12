// tests/curado-datos.test.mjs — las guías curadas que se publican no contradicen los
// datos generados. Corre tools/auditar-curado.mjs sobre ellas y exige que todo hallazgo
// esté revisado en tools/curado-revisado.json, con su motivo. También comprueba que el
// auditor detecta errores sembrados en una guía de prueba.
//
//   node --test tests/

import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import {
  ROOT, GUIAS_PUBLICADAS, auditar, cargarDatos, cargarGuias, cargarLegacy, cargarRevisados, clave,
  hechizosDeMacro, misionesCitadas,
} from '../tools/auditar-curado.mjs'

const D = cargarDatos()

test('el auditor revisa exactamente las guías que publica la página', () => {
  const src = fs.readFileSync(path.join(ROOT, 'desktop', 'src', 'datos.js'), 'utf8')
  const m = src.match(/export const GUIAS = \{([^}]*)\}/)
  assert.ok(m, 'no encontré GUIAS en desktop/src/datos.js')
  const pub = Object.fromEntries(m[1].split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.split(':').map((y) => y.trim())))
  assert.deepEqual(
    Object.entries(pub).map(([k, v]) => [Number(k), v]).sort(),
    GUIAS_PUBLICADAS.map((g) => [g.clase, g.exp]).sort())
})

test('las guías publicadas no tienen hallazgos sin revisar', () => {
  const revisados = cargarRevisados()
  const hs = auditar(D, cargarGuias(), cargarLegacy())
  const sinRevisar = hs.filter((h) => !revisados.has(clave(h)))
  assert.deepEqual(sinRevisar.map((h) => `[${h.tipo}] ${h.texto} — ${h.detalle} (${h.guia} ${h.donde})`), [])
})

test('cada revisión tiene motivo y corresponde a un hallazgo actual', () => {
  const revisados = cargarRevisados()
  const claves = new Set(auditar(D, cargarGuias(), cargarLegacy()).map(clave))
  for (const [k, e] of revisados) {
    assert.ok(typeof e.motivo === 'string' && e.motivo.length > 20, `${k}: falta el motivo`)
    assert.ok(claves.has(k), `${k}: ya no aparece en el auditor; quítalo de tools/curado-revisado.json`)
  }
})

// Una guía de prueba con un error de cada tipo que el auditor tiene que ver.
const FALSA_CAZADOR = {
  id: 'prueba', clase: 3, G: {
    prefNote: "Escribe 'Una Misión Inventada' para probar.",
    dungeons: [
      { n: 'Wailing Caverns', r: [17, 24], loot: [['Venomstrike', 'Arco — Lady Anacondra'], ['Mutant Scale Breastplate', 'Pecho — Mutanus the Devourer ~90%']] },
      { n: 'Ciudad Inventada', r: [10, 12], loot: [] },
    ],
    macros: [{ lvl: 10, n: 'Multi', code: '#showtooltip\n/cast [@mouseover,harm][] Multi-Shot' }],
    bar: { keys: [{ k: '1', o: [{ m: 'No existe' }] }] },
    factions: {
      alliance: {
        weapons: [
          { n: 'Crude Axe', t: 'axe', dps: 1.7, lvl: 1 },
          { n: 'Venomstrike', t: 'bow', dps: 12, lvl: 19, q: 'rare', src: "Quest 'Dangerous!' — Hillsbrad" },
        ],
        routes: { ek: [{ min: 1, max: 9, zones: 'Azuremyst → Bloodmyst?', notes: 'Sos draenei. Un orco también.' }] },
      },
    },
  },
}
const FALSA_CHAMAN = { id: 'prueba-chaman', clase: 7, G: { prefNote: 'El chamán va sin 2H.' } }
const FALSA_LEGACY = { gatherNote: 'Acá estás vos: tu nivel 28 ya no consigue esto.' }

test('el auditor detecta los errores sembrados', () => {
  const hs = auditar(D, [FALSA_CAZADOR, FALSA_CHAMAN], FALSA_LEGACY)
  const tipos = (t) => hs.filter((h) => h.tipo === t).map((h) => h.texto)
  assert.ok(tipos('raza-inexistente').some((x) => /draenei/i.test(x)), 'draenei')
  assert.ok(tipos('raza-clase').some((x) => /orco/i.test(x)), 'orco en la Alianza')
  assert.ok(tipos('lugar-inexistente').includes('Azuremyst'), 'Azuremyst')
  assert.ok(tipos('borrador').length > 0, 'resto de borrador')
  assert.ok(tipos('item-inexistente').includes('Crude Axe'), 'arma inventada')
  assert.ok(tipos('item-dps').includes('Venomstrike'), 'DPS distinto')
  assert.ok(tipos('fuente-mision').some((x) => /Dangerous!/.test(x)), 'misión que no da el ítem')
  assert.ok(tipos('botin-jefe').includes('Venomstrike'), 'jefe equivocado')
  assert.ok(tipos('botin-prob').includes('Mutant Scale Breastplate'), 'probabilidad muy distinta')
  assert.ok(tipos('dungeon-desconocido').includes('Ciudad Inventada'), 'dungeon inventado')
  assert.ok(tipos('hechizo-nivel').includes('Multi-Shot'), 'hechizo antes de su nivel')
  assert.ok(tipos('barra').includes('No existe'), 'tecla sin macro')
  assert.ok(tipos('mision-desconocida').includes('Una Misión Inventada'), 'misión inventada')
  assert.ok(tipos('afirma-no-usable').length > 0, '«sin 2H» para una clase con 2H')
  assert.ok(tipos('personal').length >= 2, 'consejo para un personaje concreto')
})

test('lectura de macros y de títulos citados', () => {
  assert.deepEqual(hechizosDeMacro('#showtooltip\n/castsequence reset=target/combat Hunter\'s Mark, Serpent Sting\n/cast [mod:shift] !Aspect of the Cheetah; !Aspect of the Hawk\n/use 13').map((x) => x.nombre),
    ["Hunter's Mark", 'Serpent Sting', 'Aspect of the Cheetah', 'Aspect of the Hawk'])
  assert.deepEqual(misionesCitadas("Trinket — quest 'The Pariah's Instructions' y 'Dangerous!' → Bow of Plunder"),
    ["The Pariah's Instructions", 'Dangerous!'])
})
