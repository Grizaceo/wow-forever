/**
 * subasta-pawn.js — puntuador determinista de ofertas de subasta con los pesos
 * Pawn del personaje. Módulo PURO: sin DOM, sin React, sin red, sin reloj, sin
 * aleatoriedad. Mismas entradas → misma tabla, byte por byte.
 *
 * Fórmula (contrato del encargo, no una sugerencia):
 *
 *   score(item, e)  = Σ_stat  stats[item][stat] * pesos[stat]
 *   delta(item, e)  = score(item, e) - score(equipado[slot], e)
 *   plata_por_punto = (precio_cobre / 100) / max(delta, épsilon)
 *   orden           = delta DESC, empate por itemID ASC
 *
 * Reglas duras que aplica este archivo:
 *  - stats presentes en el ítem pero ausentes en `pesos` valen 0 (no se
 *    interpola ni se adivina); se informan en `sinPeso` para que la vista los
 *    muestre sin cambiar el número.
 *  - ítem sin stats cosechados → excluido `sin-stats` (nunca score 0 silencioso).
 *  - equipLoc desconocido → excluido `sin-slot`.
 *  - sin escala con pesos → la vista entera queda `SIN DATOS`.
 *  - delta ≤ 0 no tiene precio por punto (`null`, no `Infinity`).
 *  - el redondeo es SOLO de presentación (`redondear2`); el orden y el cálculo
 *    usan el valor completo.
 *
 * Pawn es de solo lectura: este módulo no escribe nada en el juego ni en la
 * subasta, y no simula DPS ni «best in slot».
 */
import { mapearStats, slotDeEquipLoc, equipadoPorSlot } from './item-stats.js'

export const EPSILON = 1e-9
export const MAX_OFERTAS = 20000
export const MAX_FILAS = 500

export const MOTIVOS = Object.freeze({
  SIN_ESCALA: 'sin-escala-pawn',
  SIN_CATALOGO: 'sin-catalogo-stats',
  SIN_OFERTAS: 'sin-ofertas',
  SIN_STATS: 'sin-stats',
  SIN_SLOT: 'sin-slot',
  SIN_EQUIPADO_STATS: 'sin-equipado-stats',
  PRECIO_INVALIDO: 'precio-invalido',
})

const esObj = v => !!v && typeof v === 'object' && !Array.isArray(v)
const finito = v => typeof v === 'number' && Number.isFinite(v)

/** Redondeo de PRESENTACIÓN a 2 decimales (nunca se usa para ordenar). */
export const redondear2 = v => (finito(v) ? Math.round(v * 100) / 100 : null)

/**
 * Puntúa un mapa de stats crudos del cliente contra los pesos de una escala.
 * Devuelve `{ score, usados, sinPeso, sinMapa }`:
 *  - `usados`: stats que aportaron (peso ≠ 0), con valor, peso y aporte;
 *  - `sinPeso`: stats del ítem con peso 0/ausente (aportan 0 por contrato);
 *  - `sinMapa`: claves crudas que Pawn no conoce (se reportan, no se descartan).
 */
export function puntuar(stats, pesos) {
  const { pesos: porClave, sinMapa } = mapearStats(stats)
  const p = esObj(pesos) ? pesos : {}
  const usados = []
  const sinPeso = []
  let score = 0
  for (const clave of Object.keys(porClave).sort()) {
    const valor = porClave[clave]
    const peso = finito(p[clave]) ? p[clave] : 0
    if (peso === 0) { sinPeso.push({ stat: clave, valor }); continue }
    const aporte = valor * peso
    score += aporte
    usados.push({ stat: clave, valor, peso, aporte })
  }
  return { score, usados, sinPeso, sinMapa }
}

/**
 * Agrupa las filas del snapshot por ítem y se queda con el MENOR precio unitario
 * observado (determinista: no depende del orden de llegada). `ofertas` viene de
 * la vista de mercado, donde un ítem puede aparecer varias veces.
 */
export function precioPorItem(ofertas) {
  const out = new Map()
  const lista = Array.isArray(ofertas) ? ofertas.slice(0, MAX_OFERTAS) : []
  for (const o of lista) {
    if (!esObj(o)) continue
    const id = Number.isSafeInteger(o.itemId) ? o.itemId : Number(o.itemId)
    if (!Number.isSafeInteger(id) || id <= 0) continue
    // Solo precios positivos: un 0 o un negativo en el snapshot es dato inválido
    // y no debe enmascarar el precio real del ítem al tomar el mínimo.
    const precio = finito(o.unitPriceCopper) && o.unitPriceCopper > 0 ? o.unitPriceCopper : null
    const prev = out.get(id)
    if (!prev) { out.set(id, { itemID: id, precio, ofertas: 1 }); continue }
    prev.ofertas += 1
    if (precio !== null && (prev.precio === null || precio < prev.precio)) prev.precio = precio
  }
  return [...out.values()].sort((a, b) => a.itemID - b.itemID)
}

/**
 * Ranking determinista.
 *
 * `entrada`:
 *   ofertas  — filas del snapshot visible (`{ itemId, unitPriceCopper }`);
 *   escala   — `estado.pawn` (usa `pesos`, `localized`, `capturado`);
 *   equipado — `estado.pawn.equipado` (`[{ slot, itemID, ilvl, equipLoc, stats }]`);
 *   catalogo — `pawn-stats` (`{ itens, colhido, fonte, resolvidos, pendentes }`).
 *
 * Devuelve `{ estado, motivo, filas, excluidos, resumen, procedencia }`.
 * `estado: 'sin-datos'` + `motivo` cuando falta una entrada imprescindible: la
 * vista debe decir exactamente esto y no mostrar números inventados.
 */
