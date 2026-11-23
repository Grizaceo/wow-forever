// Contrato de rutas del SDK de Hermes, compartido por Auctionator, TSM y puente.
// Estas aserciones son la auditoría multiplataforma en miniatura: las mismas
// reglas se aplican en Windows, macOS y Linux porque `files.list()` siempre
// devuelve rutas relativas con '/'; el host no debe interpretarlas distinto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeSyncPath, listingCompleta, SYNC_REL_PATH_MAX, SYNC_SEGMENT_MAX } from '../desktop/src/sync-path.js'

test('rutas canónicas del árbol de WoW se aceptan', () => {
  for (const p of [
    'Auctionator.lua',
    'WTF/Account/Horde/SavedVariables/Auctionator.lua',
    'WTF/Account/Alianza/SavedVariables/TradeSkillMaster.lua',
    'WTF/Account/Horde/SavedVariables/WoWForeverBridge.lua',
    'a/b/c/d/e/f/g.lua',
  ]) assert.equal(safeSyncPath(p), true, p)
})

test('se rechazan rutas que el SDK también rechazaría en algún OS', () => {
  for (const p of [
    '',
    '../Config.wtf',
    'a/../../Config.wtf',
    'C:/juego/WTF/Account/Auctionator.lua',
    '//server/share/Auctionator.lua',
    'Cuenta\\Auctionator.lua',            // separador de Windows nunca lo emite list()
    'a/..namedfork/data/Auctionator.lua', // fork de macOS
    'a/./Auctionator.lua',
    'a//Auctionator.lua',
    'a/\x00Auctionator.lua',
    'a/\x1fAuctionator.lua',
    'a/Auctionator.lua:stream',           // ADS de Windows
    'a/../Auctionator.lua',
    null, undefined, 42, {},
  ]) assert.equal(safeSyncPath(p), false, JSON.stringify(p))
})

test('los topes coinciden con REL_PATH_MAX y SEGMENT_MAX del SDK', () => {
  assert.equal(SYNC_REL_PATH_MAX, 1024)
  assert.equal(SYNC_SEGMENT_MAX, 255)
  const maxSeg = 'a'.repeat(SYNC_SEGMENT_MAX)
  assert.equal(safeSyncPath(maxSeg), true)
  assert.equal(safeSyncPath(maxSeg + 'a'), false)
  const tooLong = 'a'.repeat(SYNC_REL_PATH_MAX + 1)
  assert.equal(safeSyncPath(tooLong), false)
})

test('un listado incompleto o con demasiadas entradas no es de confianza', () => {
  assert.equal(listingCompleta({ ok: true, truncated: false, entries: [] }), true)
  assert.equal(listingCompleta({ ok: true, entries: [] }), true) // host antiguo sin `truncated`
  assert.equal(listingCompleta({ ok: true, truncated: true, entries: [] }), false)
  assert.equal(listingCompleta({ ok: false, entries: [] }), false)
  assert.equal(listingCompleta({ ok: true, entries: new Array(4001).fill({}) }), false)
  assert.equal(listingCompleta(null), false)
})
