// Adquisición Auctionator: procedencia SIEMPRE desconocida (topología no
// verificada), sin exporter verificado, sin metadata inferida de la ruta.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerAuctionator, classifyAcquisition, ACQUISITION_PROVENANCE, verifiedExporter } from '../desktop/src/auctionator.js'
import Identity from '../standalone/market-identity.js'
import Compare from '../standalone/market-compare.js'

function files() {
  const disk = new Map([['Auctionator.lua', new TextEncoder().encode('AUCTIONATOR_PRICE_DATABASE = {}')]])
  return {
    requestFolder: async () => ({ ok: true, folder: { id: 'f1', name: 'SavedVariables' } }),
    folders: async () => [{ id: 'f1', name: 'SavedVariables' }],
    readDataUrl: async (_id, rel) => ({ ok: disk.has(rel), url: 'data:application/octet-stream;base64,' + Buffer.from(disk.get(rel) || []).toString('base64') }),
    readText: async () => ({ ok: false }),
    list: async () => ({ ok: true, entries: [] }),
  }
}

test('lectura real de Auctionator devuelve procedencia desconocida y no comparable', async () => {
  const hit = await leerAuctionator({ files: files() }, { pick: true, silent: true })
  assert.equal(hit.status, 'ok')
  assert.equal(hit.provenance.confidence, 'unknown')
  assert.equal(hit.comparable, false)
  assert.equal(ACQUISITION_PROVENANCE.exporter, 'none-verified')
})

test('la ruta nunca asigna región, reglas, reino ni canal', () => {
  const a = classifyAcquisition({ status: 'ok', path: 'SavedVariables/Account/US/PvE/Realm-A/Auctionator.lua' })
  const b = classifyAcquisition({ status: 'ok', path: 'SavedVariables/Account/EU/RP/Realm-B/Auctionator.lua' })
  assert.equal(a.identity.region, Identity.UNKNOWN)
  assert.equal(a.identity.ruleset, Identity.UNKNOWN)
  assert.equal(a.identity.rawSourceKey, 'auctionator-raw')
  assert.deepEqual(a.identity, b.identity, 'rutas distintas no producen identidades distintas')
  assert.equal(a.usableForComparison, false)
})

test('sin exporter verificado: no hay fuente promovible', () => {
  assert.equal(verifiedExporter(), null)
  assert.equal(classifyAcquisition({ status: 'ok' }).usableForComparison, false)
})

test('comparar capturas reales desconocidas bloquea (fail-closed)', () => {
  const u1 = classifyAcquisition({ status: 'ok', path: 'SavedVariables/Auctionator.lua' }).identity
  const u2 = Identity.unknownIdentity('otra-captura')
  assert.equal(Identity.canCompare(u1, u2), false)
  const row = (key, price, day) => ({ sourceKey: key, itemId: Number(key), unitPriceCopper: price, observedDay: day, confirmed: false, coverage: { itemRows: 10, scannedRows: 100 } })
  const r = Compare.compare([
    { id: 'u1', identity: u1, rows: [row('2589', 100, 2502)] },
    { id: 'u2', identity: u2, rows: [row('2589', 120, 2502)] },
  ], { todayDay: 2503 })
  assert.equal(r.status, 'blocked')
  assert.ok(r.reasons.length > 0)
})

test('errores de adquisición también sellan procedencia desconocida', async () => {
  const r = await leerAuctionator({ files: { ...files(), requestFolder: async () => ({ ok: false }) } }, { pick: true })
  assert.equal(r.status, 'cancelled')
  assert.equal(r.provenance.confidence, 'unknown')
  assert.equal(r.comparable, false)
})
