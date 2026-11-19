// Contrato del diario WoWForeverBridge (addon propio) y su fusión append-only
// en el histórico v2: cada escaneo capturado añade días; el mismo día se
// actualiza con la captura más reciente; los días intermedios nunca se pierden.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBridge, bridgeToSnapshot, BRIDGE_FILE, BRIDGE_MAX_BYTES } from '../desktop/src/bridge.js'
import { planImportacion, snapshotValido, HunterMarket } from '../desktop/src/mercado-logica.js'

const enc = s => new TextEncoder().encode(s)

// Serializador mínimo de diario a Lua (lo que escribiría el SavedVariables del
// addon; el parser restringido del repo lo lee como datos, nunca eval).
function luaJournal(j) {
  const item = it => `{d=${it.d},m=${it.m},hi=${it.hi},lo=${it.lo}${it.av != null ? `,av=${it.av}` : ''}}`
  const entries = Object.entries(j.entries).map(([day, e]) => {
    const items = Object.entries(e.items).map(([k, it]) => `[${JSON.stringify(k)}]=${item(it)}`).join(',')
    return `[${day}]={day=${day},at=${e.at},realm=${JSON.stringify(e.realm)},items={${items}}}`
  }).join(',')
  return `WoWForeverBridgeDB={version=1,retentionDays=${j.retentionDays ?? 14},entries={${entries}}}`
}
const journal = entries => ({ version: 1, retentionDays: 14, entries })
const obs = (d, m, hi, lo, av) => ({ d, m, hi, lo, av })

test('parseBridge: roundtrip con dos días, av opcional y orden ascendente', () => {
  const j = journal({
    2501: { day: 2501, at: 1763300000, realm: 'PvP', items: { '2589': obs(2501, 135, 160, 110, 9) } },
    2500: { day: 2500, at: 1763200000, realm: 'PvP', items: { '2589': obs(2500, 140, 150, 120, null), '7000;1': obs(2500, 50, 50, 50, 3) } },
  })
  const parsed = parseBridge(enc(luaJournal(j)))
  assert.equal(parsed.version, 1)
  assert.equal(parsed.retentionDays, 14)
  assert.deepEqual(parsed.entries.map(e => e.day), [2500, 2501])
  assert.equal(parsed.entries[0].items['2589'].av, null)
  assert.equal(parsed.entries[0].items['7000;1'].hi, 50)
  assert.equal(parsed.entries[1].items['2589'].m, 135)
})

test('parseBridge: rechaza datos inválidos sin ejecutar nada', () => {
  const base = journal({ 2500: { day: 2500, at: 1763200000, realm: 'PvP', items: { '2589': obs(2500, 140, 150, 120, 5) } } })
  const mut = f => { const j = structuredClone(base); f(j); return enc(luaJournal(j)) }
  assert.throws(() => parseBridge(enc('WoWForeverBridgeDB={version=2,entries={}}')), /version/)
  assert.throws(() => parseBridge(enc('WoWForeverBridgeDB={version=1}')), /entries/)
  assert.throws(() => parseBridge(mut(j => { j.entries[2500].items['2589'].lo = 999 })), /range/)
  assert.throws(() => parseBridge(mut(j => { j.entries[2500].items['2589'].m = 0 })), /price/)
  assert.throws(() => parseBridge(mut(j => { j.entries[2500].items['2589'].av = -1 })), /quantity/)
  assert.throws(() => parseBridge(mut(j => { j.entries[2500].items['2589'].d = -5 })), /day/)
  assert.throws(() => parseBridge(mut(j => { j.entries[2500].at = 0 })), /timestamp/)
  assert.throws(() => parseBridge(mut(j => { j.entries[2500].realm = '' })), /realm/)
  assert.throws(() => parseBridge(mut(j => { Object.defineProperty(j.entries[2500].items, '__proto__', { value: obs(2500, 1, 1, 1, null), enumerable: true, configurable: true, writable: true }) })), /key/)
  assert.throws(() => parseBridge(new Uint8Array(0)), /size/)
  assert.throws(() => parseBridge(new Uint8Array(BRIDGE_MAX_BYTES + 1)), /size/)
  assert.throws(() => parseBridge('no bytes'), /size/)
  const many = journal({})
  for (let d = 1; d <= 63; d++) many.entries[d] = { day: d, at: 1763200000 + d, realm: 'PvP', items: {} }
  assert.throws(() => parseBridge(enc(luaJournal(many))), /entries/)
})

test('bridgeToSnapshot: snapshot crudo válido, itemId numérico vs variante', () => {
  const j = journal({ 2500: { day: 2500, at: 1763200000, realm: 'PvP', items: { '2589': obs(2500, 140, 150, 120, 5), '7000;1': obs(2500, 50, 50, 50, null) } } })
  const raw = bridgeToSnapshot(parseBridge(enc(luaJournal(j))), { now: new Date('2026-11-19T12:00:00Z') })
  assert.ok(snapshotValido(raw))
  assert.equal(raw.schemaVersion, 1)
  assert.equal(raw.sourceVersion, 8)
  assert.equal(raw.importedAt, '2026-11-19T12:00:00.000Z')
  const items = raw.realms[0].items
  assert.equal(items.find(i => i.sourceKey === '2589').itemId, 2589)
  assert.equal(items.find(i => i.sourceKey === '7000;1').itemId, null)
  assert.deepEqual(items.find(i => i.sourceKey === '2589').history, [{ day: 2500, low: 120, high: 150, available: 5 }])
})