export function rankear({ ofertas, escala, equipado, catalogo } = {}) {
  const vacio = { filas: [], excluidos: [], resumen: {}, procedencia: {} }
  const pesos = esObj(escala?.pesos) ? escala.pesos : null
  if (!pesos || Object.keys(pesos).length === 0) {
    return { estado: 'sin-datos', motivo: MOTIVOS.SIN_ESCALA, ...vacio }
  }
  const itens = esObj(catalogo?.itens) ? catalogo.itens : null
  if (!itens || Object.keys(itens).length === 0) {
    return { estado: 'sin-datos', motivo: MOTIVOS.SIN_CATALOGO, ...vacio }
  }
  const porItem = precioPorItem(ofertas)
  if (!porItem.length) {
    return { estado: 'sin-datos', motivo: MOTIVOS.SIN_OFERTAS, ...vacio }
  }

  const equipadoSlot = equipadoPorSlot(equipado)
  const filas = []
  const excluidos = []
  const porMotivo = {}
  const excluir = (itemID, precio, motivo, extra = {}) => {
    excluidos.push({ itemID, precio, motivo, ...extra })
    porMotivo[motivo] = (porMotivo[motivo] || 0) + 1
  }

  for (const oferta of porItem) {
    const { itemID, precio } = oferta
    const rec = itens[itemID]
    if (!rec || !rec.stats || Object.keys(rec.stats).length === 0) {
      excluir(itemID, precio, MOTIVOS.SIN_STATS)
      continue
    }
    const info = slotDeEquipLoc(rec.equipLoc)
    if (!info) {
      excluir(itemID, precio, MOTIVOS.SIN_SLOT, { equipLoc: rec.equipLoc })
      continue
    }
    if (!finito(precio) || precio <= 0) {
      excluir(itemID, precio, MOTIVOS.PRECIO_INVALIDO, { slot: info.slot })
      continue
    }
    const yo = puntuar(rec.stats, pesos)
    // Base del delta: el MEJOR de los ítems equipados en el grupo de slots. Si
    // alguno de los equipados no tiene stats cosechados, el delta sería una
    // comparación a ciegas: se excluye en vez de asumir 0.
    const candidatos = (equipadoSlot[info.slot] || []).filter(e => info.ids.includes(e.slot))
    let base = 0
    let baseItemID = null
    let baseSlot = null
    let baseTipo = 'vacio'
    let ciego = false
    for (const eq of candidatos) {
      if (!eq.stats || Object.keys(eq.stats).length === 0) { ciego = true; break }
      const s = puntuar(eq.stats, pesos).score
      if (baseItemID === null || s < base || (s === base && eq.slot < baseSlot)) {
        base = s
        baseItemID = eq.itemID
        baseSlot = eq.slot
        baseTipo = 'equipado'
      }
    }
    if (ciego) {
      excluir(itemID, precio, MOTIVOS.SIN_EQUIPADO_STATS, { slot: info.slot })
      continue
    }
    const delta = yo.score - base
    filas.push({
      itemID,
      slot: info.slot,
      equipLoc: rec.equipLoc,
      ilvl: rec.ilvl,
      precio,
      precioOro: precio / 10000,
      ofertas: oferta.ofertas,
      score: yo.score,
      delta,
      base,
      baseTipo,
      baseItemID,
      baseSlot,
      plataPorPunto: delta > EPSILON ? (precio / 100) / delta : null,
      usados: yo.usados,
      sinPeso: yo.sinPeso,
      sinMapa: yo.sinMapa,
    })
  }

  // Orden por contrato: delta DESC, empate por itemID ASC. Se ordena con el
  // valor completo; el redondeo ocurre después.
  filas.sort((a, b) => (b.delta - a.delta) || (a.itemID - b.itemID))
  const recortadas = filas.slice(0, MAX_FILAS)
  const visibles = recortadas.map(f => ({
    ...f,
    score: redondear2(f.score),
    delta: redondear2(f.delta),
    base: redondear2(f.base),
    plataPorPunto: f.plataPorPunto === null ? null : redondear2(f.plataPorPunto),
    usados: f.usados.map(u => ({ ...u, aporte: redondear2(u.aporte) })),
  }))
  excluidos.sort((a, b) => (a.itemID - b.itemID) || String(a.motivo).localeCompare(String(b.motivo)))

  return {
    estado: 'listo',
    motivo: null,
    filas: visibles,
    excluidos,
    resumen: {
      ofertas: porItem.reduce((n, o) => n + o.ofertas, 0),
      items: porItem.length,
      incluidos: filas.length,
      excluidos: excluidos.length,
      recortados: Math.max(0, filas.length - recortadas.length),
      porMotivo,
    },
    procedencia: {
      escala: { nome: escala?.escala || null, localized: escala?.localized || null, capturado: escala?.capturado ?? null },
      stats: { colhido: catalogo?.colhido ?? null, fonte: catalogo?.fonte ?? 0, resolvidos: catalogo?.resolvidos ?? 0, pendentes: catalogo?.pendentes ?? 0 },
      formula: 'delta DESC, empate itemID ASC',
    },
  }
}
