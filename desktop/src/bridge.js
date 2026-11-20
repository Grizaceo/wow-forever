// bridge.js — contrato del diario del addon WoWForeverBridge (addon propio del
// repo, addon/WoWForeverBridge). El addon captura cada escaneo de Auctionator
// en WoWForeverBridge.lua (SavedVariables) con semántica diaria h/l/a; aquí se
// valida como DATOS (parser restringido compartido, nunca eval) y se adapta al
// snapshot crudo que ya consumen planImportacion/commitV2.
//
// El puente es transporte, no exportador verificado: la procedencia sigue
// siendo la guardia de Auctionator sin verificar (confidence unknown). No se
// inventa identidad ni se promociona confianza.
import HunterMarket from '../../standalone/market.js'

export const BRIDGE_FILE = 'WoWForeverBridge.lua'
export const BRIDGE_MAX_BYTES = 8 * 1024 * 1024
const MAX_ENTRIES = 62
const MAX_ITEMS_PER_ENTRY = 100000
const MAX_OBS_TOTAL = 250000
const DAY_MAX = 100000
const MAX_SAFE = Number.MAX_SAFE_INTEGER

function fail(msg) { throw new Error(msg) }
function isInt(v) { return Number.isInteger(v) }

// parseBridge(bytes) -> { version, retentionDays, entries:[{day, at, realm, items}] }
// entries ordenadas por día de reloj ascendente. Lanza mensajes genéricos.
export function parseBridge(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > BRIDGE_MAX_BYTES) fail('invalid input size')
  const db = HunterMarket.parseSavedVariables(bytes, 'WoWForeverBridgeDB')
  if (!db || db.version !== 1) fail('unsupported bridge version')
  if (!db.entries || typeof db.entries !== 'object') fail('missing entries')
  const days = Object.keys(db.entries)
  if (days.length > MAX_ENTRIES) fail('too many entries')
  let total = 0
  const entries = []
  for (const dk of days) {
    const day = Number(dk)
    const e = db.entries[dk]
    if (!isInt(day) || day < 0 || day > DAY_MAX) fail('invalid entry day')
    if (!e || typeof e !== 'object') fail('invalid entry')
    if (!isInt(e.at) || e.at <= 0) fail('invalid entry timestamp')
    if (typeof e.realm !== 'string' || !e.realm || e.realm.length > 200) fail('invalid entry realm')
    if (!e.items || typeof e.items !== 'object') fail('invalid entry items')
    const keys = Object.keys(e.items)
    if (keys.length > MAX_ITEMS_PER_ENTRY) fail('too many items')
    total += keys.length
    if (total > MAX_OBS_TOTAL) fail('too many observations')
    const items = Object.create(null)
    for (const k of keys) {
      if (!k || k.length > 200 || k === '__proto__' || k === 'constructor' || k === 'prototype') fail('invalid item key')
      const it = e.items[k]
      if (!it || typeof it !== 'object') fail('invalid item')
      if (!isInt(it.d) || it.d < 0 || it.d > DAY_MAX) fail('invalid item day')
      for (const f of ['m', 'hi', 'lo']) {
        if (!isInt(it[f]) || it[f] <= 0 || it[f] > MAX_SAFE) fail('invalid item price')
      }
      if (it.lo > it.hi) fail('invalid item price range')
      if (it.av != null && (!isInt(it.av) || it.av < 0 || it.av > MAX_SAFE)) fail('invalid item quantity')
      items[k] = { d: it.d, m: it.m, hi: it.hi, lo: it.lo, av: it.av == null ? null : it.av }
    }
    entries.push({ day, at: e.at, realm: e.realm, items })
  }
  entries.sort((a, b) => a.day - b.day || a.at - b.at)
  const retentionDays = isInt(db.retentionDays) && db.retentionDays >= 1 && db.retentionDays <= 60 ? db.retentionDays : 14
  // Bloque del personaje (Personaje.lua): último export SimC válido y último
  // intento fallido. Se acota aquí; el sync decide qué guardar.
  const PERSONAGEM_MAX = 512 * 1024
  let personagem = null
  const pj = db.personagem
  if (pj && typeof pj === 'object' && typeof pj.simc === 'string' && pj.simc.length > 0 && pj.simc.length <= PERSONAGEM_MAX) {
    personagem = {
      simc: pj.simc,
      capturado: isInt(pj.capturado) && pj.capturado > 0 ? pj.capturado : null,
      origem: 'addon',
    }
  }
  let personagemErro = null
  const pe = db.personagemErro
  if (pe && typeof pe === 'object' && typeof pe.erro === 'string' && pe.erro.length > 0 && pe.erro.length <= 4096) {
    personagemErro = {
      erro: pe.erro,
      capturado: isInt(pe.capturado) && pe.capturado > 0 ? pe.capturado : null,
    }
  }
  return { version: 1, retentionDays, entries, personagem, personagemErro }
}

// bridgeToSnapshot(journal) -> snapshot crudo schemaVersion 1 (mismo formato
// que parseAuctionator). Una fila de histórico por día observado e ítem; la
// entrada de reloj más reciente manda en m/observedDay y reemplaza filas del
// mismo día (mergeRows del histórico hace lo mismo aguas abajo).
export function bridgeToSnapshot(journal, { now = new Date() } = {}) {
  const realms = new Map()
  for (const e of journal.entries) {
    let r = realms.get(e.realm)
    if (!r) { r = { name: e.realm, items: new Map() }; realms.set(e.realm, r) }
    for (const k of Object.keys(e.items)) {
      const it = e.items[k]
      let cur = r.items.get(k)
      if (!cur) {
        cur = { sourceKey: k, itemId: /^\d+$/.test(k) ? Number(k) : null, unitPriceCopper: it.m, observedDay: it.d, history: [] }
        r.items.set(k, cur)
      }
      if (it.d >= cur.observedDay) { cur.unitPriceCopper = it.m; cur.observedDay = it.d }
      const row = { day: it.d, low: it.lo, high: it.hi, available: it.av }
      const ix = cur.history.findIndex(h => h.day === row.day)
      if (ix >= 0) cur.history[ix] = row
      else cur.history.push(row)
    }
  }
  const out = { schemaVersion: 1, importedAt: now.toISOString(), sourceVersion: 8, realms: [], warnings: [] }
  for (const r of realms.values()) {
    const items = [...r.items.values()]
    for (const it of items) it.history.sort((a, b) => a.day - b.day)
    out.realms.push({ name: r.name, items })
  }
  return out
}
