// Lectura de Auctionator.lua desde la carpeta concedida (desktop/src/auctionator.js).
// Regresión del 2026-11-12: el Auctionator.lua real guarda los reinos no actuales como blobs
// CBOR dentro de cadenas Lua, con bytes crudos que no son UTF-8. Leído con readText (UTF-8 con
// pérdida) el parser fallaba con «cbor trailing data»; readDataUrl trae los bytes exactos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { contieneBytes, dataUrlBytes, leerAuctionator, readAuction } from '../desktop/src/auctionator.js'

const require = createRequire(import.meta.url)
const { parseAuctionator } = require('../standalone/market.js')

const A = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff)
const cat = (...cs) => { const o = new Uint8Array(cs.reduce((n, c) => n + c.length, 0)); let p = 0; for (const c of cs) { o.set(c, p); p += c.length } return o }
const ha = (major, len) => len < 24 ? Uint8Array.from([(major << 5) | len]) : Uint8Array.from([(major << 5) | 24, len])
const ci = (n) => ha(0, n) // enteros < 256 bastan aquí
const cbs = (u8) => cat(ha(2, u8.length), u8)
const cmap = (pares) => cat(ha(5, pares.length), ...pares.flat())

// Como lo escribe WoW: solo escapa comillas, barra, saltos de línea y NUL; el resto va crudo.
function luaCrudo(u8) {
  const out = [0x22]
  for (const b of u8) {
    if (b === 0x22) out.push(0x5c, 0x22)
    else if (b === 0x5c) out.push(0x5c, 0x5c)
    else if (b === 0x0a) out.push(0x5c, 0x6e)
    else if (b === 0x0d) out.push(0x5c, 0x72)
    else if (b === 0x00) out.push(0x5c, 0x30, 0x30, 0x30)
    else out.push(b)
  }
  out.push(0x22)
  return Uint8Array.from(out)
}

// Reino actual como tabla Lua y otro reino como blob CBOR crudo (lo que deja WoW al salir).
const item = cmap([[cbs(A('m')), ci(200)], [cbs(A('h')), cmap([[cbs(A('2504')), ci(200)]])], [cbs(A('a')), cmap([[cbs(A('2504')), ci(3)]])]])
const blob = cmap([[cbs(A('version')), ci(2)], [cbs(A('2589')), item]])
const ARCHIVO = cat(
  A('AUCTIONATOR_PRICE_DATABASE = {\n["__dbversion"] = 8,\n["Actual"] = { version = 2, ["2589"] = { m = 120, h = { ["2504"] = 120 }, a = { ["2504"] = 5 } } },\n["Otro"] = '),
  luaCrudo(blob), A(',\n}\n'))

const comoReadText = (bytes) => new TextDecoder('utf-8').decode(bytes) // lo que hace Hermes (toString('utf8'))
const dataUrl = (bytes) => 'data:text/plain;base64,' + Buffer.from(bytes).toString('base64')
const carpeta = { id: 'g1', name: 'SavedVariables' }
const archivos = (opciones = {}) => ({
  readText: async (_f, rel) => rel === 'Auctionator.lua' ? { ok: true, text: comoReadText(ARCHIVO) } : { ok: false, error: 'not-found' },
  ...(opciones.sinDataUrl ? {} : { readDataUrl: async (_f, rel) => rel === 'Auctionator.lua' ? { ok: true, url: dataUrl(ARCHIVO) } : { ok: false, error: 'not-found' } }),
  list: async () => ({ ok: true, entries: [{ name: 'Auctionator.lua', path: 'Auctionator.lua', isDirectory: false }] }),
  folders: async () => [carpeta],
  requestFolder: async () => { throw new Error('no debe abrir el selector con una carpeta concedida') },
})

test('el fixture reproduce el archivo real: no es UTF-8 y readText rompe el CBOR', () => {
  assert.throws(() => new TextDecoder('utf-8', { fatal: true }).decode(ARCHIVO))
  assert.throws(() => parseAuctionator(new TextEncoder().encode(comoReadText(ARCHIVO))), /cbor/)
  const s = parseAuctionator(ARCHIVO)
  assert.deepEqual(s.realms.map((r) => r.name).sort(), ['Actual', 'Otro'])
})

test('readAuction trae los bytes exactos con readDataUrl', async () => {
  const r = await readAuction(archivos(), carpeta, 'Auctionator.lua')
  assert.equal(r.status, 'ok')
  assert.deepEqual(r.bytes, ARCHIVO)
  assert.equal(r.byteSize, ARCHIVO.length)
  assert.equal(r.path, 'SavedVariables/Auctionator.lua')
  assert.equal(parseAuctionator(r.bytes).realms.length, 2)
})

test('sin readDataUrl usa readText (sirve para archivos UTF-8)', async () => {
  const r = await readAuction(archivos({ sinDataUrl: true }), carpeta, 'Auctionator.lua')
  assert.equal(r.status, 'ok')
  assert.ok(r.bytes instanceof Uint8Array)
})

test('un archivo sin AUCTIONATOR_PRICE_DATABASE no cuenta', async () => {
  const f = { readDataUrl: async () => ({ ok: true, url: dataUrl(A('OTRA_VARIABLE = {}')) }), readText: async () => ({ ok: false }) }
  assert.equal(await readAuction(f, carpeta, 'Auctionator.lua'), null)
})

test('leerAuctionator con la carpeta ya concedida no abre el selector y devuelve bytes', async () => {
  const r = await leerAuctionator({ files: archivos() })
  assert.equal(r.status, 'ok')
  assert.equal(r.stored, true)
  assert.deepEqual(r.bytes, ARCHIVO)
})

test('ayudas: dataUrlBytes y contieneBytes', () => {
  assert.deepEqual(dataUrlBytes(dataUrl(Uint8Array.from([0, 0xa4, 0xff]))), Uint8Array.from([0, 0xa4, 0xff]))
  assert.equal(contieneBytes(A('xxABCxx'), A('ABC')), true)
  assert.equal(contieneBytes(A('xxABxCx'), A('ABC')), false)
})
