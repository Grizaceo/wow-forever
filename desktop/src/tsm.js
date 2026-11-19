// TSM 4 realm accounting CSV, interpreted as DATA, never Lua execution.
// price and quantity are UNIT copper and TOTAL units (not number of stacks).
// Mail.lua records auction-sale price as floor((bid - ahcut)/quantity + 0.5):
// already net of AH cut, rounded per unit. Do not reconstruct gross or net profit.
// Full source snapshot replacement is deliberate: TSM mutates cumulative rows,
// so append/row hashes would double-count them. Names never leave this parser.
import HunterMarket from '../../standalone/market.js'
export const MAX_TSM_BYTES = 8 * 1024 * 1024
const TX = 'itemString,stackSize,quantity,price,otherPlayer,player,time,source'
const EX = 'itemString,stackSize,quantity,player,time'
const KINDS = { csvSales: 'sale', csvBuys: 'buy', csvExpired: 'expire', csvCancelled: 'cancel' }
const int = (n, min = 0) => Number.isSafeInteger(n) && n >= min
const exact = (o, keys) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k))
const str = (s, max = 300) => typeof s === 'string' && s.length > 0 && s.length <= max && !/[\x00-\x1f\x7f]/.test(s)
const item = s => /^i:[1-9]\d*(?::[\d-]*)*$/.test(s) && s.length <= 300
const baseId = s => { const n = Number(s.split(':')[1]); return int(n, 1) ? n : null }
function number(s, min = 0) { if (!/^\d+$/.test(s) || !int(Number(s), min)) throw Error('TSM: número inválido.'); return Number(s) }

export function parseTsm(bytes) {
  const db = HunterMarket.parseSavedVariables(bytes, 'TradeSkillMasterDB')
  const realms = new Map(); let count = 0
  for (const [key, csv] of Object.entries(db)) {
    const m = /^r@([^@]+)@internalData@(csvSales|csvBuys|csvExpired|csvCancelled)$/.exec(key)
    if (!m) continue
    const name = m[1], kind = KINDS[m[2]], priced = kind === 'sale' || kind === 'buy'
    if (!str(name) || typeof csv !== 'string') throw Error('TSM: contabilidad inválida.')
    if (!realms.has(name)) realms.set(name, { name, records: [] })
    if (csv === '') continue
    const lines = csv.replace(/\r\n/g, '\n').split('\n')
    if (lines.shift() !== (priced ? TX : EX)) throw Error('TSM: esquema CSV no compatible. Se conserva lo anterior.')
    for (const line of lines) {
      // CSV.EncodeEnd emits no trailing newline; reject partial/extra records.
      const a = line.split(',')
      if (a.length !== (priced ? 8 : 5) || !item(a[0])) throw Error('TSM: fila incompleta o formato de objeto no compatible.')
      number(a[1], 1) // stack size validated, never multiplied into quantity
      const quantity = number(a[2], 1), price = priced ? number(a[3]) : null
      if (priced && !int(quantity * price)) throw Error('TSM: importe fuera de rango.')
      const time = number(a[priced ? 6 : 4], 1)
      if (time > 8640000000000) throw Error('TSM: fecha fuera de rango.')
      const source = priced ? a[7] : 'Auction'
      if (!['Auction', 'COD', 'Trade', 'Vendor'].includes(source)) throw Error('TSM: origen no compatible.')
      realms.get(name).records.push({ kind, itemString: a[0], itemId: baseId(a[0]), quantity, unitPriceCopper: price, time, source })
      if (++count > 50000) throw Error('TSM: máximo 50.000 registros.')
    }
  }
  if (!realms.size) throw Error('TSM: no hay campos contables compatibles. Usa TradeSkillMaster.lua de SavedVariables.')
  const snapshot = { v: 1, importedAt: new Date().toISOString(), realms: [...realms.values()] }
  if (!validTsm(snapshot)) throw Error('TSM: contabilidad inválida o demasiado grande.')
  return snapshot
}

export function validTsm(s) {
  if (!exact(s, ['v', 'importedAt', 'realms']) || s.v !== 1 || typeof s.importedAt !== 'string' || !Number.isFinite(Date.parse(s.importedAt)) || !Array.isArray(s.realms) || s.realms.length > 100) return false
  let count = 0; const seen = new Set()
  for (const realm of s.realms) {
    if (!exact(realm, ['name', 'records']) || !str(realm.name) || seen.has(realm.name) || !Array.isArray(realm.records)) return false
    seen.add(realm.name)
    const totals = { sale: 0, buy: 0, expire: 0, cancel: 0 }, units = { ...totals }
    for (const r of realm.records) {
      if (++count > 50000 || !exact(r, ['kind', 'itemString', 'itemId', 'quantity', 'unitPriceCopper', 'time', 'source'])) return false
      if (!Object.hasOwn(totals, r.kind) || !item(r.itemString) || !int(r.itemId, 1) || baseId(r.itemString) !== r.itemId || !int(r.quantity, 1) || !int(r.time, 1) || r.time > 8640000000000) return false
      const priced = r.kind === 'sale' || r.kind === 'buy'
      if (priced ? !int(r.unitPriceCopper) : r.unitPriceCopper !== null) return false
      if (!['Auction', 'COD', 'Trade', 'Vendor'].includes(r.source) || (!priced && r.source !== 'Auction')) return false
      totals[r.kind] += (r.unitPriceCopper || 0) * r.quantity; units[r.kind] += r.quantity
      if (!int(totals[r.kind]) || !int(units[r.kind])) return false
    }
  }
  return new TextEncoder().encode(JSON.stringify(s)).length <= 3.5 * 1024 * 1024
}

export function resumenTsm(snapshot, realmName) {
  const realm = snapshot?.realms?.find(r => r.name === realmName)
  const items = new Map()
  for (const r of realm?.records || []) {
    if (!items.has(r.itemString)) items.set(r.itemString, { itemString: r.itemString, itemId: r.itemId, sold: 0, bought: 0, expired: 0, cancelled: 0, saleCopper: 0, buyCopper: 0, lastSale: null, sources: new Set() })
    const a = items.get(r.itemString)
    if (r.kind === 'sale') { a.sold += r.quantity; a.saleCopper += r.quantity * r.unitPriceCopper; a.lastSale = Math.max(a.lastSale || 0, r.time) }
    if (r.kind === 'buy') { a.bought += r.quantity; a.buyCopper += r.quantity * r.unitPriceCopper }
    if (r.kind === 'expire') a.expired += r.quantity
    if (r.kind === 'cancel') a.cancelled += r.quantity
    a.sources.add(r.source)
  }
  return [...items.values()].map(a => ({ ...a, sources: [...a.sources].sort(), avgSale: a.sold ? a.saleCopper / a.sold : null, avgBuy: a.bought ? a.buyCopper / a.bought : null })).sort((a,b) => b.saleCopper - a.saleCopper || a.itemString.localeCompare(b.itemString))
}
