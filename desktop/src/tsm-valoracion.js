/*
 * tsm-valoracion.js — núcleo PURO de valoración descriptiva de TSM (primera entrega).
 *
 * Contrato:
 *   METODO_TSM                                   identificador de versión del método
 *   valorarTsm(snapshot, realmName, itemString, { nowMs, windowDays=28, minDays=5,
 *              staleDays=7, dispersionLimit=0.5 } = {}) -> valoración estable
 *   listarValoracionesTsm(snapshot, realmName, options) -> valoraciones por variante exacta
 *
 * Sin reloj, red, DOM, persistencia ni estado oculto. `nowMs` se inyecta siempre
 * en MILISEGUNDOS; `evaluatedAt` y `windowStart` también. Los registros TSM llegan
 * en SEGUNDOS epoch y `firstSale`/`lastSale` se devuelven en SEGUNDOS, igual que
 * en el snapshot. `day` es un día UTC entero (epochDays = floor(ms/86400000)).
 *
 * Los registros TSM son filas YA agregadas por TSM: no son transacciones
 * individuales y `stackSize` nunca se multiplica. No se quitan extremos, no hay
 * intervalos de confianza y no se infiere compatibilidad entre fuentes: la UI
 * decide qué se puede cruzar (TSM v1 no trae identidad acreditada).
 */

const DAY_MS = 86400000
const MAX_NOW_MS = 8640000000000000
const MAX_TSM_TIME = 8640000000000 // segundos: tope ya usado por el parser TSM
export const METODO_TSM = 'tsm-descriptiva-v1'

const DEFAULTS = { windowDays: 28, minDays: 5, staleDays: 7, dispersionLimit: 0.5 }

const freezeDeep = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) freezeDeep(value[key])
    Object.freeze(value)
  }
  return value
}

const esSeguro = n => typeof n === 'number' && Number.isSafeInteger(n)

function sumaSegura(a, b) {
  const total = a + b
  if (!Number.isSafeInteger(total)) throw new RangeError('unidades fuera de rango')
  return total
}

function normalizeOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('nowMs obligatorio y finito')
  }
  const { nowMs } = options
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs) || Math.abs(nowMs) > MAX_NOW_MS) {
    throw new TypeError('nowMs obligatorio y finito')
  }
  const config = {}
  for (const key of Object.keys(DEFAULTS)) {
    const value = options[key] === undefined ? DEFAULTS[key] : options[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new RangeError(`${key} debe ser un número finito no negativo`)
    }
    config[key] = value
  }
  const windowStart = nowMs - config.windowDays * DAY_MS
  if (!Number.isFinite(windowStart)) throw new RangeError('windowStart no finito')
  return { nowMs, config, windowStart }
}

function itemIdDe(itemString) {
  const m = /^i:([1-9]\d*)(?::[0-9-]*)*$/.exec(itemString)
  if (!m) return null
  const id = Number(m[1])
  return Number.isSafeInteger(id) ? id : null
}

// Cuantil tipo 7 (interpolación lineal): pos = (n-1)*q. Con q=0.5 promedia
// los dos valores centrales cuando n es par (mediana convencional entre días).
function cuantilTipo7(valores, q) {
  if (!valores.length) return null
  const xs = [...valores].sort((a, b) => a - b)
  const pos = (xs.length - 1) * q
  const lo = Math.floor(pos), hi = Math.ceil(pos)
  if (lo === hi) return xs[lo]
  return xs[lo] + (pos - lo) * (xs[hi] - xs[lo])
}

// Cuantil inversa CDF con peso en unidades: primer precio cuyo acumulado
// alcanza q*total. Es la mediana ponderada de UN día.
function medianaPonderada(regs, q = 0.5) {
  let total = 0
  for (const r of regs) total = sumaSegura(total, r.quantity)
  if (!total) return null
  const objetivo = q * total
  const ordenados = [...regs].sort((a, b) => a.unitPriceCopper - b.unitPriceCopper || a.time - b.time)
  let acumulado = 0
  for (const r of ordenados) {
    acumulado = sumaSegura(acumulado, r.quantity)
    if (acumulado >= objetivo) return r.unitPriceCopper
  }
  return ordenados[ordenados.length - 1].unitPriceCopper
}

function resumen(records) {
  const byDay = new Map()
  let units = 0, min = Infinity, max = -Infinity, first = null, last = null
  for (const r of records) {
    const day = Math.floor((r.time * 1000) / DAY_MS) // día UTC entero
    if (!byDay.has(day)) byDay.set(day, { regs: [] })
    const g = byDay.get(day)
    g.regs.push(r)
    units = sumaSegura(units, r.quantity)
    if (r.unitPriceCopper < min) min = r.unitPriceCopper
    if (r.unitPriceCopper > max) max = r.unitPriceCopper
    if (first === null || r.time < first) first = r.time // SEGUNDOS
    if (last === null || r.time > last) last = r.time
  }
  const daily = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, g]) => {
    let dayUnits = 0
    for (const r of g.regs) dayUnits = sumaSegura(dayUnits, r.quantity)
    return { day, units: dayUnits, records: g.regs.length, medianCopper: medianaPonderada(g.regs) }
  })
  const valoresDiarios = daily.map(d => d.medianCopper)
  return {
    units,
    records: records.length,
    days: daily.length,
    firstSale: first,
    lastSale: last,
    medianCopper: cuantilTipo7(valoresDiarios, 0.5),
    q1Copper: cuantilTipo7(valoresDiarios, 0.25),
    q3Copper: cuantilTipo7(valoresDiarios, 0.75),
    minCopper: records.length ? min : null,
    maxCopper: records.length ? max : null,
    daily,
  }
}

