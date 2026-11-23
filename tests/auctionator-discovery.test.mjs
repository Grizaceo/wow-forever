// Auditoría multiplataforma del descubrimiento de Auctionator (fixtures sintéticas).
// El SDK de Hermes devuelve rutas relativas separadas por '/' en Windows, macOS y
// Linux; el descubridor debe completar la búsqueda, rechazar listados incompletos
// o rutas inseguras y NO dejar que una copia suelta en la raíz gane sobre una
// cuenta anidada (misma regla que TSM y el puente).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerAuctionator } from '../desktop/src/auctionator.js'

const textA = 'AUCTIONATOR_PRICE_DATABASE = { ["__dbversion"] = 8, ["CuentaA"] = { version = 2 } }'
const textB = 'AUCTIONATOR_PRICE_DATABASE = { ["__dbversion"] = 8, ["CuentaB"] = { version = 2 } }'
const grant = { id: 'g', name: 'SavedVariables' }
const base = () => ({
  folders: async () => [grant],
  requestFolder: async () => { throw Error('selector en segundo plano') },
  readText: async () => ({ ok: false }),
  list: async () => ({ ok: true, entries: [] }),
})

function tree(files, map) {
  files.list = async (_id, rel) => {
    const key = rel || ''
    if (!Object.hasOwn(map, key)) return { ok: false, error: 'not-found' }
    return { ok: true, truncated: false, entries: map[key] }
  }
  files.readText = async (_id, rel) => {
    const t = map.__files?.[rel]
    return t === undefined ? { ok: false } : { ok: true, text: t }
  }
}

test('una copia en la raíz NO gana sobre una cuenta anidada: ambigüedad, sin pin', async () => {
  const files = base(), storage = new Map()
  tree(files, {
    '': [
      { name: 'Auctionator.lua', path: 'Auctionator.lua', isDirectory: false },
      { name: 'WTF', path: 'WTF', isDirectory: true },
    ],
    'WTF': [{ name: 'Cuenta', path: 'WTF/Cuenta', isDirectory: true }],
    'WTF/Cuenta': [{ name: 'SavedVariables', path: 'WTF/Cuenta/SavedVariables', isDirectory: true }],
    'WTF/Cuenta/SavedVariables': [{ name: 'Auctionator.lua', path: 'WTF/Cuenta/SavedVariables/Auctionator.lua', isDirectory: false }],
    __files: { 'Auctionator.lua': textA, 'WTF/Cuenta/SavedVariables/Auctionator.lua': textB },
  })
  const r = await leerAuctionator({ files, storage: { get: async k => storage.get(k), set: async (k, v) => storage.set(k, v) } }, { silent: true })
  assert.equal(r.status, 'error')
  assert.equal(r.error, 'ambiguous')
  assert.equal(storage.has('auctionator-folder'), false)
})

test('raíz inválida + cuenta anidada válida: se importa la cuenta, no se aborta', async () => {
  const files = base(), storage = new Map()
  tree(files, {
    '': [
      { name: 'Auctionator.lua', path: 'Auctionator.lua', isDirectory: false },
      { name: 'Cuenta', path: 'Cuenta', isDirectory: true },
    ],
    'Cuenta': [{ name: 'Auctionator.lua', path: 'Cuenta/Auctionator.lua', isDirectory: false }],
    __files: { 'Auctionator.lua': 'OTRA_VARIABLE = {}', 'Cuenta/Auctionator.lua': textB },
  })
  const r = await leerAuctionator({ files, storage: { get: async k => storage.get(k), set: async (k, v) => storage.set(k, v) } }, { silent: true })
  assert.equal(r.status, 'ok')
  assert.match(new TextDecoder().decode(r.bytes), /CuentaB/)
})

test('listado truncado: falla cerrado aunque la raíz tenga un archivo válido', async () => {
  const files = base()
  files.readText = async (_id, rel) => rel === 'Auctionator.lua' ? { ok: true, text: textA } : { ok: false }
  files.list = async () => ({ ok: true, truncated: true, entries: [{ name: 'Auctionator.lua', path: 'Auctionator.lua', isDirectory: false }] })
  const r = await leerAuctionator({ files, storage: { get: async () => null, set: async () => {} } }, { silent: true })
  assert.equal(r.status, 'error')
  assert.equal(r.error, 'limit')
})

test('entrada de listado con traversal: no se lee nada fuera de la concesión', async () => {
  const files = base()
  const leidas = []
  files.list = async () => ({ ok: true, truncated: false, entries: [{ name: 'Auctionator.lua', path: '../Config/Auctionator.lua', isDirectory: false }] })
  files.readText = async (_id, rel) => { leidas.push(rel); return { ok: true, text: textA } }
  const r = await leerAuctionator({ files, storage: { get: async () => null, set: async () => {} } }, { silent: true })
  assert.equal(r.status, 'error')
  assert.equal(r.error, 'invalid-path')
  assert.deepEqual(leidas.filter(p => p.includes('Config')), [])
})

test('host que devuelve rutas con barra invertida: falla cerrado, sin importar otra cuenta', async () => {
  const files = base()
  const leidas = []
  files.list = async () => ({ ok: true, truncated: false, entries: [{ name: 'Auctionator.lua', path: 'Cuenta\\Auctionator.lua', isDirectory: false }] })
  files.readText = async (_id, rel) => { leidas.push(rel); return { ok: true, text: textA } }
  const r = await leerAuctionator({ files, storage: { get: async () => null, set: async () => {} } }, { silent: true })
  assert.equal(r.status, 'error')
  assert.equal(r.error, 'invalid-path')
  assert.deepEqual(leidas.filter(p => p.includes('\\')), [])
})
