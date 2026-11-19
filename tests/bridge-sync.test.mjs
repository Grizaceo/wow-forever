// bridge-sync: sondeo del diario, fusión append, cuarentena de permisos y
// resiliencia ante la poda de Auctionator. Solo datos sintéticos; el picker
// NUNCA debe abrirse desde el sondeo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore } from '../desktop/src/almacen.js'
import { createMarketSync } from '../desktop/src/mercado-auto.js'
import { createBridgeSync } from '../desktop/src/bridge-sync.js'
import H from '../standalone/market-history.js'

const enc = s => new TextEncoder().encode(s)
function luaJournal(entries, retentionDays = 14) {
  const item = it => `{d=${it.d},m=${it.m},hi=${it.hi},lo=${it.lo}${it.av != null ? `,av=${it.av}` : ''}}`
  const es = Object.entries(entries).map(([day, e]) => {
    const items = Object.entries(e.items).map(([k, it]) => `[${JSON.stringify(k)}]=${item(it)}`).join(',')
    return `[${day}]={day=${day},at=${e.at},realm=${JSON.stringify(e.realm)},items={${items}}}`
  }).join(',')
  return `WoWForeverBridgeDB={version=1,retentionDays=${retentionDays},entries={${es}}}`
}
const dia = (day, at, items, realm = 'PvP') => ({ day, at, realm, items })
const it = (d, m, hi, lo, av) => ({ d, m, hi, lo, av })
const J2 = luaJournal({
  2500: dia(2500, 1763200000, { '2589': it(2500, 140, 150, 120, 5) }),
  2501: dia(2501, 1763300000, { '2589': it(2501, 135, 160, 110, 9) }),
})
const SV = 'WTF/Account/SYNTHETIC/SavedVariables/'
const rowsDe = state => H.legacyView(state.history.store).realms.PvP.items['2589']

function fixture() {
  const storage = new Map(), disk = new Map(), lecturas = []
  let files = { [SV + 'WoWForeverBridge.lua']: J2 }, granted = [{ id: 'g', name: 'SavedVariables' }], writes = 0
  const ctx = {
    storage: { get: async k => storage.get(k) ?? null, set: async (k, v) => storage.set(k, v), remove: async k => storage.delete(k) },
    files: {
      folders: async () => granted.slice(),
      requestFolder: async () => { throw Error('el sondeo no debe abrir el picker') },
      list: async (id, rel) => {
        if (!granted.some(g => g.id === id)) return { ok: false, error: 'not-granted' }
        const entries = []
        for (const p of Object.keys(files)) {
          if (rel && !p.startsWith(rel + '/')) continue
          const rest = p.slice(rel ? rel.length + 1 : 0)
          if (rest.includes('/')) { const dir = rest.split('/')[0]; if (!entries.some(e => e.name === dir)) entries.push({ name: dir, path: (rel ? rel + '/' : '') + dir, isDirectory: true }) }
          else entries.push({ name: rest, path: p, isDirectory: false })
        }
        return { ok: true, entries, truncated: false }
      },
      readText: async (id, p) => {
        if (id === 'data') return { ok: disk.has(p), text: disk.get(p) }
        lecturas.push(p)
        return files[p] !== undefined ? { ok: true, text: files[p] } : { ok: false, error: 'not-found' }
      },
      readDataUrl: async (id, p) => {
        if (!granted.some(g => g.id === id)) return { ok: false, error: 'not-granted' }
        lecturas.push(p)
        const t = files[p]
        return t === undefined ? { ok: false, error: 'not-found' } : { ok: true, url: 'data:text/plain;base64,' + Buffer.from(t).toString('base64') }
      },
      writeText: async (id, p, text) => { writes++; disk.set(p, text); return { ok: true } },
    },
  }
  const store = createStore(ctx)
  const market = createMarketSync(ctx, store)
  const bridge = createBridgeSync(ctx, market)
  return { ctx, store, market, bridge, storage, disk, lecturas, writes: () => writes, setFiles: f => { files = f }, setGranted: g => { granted = g } }
}

test('sondeo importa el diario y no reescribe si no cambia', async () => {
  const f = fixture()
  const r = await f.bridge.poll()
  assert.equal(r.status, 'ok')
  assert.equal(r.entries, 2)
  assert.equal(r.items, 2)
  assert.equal(r.lastDay, 2501)
  const state = await f.store.read()
  assert.deepEqual(rowsDe(state).map(x => x[0]), [2500, 2501])
  const n = f.writes()
  assert.equal((await f.bridge.poll()).status, 'unchanged')
  assert.equal(f.writes(), n)
  assert.ok(f.lecturas.every(p => !p.endsWith('.bak') && !p.endsWith('Config.wtf')), 'solo lee el diario')
})