// Clasificación disjunta, con precedencia: invalid > zero > future >
// outsideWindow > incluido. `pasados` alimenta history sin aplicar ventana;
// `enVentana` alimenta window con bordes incluidos.
function clasificar(records, nowMs, windowStart) {
  const excluidos = { future: 0, zero: 0, invalid: 0, outsideWindow: 0 }
  const pasados = [], enVentana = []
  for (const r of records) {
    if (!r || typeof r !== 'object' || !esSeguro(r.quantity) || r.quantity < 0 ||
        !esSeguro(r.unitPriceCopper) || r.unitPriceCopper < 0 ||
        !esSeguro(r.time) || r.time <= 0 || r.time > MAX_TSM_TIME) {
      excluidos.invalid++
      continue
    }
    if (r.unitPriceCopper === 0 || r.quantity === 0) { excluidos.zero++; continue }
    const ms = r.time * 1000
    if (ms > nowMs) { excluidos.future++; continue }
    pasados.push(r)
    if (ms >= windowStart) enVentana.push(r)
    else excluidos.outsideWindow++
  }
  return { excluidos, pasados, enVentana }
}

const esVentaAuction = r => !!r && typeof r === 'object' && r.kind === 'sale' && r.source === 'Auction' &&
  typeof r.itemString === 'string' && r.itemString.length > 0

// Suficiencia: no-sales domina (evita duplicar insufficient-days cuando no hay
// nada que valorar). El resto se emite en orden fijo y estable.
function evaluarSuficiencia(w, config, nowMs) {
  const { medianCopper: mediana, q1Copper: q1, q3Copper: q3, lastSale } = w
  const dispersion = mediana !== null && mediana > 0 && q1 !== null && q3 !== null
    ? (q3 - q1) / mediana : null
  const reasons = []
  if (w.records === 0) {
    reasons.push('no-sales')
  } else {
    if (w.days < config.minDays) reasons.push('insufficient-days')
    if (lastSale !== null && nowMs - lastSale * 1000 > config.staleDays * DAY_MS) reasons.push('stale')
    if (dispersion !== null && dispersion > config.dispersionLimit) reasons.push('wide-dispersion')
  }
  return { dispersion, reasons, sufficient: reasons.length === 0 }
}

// Constructor interino: recibe ya los candidatos de UNA variante, sin volver a
// recorrer el snapshot (evita el cuadrático al listar miles de variantes).
function valorarCandidatos(candidatos, realmName, itemString, norm) {
  const { nowMs, config, windowStart } = norm
  const { excluidos, pasados, enVentana } = clasificar(candidatos, nowMs, windowStart)
  const window = resumen(enVentana)
  const { dispersion, reasons, sufficient } = evaluarSuficiencia(window, config, nowMs)
  return freezeDeep({
    methodVersion: METODO_TSM,
    config,
    realmName,
    itemString,
    itemId: itemIdDe(itemString),
    evaluatedAt: nowMs,
    windowStart,
    window,
    history: resumen(pasados),
    excluded: excluidos,
    dispersion,
    reasons,
    sufficient,
  })
}

const encontrarReino = (snapshot, realmName) => snapshot.realms.find(r => r && r.name === realmName)

export function valorarTsm(snapshot, realmName, itemString, options = {}) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.realms)) {
    throw new TypeError('snapshot inválido')
  }
  if (typeof realmName !== 'string' || realmName.length === 0) throw new TypeError('realmName inválido')
  if (typeof itemString !== 'string' || itemString.length === 0) throw new TypeError('itemString inválido')
  const norm = normalizeOptions(options)
  const realm = encontrarReino(snapshot, realmName)
  const candidatos = realm && Array.isArray(realm.records)
    ? realm.records.filter(r => esVentaAuction(r) && r.itemString === itemString)
    : []
  return valorarCandidatos(candidatos, realmName, itemString, norm)
}

export function listarValoracionesTsm(snapshot, realmName, options = {}) {
  // Tras un borrado el snapshot es null: listar debe devolver [] y no tumbar el ciclo de vida.
  if (snapshot === null || snapshot === undefined) {
    normalizeOptions(options)
    return freezeDeep([])
  }
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.realms)) {
    throw new TypeError('snapshot inválido')
  }
  if (typeof realmName !== 'string' || realmName.length === 0) throw new TypeError('realmName inválido')
  const norm = normalizeOptions(options)
  const realm = encontrarReino(snapshot, realmName)
  const records = realm ? realm.records : null
  if (!Array.isArray(records)) return freezeDeep([])
  const grupos = new Map()
  for (const r of records) { // UNA sola pasada; agrupa por itemString exacto
    if (!esVentaAuction(r)) continue
    let grupo = grupos.get(r.itemString)
    if (!grupo) { grupo = []; grupos.set(r.itemString, grupo) }
    grupo.push(r)
  }
  const ordenadas = [...grupos.keys()].sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
  return freezeDeep(ordenadas.map(itemString =>
    valorarCandidatos(grupos.get(itemString), realmName, itemString, norm)))
}