test('bridgeToSnapshot: varios días del diario -> una fila por día; mismo día gana la entrada reciente', () => {
  const j = journal({
    2500: { day: 2500, at: 1763200000, realm: 'PvP', items: { '2589': obs(2500, 140, 150, 120, 5) } },
    2501: { day: 2501, at: 1763300000, realm: 'PvP', items: { '2589': obs(2501, 135, 160, 110, 9) } },
    2502: { day: 2502, at: 1763400000, realm: 'PvP', items: { '2589': obs(2501, 130, 170, 100, 12) } },
  })
  const raw = bridgeToSnapshot(parseBridge(enc(luaJournal(j))))
  const it = raw.realms[0].items[0]
  assert.deepEqual(it.history.map(h => h.day), [2500, 2501])
  assert.deepEqual(it.history[1], { day: 2501, low: 100, high: 170, available: 12 })
  assert.equal(it.observedDay, 2501)
  assert.equal(it.unitPriceCopper, 130)
})

// El corazón del encargo: el histórico intermedio sobrevive. Un import previo
// (Auctionator directo, días 2140-2141) seguido de diarios del puente en días
// posteriores conserva TODOS los días; reimportar el mismo día lo actualiza.
const FIX_AUCTION = 'AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Prueba"]={version=2,' +
  '["2589"]={m=120,h={["2140"]=130,["2141"]=125},l={["2140"]=120,["2141"]=118},a={["2140"]=20,["2141"]=15}}}}'
const rowsDe = (store, realm, key) => store.v === 2
  ? Object.values(store.scopes)[0].realms[realm].items[key]
  : store.realms[realm].items[key]

test('fusión append: días de Auctionator + días del puente coexisten (legacy v1)', () => {
  const prev = planImportacion(HunterMarket.parseAuctionator(enc(FIX_AUCTION)), {})
  assert.ok(snapshotValido(prev.snapshot))
  const j = journal({
    2500: { day: 2500, at: 1763200000, realm: 'Prueba', items: { '2589': obs(2500, 140, 150, 120, 5) } },
    2501: { day: 2501, at: 1763300000, realm: 'Prueba', items: { '2589': obs(2501, 135, 160, 110, 9) } },
  })
  const raw = bridgeToSnapshot(parseBridge(enc(luaJournal(j))))
  const next = planImportacion(raw, { snapshotActual: prev.snapshot, historyStore: prev.store })
  assert.ok(snapshotValido(next.snapshot))
  const rows = rowsDe(next.store, 'Prueba', '2589')
  assert.deepEqual(rows.map(r => r[0]), [2140, 2141, 2500, 2501], 'ningún día intermedio se pierde')
  assert.equal(rows[0][1], 120)
  assert.equal(rows[3][2], 160)
})

test('fusión mismo día: la captura más reciente reemplaza la fila, no duplica', () => {
  const j1 = journal({ 2500: { day: 2500, at: 1763200000, realm: 'Prueba', items: { '2589': obs(2500, 140, 150, 120, 5) } } })
  const p1 = planImportacion(bridgeToSnapshot(parseBridge(enc(luaJournal(j1)))), {})
  const j2 = journal({ 2500: { day: 2500, at: 1763200600, realm: 'Prueba', items: { '2589': obs(2500, 130, 170, 100, 12) } } })
  const p2 = planImportacion(bridgeToSnapshot(parseBridge(enc(luaJournal(j2)))), { snapshotActual: p1.snapshot, historyStore: p1.store })
  const rows = rowsDe(p2.store, 'Prueba', '2589')
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], [2500, 100, 170, 12])
})

test('fusión append en almacén v2: el legacy migra y los días del puente se añaden', () => {
  const prev = planImportacion(HunterMarket.parseAuctionator(enc(FIX_AUCTION)), { historyStore: { v: 2, scopes: {} } })
  assert.equal(prev.store.v, 2)
  const j = journal({ 2500: { day: 2500, at: 1763200000, realm: 'Prueba', items: { '2589': obs(2500, 140, 150, 120, 5) } } })
  const next = planImportacion(bridgeToSnapshot(parseBridge(enc(luaJournal(j)))), { snapshotActual: prev.snapshot, historyStore: prev.store })
  assert.equal(next.store.v, 2)
  const rows = rowsDe(next.store, 'Prueba', '2589')
  assert.deepEqual(rows.map(r => r[0]), [2140, 2141, 2500])
})

test('diario vacío: parseBridge lo acepta; el sync no lo importa (sin realms)', () => {
  const parsed = parseBridge(enc(luaJournal(journal({}))))
  assert.deepEqual(parsed.entries, [])
  const raw = bridgeToSnapshot(parsed)
  assert.equal(raw.realms.length, 0)
  assert.equal(snapshotValido(raw), false)
})

test('BRIDGE_FILE es el nombre exacto que escribe el addon', () => {
  assert.equal(BRIDGE_FILE, 'WoWForeverBridge.lua')
})