test('día nuevo se añade; mismo día se actualiza sin duplicar', async () => {
  const f = fixture()
  await f.bridge.poll()
  f.setFiles({ [SV + 'WoWForeverBridge.lua']: luaJournal({
    2500: dia(2500, 1763200000, { '2589': it(2500, 140, 150, 120, 5) }),
    2501: dia(2501, 1763300600, { '2589': it(2501, 130, 170, 100, 12) }),
    2502: dia(2502, 1763400000, { '2589': it(2502, 125, 165, 105, 8) }),
  }) })
  const r = await f.bridge.poll()
  assert.equal(r.status, 'ok')
  assert.equal(r.entries, 3)
  const rows = rowsDe(await f.store.read())
  assert.deepEqual(rows.map(x => x[0]), [2500, 2501, 2502])
  assert.deepEqual(rows[1], [2501, 100, 170, 12])
})

test('la poda de Auctionator NO borra los días que el puente ya capturó', async () => {
  const f = fixture()
  await f.bridge.poll()
  // Auctionator sobrescribe su archivo y se queda solo con el último día.
  f.setFiles({
    [SV + 'WoWForeverBridge.lua']: J2,
    [SV + 'Auctionator.lua']: 'AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["PvP"]={version=2,["2589"]={m=90,h={["2501"]=95},l={["2501"]=90},a={["2501"]=3}}}}',
  })
  assert.equal((await f.market.poll()).status, 'ok')
  const rows = rowsDe(await f.store.read())
  assert.deepEqual(rows.map(x => x[0]), [2500, 2501], 'el día 2500 sobrevive a la poda')
  assert.equal(rows[1][1], 90, 'el mismo día se actualiza con la fuente más reciente')
})

test('diario inválido: error explícito, datos conservados, recuperación limpia', async () => {
  const f = fixture()
  await f.bridge.poll()
  const before = await f.store.read()
  f.setFiles({ [SV + 'WoWForeverBridge.lua']: 'WoWForeverBridgeDB={version=9,entries={}}' })
  assert.equal((await f.bridge.poll()).status, 'error')
  assert.deepEqual(await f.store.read(), before)
  f.setFiles({ [SV + 'WoWForeverBridge.lua']: J2 })
  // Mismo contenido que el último import válido: el digest gate lo marca unchanged.
  assert.equal((await f.bridge.poll()).status, 'unchanged')
  assert.equal(f.bridge.getState().error, null)
})

test('diario vacío no importa nada; el primer escaneo posterior sí', async () => {
  const f = fixture()
  f.setFiles({ [SV + 'WoWForeverBridge.lua']: luaJournal({}) })
  const r = await f.bridge.poll()
  assert.equal(r.status, 'ok')
  assert.equal(r.entries, 0)
  assert.equal(f.writes(), 0)
  f.setFiles({ [SV + 'WoWForeverBridge.lua']: J2 })
  assert.equal((await f.bridge.poll()).status, 'ok')
  assert.deepEqual(rowsDe(await f.store.read()).map(x => x[0]), [2500, 2501])
})

test('pausar persiste; dispose detiene; sin carpeta espera sin abrir picker', async () => {
  const f = fixture()
  await f.bridge.setEnabled(false)
  assert.equal((await f.bridge.poll()).status, 'paused')
  assert.equal(f.storage.get('bridge-auto'), false)
  assert.equal(f.writes(), 0)
  await f.bridge.setEnabled(true)
  assert.equal((await f.bridge.poll()).status, 'ok')
  f.bridge.dispose()
  assert.equal((await f.bridge.poll()).status, 'stopped')
  const g = fixture()
  g.setGranted([])
  const r = await g.bridge.poll()
  assert.equal(r.status, 'waiting')
  assert.equal(g.writes(), 0)
})

test('permiso revocado: cuarentena, sin adoptar otra cuenta en silencio; recuperación explícita', async () => {
  const f = fixture()
  await f.bridge.poll()
  assert.equal(f.storage.get('bridge-location').folderId, 'g')
  f.setGranted([])
  const r = await f.bridge.poll()
  assert.equal(r.status, 'waiting')
  assert.match(r.message, /revocado/)
  // Otra cuenta concede una carpeta con diario: NO se adopta sola.
  f.setGranted([{ id: 'g2', name: 'OtraCuenta' }])
  f.setFiles({ [SV + 'WoWForeverBridge.lua']: luaJournal({ 2600: dia(2600, 1764000000, { '2589': it(2600, 10, 10, 10, 1) }) }) })
  assert.equal((await f.bridge.poll()).status, 'waiting')
  // El usuario concede explícitamente la nueva carpeta para Auctionator: esa elección manda.
  f.storage.set('auctionator-folder', 'g2')
  const r2 = await f.bridge.poll()
  assert.equal(r2.status, 'ok')
  assert.equal(f.storage.get('bridge-location').folderId, 'g2')
})

test('varios diarios en la misma carpeta: error ambiguo, no importa', async () => {
  const f = fixture()
  f.setFiles({
    'WTF/Account/A/SavedVariables/WoWForeverBridge.lua': J2,
    'WTF/Account/B/SavedVariables/WoWForeverBridge.lua': J2,
  })
  const r = await f.bridge.poll()
  assert.equal(r.status, 'error')
  assert.match(r.error, /varias cuentas/)
  assert.equal(f.writes(), 0)
})
