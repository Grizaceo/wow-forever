// Limpieza de las claves heredadas del localStorage (desktop/src/legado.js).
//
// La clave `wow-hunter-guide.auction-path` la dejó la 1.0.0 con la ruta del
// Auctionator.lua elegida a mano. Desde la 2.0.0 el acceso es por carpeta
// concedida, así que nadie la lee: se borra sola con la API del navegador.
import assert from 'node:assert/strict'
import test from 'node:test'
import { CLAVES_HEREDADAS, limpiarClavesHeredadas } from '../desktop/src/legado.js'

// Doble de Storage: guarda en un Map y registra las operaciones.
function storageFalso(inicial = {}) {
  const datos = new Map(Object.entries(inicial))
  const ops = []
  return {
    datos,
    ops,
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    removeItem: (k) => { ops.push('removeItem'); datos.delete(k) },
    setItem: (k, v) => { ops.push('setItem'); datos.set(k, v) },
  }
}

test('borra la clave heredada y deja intacto el resto del almacenamiento', () => {
  const s = storageFalso({
    'wow-hunter-guide.auction-path': '/home/x/Games/WTF/SavedVariables/Auctionator.lua',
    'hermes.plugin.wow-hunter-guide.pestana': '"personaje"',
    'hermes.plugin.wow-hunter-guide.build': '{"realm":"ek"}',
  })
  const r = limpiarClavesHeredadas(s)
  assert.equal(r.borradas.length, 1)
  assert.equal(r.borradas[0], 'wow-hunter-guide.auction-path')
  assert.equal(r.error, null)
  // la fósil ya no está…
  assert.equal(s.datos.has('wow-hunter-guide.auction-path'), false)
  // …y el almacenamiento vivo del plugin sigue entero
  assert.equal(s.datos.get('hermes.plugin.wow-hunter-guide.pestana'), '"personaje"')
  assert.equal(s.datos.get('hermes.plugin.wow-hunter-guide.build'), '{"realm":"ek"}')
})

test('es idempotente: la segunda pasada no borra ni escribe', () => {
  const s = storageFalso({ 'wow-hunter-guide.auction-path': '/home/x/Auctionator.lua' })
  const primera = limpiarClavesHeredadas(s)
  const escrituras = s.ops.filter((o) => o === 'removeItem').length
  const segunda = limpiarClavesHeredadas(s)
  assert.equal(primera.borradas.length, 1)
  assert.deepEqual(segunda.borradas, [])
  assert.equal(s.ops.filter((o) => o === 'removeItem').length, escrituras)
})

test('sin la clave heredada no hace nada', () => {
  const s = storageFalso({ 'hermes.plugin.wow-hunter-guide.perfil': '"x"' })
  const r = limpiarClavesHeredadas(s)
  assert.deepEqual(r.borradas, [])
  assert.equal(r.error, null)
  assert.equal(s.datos.get('hermes.plugin.wow-hunter-guide.perfil'), '"x"')
})

test('sin almacenamiento local no rompe la carga', () => {
  const r = limpiarClavesHeredadas(null)
  assert.deepEqual(r.borradas, [])
  assert.ok(r.error)
})

test('un storage que lanza no propaga el error', () => {
  const roto = {
    getItem() { throw new Error('SecurityError') },
    removeItem() { throw new Error('SecurityError') },
  }
  const r = limpiarClavesHeredadas(roto)
  assert.deepEqual(r.borradas, [])
  assert.ok(r.error)
})

test('la lista de claves heredadas cubre el grant fósil documentado', () => {
  assert.ok(CLAVES_HEREDADAS.includes('wow-hunter-guide.auction-path'))
})
