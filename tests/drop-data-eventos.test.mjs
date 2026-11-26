// El dataset público de drops no debe traer spawns que solo existen durante un
// evento del mundo (guerra de AQ, invasiones elementales, festividades): el
// recomendador los ponía como campamentos de todos los días. Los eventos que se
// repiten a diario («Nights») sí son mundo normal y se conservan.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const D = require('../standalone/drop-data.js')

test('drop-data: sin mobs de la guerra de AQ ni de las invasiones elementales', () => {
  const evento = {
    15748: 'Lesser Anubisath Warbringer', 15749: 'Lesser Silithid Flayer',
    15751: 'Anubisath Warbringer', 15810: 'Eroded Anubisath Warbringer',
    14455: 'Whirling Invader', 14460: 'Blazing Invader', 14461: 'Baron Charr',
    // Asedio de Cenarion Hold: sin fila en game_event_creature, en un grupo de
    // spawns que solo aparece con el world state de la guerra de AQ (2099).
    15743: 'Colossal Anubisath Warbringer', 15744: 'Imperial Qiraji Destroyer',
  }
  for (const [id, nombre] of Object.entries(evento)) {
    assert.equal(D.mobs[id], undefined, `${nombre} (${id}) es un spawn de evento`)
  }
})

test('drop-data: ningún ítem conserva una fuente de mob de evento', () => {
  const evento = new Set(['15743', '15744', '15748', '15749', '15751', '15752', '15807', '15808', '15810', '15811'])
  const conFuente = Object.entries(D.items)
    .filter(([, it]) => (it[10] || []).some((s) => s[0] === 'm' && evento.has(String(s[1]))))
    .map(([id]) => id)
  assert.deepEqual(conFuente, [])
})

test('drop-data: sin objetos de festividades (huevos, cosecha, Brewfest)', () => {
  for (const id of ['113772', '180370', '180754', '180905']) {
    assert.equal(D.objects[id], undefined, `objeto ${id} es de festividad`)
  }
})

test('drop-data: los spawns nocturnos diarios se conservan y la regla queda declarada', () => {
  assert.equal(D.mobs['572']?.[0], 'Leprithus')
  assert.equal(D.mobs['846']?.[0], 'Ghoul')
  assert.match(D.source.params.eventSpawns, /excluded.*except events recurring daily not linked/)
  assert.match(D.source.params.eventSpawns, /world state 2099/)
})
