/**
 * Catálogo de stats por ítem (itemID → stats), cosechado por el addon.
 *
 * El addon (`addon/WoWForeverBridge/Pawn.lua`) no puede puntuar ofertas solo con
 * Pawn: `PawnGetInventoryItemValues` devuelve valores del equipo puesto
 * (Pawn.lua:2028-2095) y los stats de un ítem de subasta solo existen dentro del
 * cliente. Por eso el addon cosecha `C_Item.GetItemStats` para los ids que ya
 * ingiere el plugin y lo graba en `WoWForeverBridgeDB.pawnCatalogo`.
 *
 * Este módulo es puro (sin DOM, sin React, sin red): lee ese bloque, valida,
 * traduce las claves crudas del cliente a las claves de stat de Pawn y normaliza
 * el equipo por slot que usa el delta de `subasta-pawn.js`.
 *
 * Trampa del repo: `standalone/market.js` devuelve toda tabla Lua como objeto con
 * claves string (`{1:a,2:b}`). Aquí NADA se asume array: `itens` se recorre con
 * `Object.keys` y se indexa por id numérico validado. Los tests con arrays JS
 * reales no detectan ese fallo; por eso el fixture canónico es un SavedVariables.
 */

export const CLAVE_STATS = 'pawn-stats'
export const VERSION_CATALOGO = 1
export const MAX_ITENS = 3000
export const MAX_STATS = 40
export const MAX_ILVL = 1000
export const MAX_SLOTS = 19
export const MAX_STAT = 100000
export const MAX_BYTES = 8 * 1024 * 1024

/**
 * Slots de equipo. Fuente verificada en este cliente:
 * ForeverDungeonJournal/UI/ItemComparisonData.lua:4-30 (FDJ.EQUIP_LOC_SLOTS).
 * `ids` son los slots de `GetInventoryItemLink('player', slot)` que cubre el
 * equipLoc; un anillo o un abalorio puede ocupar dos.
 */
export const SLOTS_EQUIPLOC = Object.freeze({
  INVTYPE_HEAD: { slot: 'HEAD', ids: [1] },
  INVTYPE_NECK: { slot: 'NECK', ids: [2] },
  INVTYPE_SHOULDER: { slot: 'SHOULDER', ids: [3] },
  INVTYPE_BODY: { slot: 'SHIRT', ids: [4] },
  INVTYPE_CHEST: { slot: 'CHEST', ids: [5] },
  INVTYPE_ROBE: { slot: 'CHEST', ids: [5] },
  INVTYPE_WAIST: { slot: 'WAIST', ids: [6] },
  INVTYPE_LEGS: { slot: 'LEGS', ids: [7] },
  INVTYPE_FEET: { slot: 'FEET', ids: [8] },
  INVTYPE_WRIST: { slot: 'WRIST', ids: [9] },
  INVTYPE_HAND: { slot: 'HANDS', ids: [10] },
  INVTYPE_FINGER: { slot: 'FINGER', ids: [11, 12] },
  INVTYPE_TRINKET: { slot: 'TRINKET', ids: [13, 14] },
  INVTYPE_CLOAK: { slot: 'CLOAK', ids: [15] },
  INVTYPE_WEAPONMAINHAND: { slot: 'MAINHAND', ids: [16] },
  INVTYPE_2HWEAPON: { slot: 'MAINHAND', ids: [16] },
  INVTYPE_WEAPONOFFHAND: { slot: 'OFFHAND', ids: [17] },
  INVTYPE_SHIELD: { slot: 'OFFHAND', ids: [17] },
  INVTYPE_HOLDABLE: { slot: 'OFFHAND', ids: [17] },
  INVTYPE_RANGED: { slot: 'RANGED', ids: [18] },
  INVTYPE_RANGEDRIGHT: { slot: 'RANGED', ids: [18] },
  INVTYPE_THROWN: { slot: 'RANGED', ids: [18] },
  INVTYPE_RELIC: { slot: 'RANGED', ids: [18] },
  INVTYPE_TABARD: { slot: 'TABARD', ids: [19] },
})

/**
 * Clave cruda de `C_Item.GetItemStats` → clave de stat de Pawn.
 *
 * Origen de las claves crudas (todas verificadas en este cliente):
 *  - ForeverDungeonJournal/UI/ItemComparisonData.lua:33-71 (38 claves, incluidas
 *    las formas SIN sufijo y `RESISTANCE0..6_NAME`);
 *  - inventario de `Wow.exe` (`grep ^ITEM_MOD_`, ver fixture de tests).
 * Destino: vocabulario de Pawn (`Pawn/ScaleTemplates.lua` + stats primarios).
 *
 * Lo que no está aquí NO se adivina: `mapearStats` lo devuelve en `sinMapa` y la
 * vista lo declara. Un stat sin peso en la escala vale 0 por contrato, pero un
 * stat que Pawn no conoce se reporta, no se descarta en silencio.
 */
const PARES_MAPA = [
  // Primarios y armadura
  ['ITEM_MOD_STRENGTH_SHORT', 'Strength'],
  ['ITEM_MOD_AGILITY_SHORT', 'Agility'],
  ['ITEM_MOD_STAMINA_SHORT', 'Stamina'],
  ['ITEM_MOD_INTELLECT_SHORT', 'Intellect'],
  ['ITEM_MOD_SPIRIT_SHORT', 'Spirit'],
  ['RESISTANCE0_NAME', 'Armor'],
  ['ITEM_MOD_ARMOR_SHORT', 'Armor'],
  ['ITEM_MOD_EXTRA_ARMOR_SHORT', 'Armor'],
  // Daño y potencia
  ['ITEM_MOD_DAMAGE_PER_SECOND_SHORT', 'Dps'],
  ['ITEM_MOD_ATTACK_POWER_SHORT', 'Ap'],
  ['ITEM_MOD_MELEE_ATTACK_POWER_SHORT', 'Ap'],
  ['ITEM_MOD_RANGED_ATTACK_POWER_SHORT', 'Rap'],
  ['ITEM_MOD_FERAL_ATTACK_POWER_SHORT', 'FeralAp'],
  ['ITEM_MOD_SPELL_DAMAGE_DONE_SHORT', 'SpellDamage'],
  ['ITEM_MOD_SPELL_POWER_SHORT', 'SpellDamage'],
  ['ITEM_MOD_SPELL_HEALING_DONE_SHORT', 'Healing'],
  ['ITEM_MOD_MANA_REGENERATION_SHORT', 'Mp5'],
  ['ITEM_MOD_HEALTH_REGEN_SHORT', 'Hp5'],
  // Ratings
  ['ITEM_MOD_DEFENSE_SKILL_RATING', 'DefenseRating'],
  ['ITEM_MOD_DEFENSE_SKILL_RATING_SHORT', 'DefenseRating'],
  ['ITEM_MOD_DODGE_RATING', 'DodgeRating'],
  ['ITEM_MOD_DODGE_RATING_SHORT', 'DodgeRating'],
  ['ITEM_MOD_PARRY_RATING', 'ParryRating'],
  ['ITEM_MOD_PARRY_RATING_SHORT', 'ParryRating'],
  ['ITEM_MOD_BLOCK_RATING', 'BlockRating'],
  ['ITEM_MOD_BLOCK_RATING_SHORT', 'BlockRating'],
  ['ITEM_MOD_BLOCK_VALUE', 'BlockValue'],
  ['ITEM_MOD_BLOCK_VALUE_SHORT', 'BlockValue'],
  ['ITEM_MOD_HIT_RATING', 'HitRating'],
  ['ITEM_MOD_HIT_RATING_SHORT', 'HitRating'],
  ['ITEM_MOD_HIT_MELEE_RATING', 'HitRating'],
  ['ITEM_MOD_HIT_MELEE_RATING_SHORT', 'HitRating'],
  ['ITEM_MOD_HIT_RANGED_RATING', 'HitRating'],
  ['ITEM_MOD_HIT_RANGED_RATING_SHORT', 'HitRating'],
  ['ITEM_MOD_HIT_SPELL_RATING', 'SpellHitRating'],
  ['ITEM_MOD_HIT_SPELL_RATING_SHORT', 'SpellHitRating'],
  ['ITEM_MOD_CRIT_RATING', 'CritRating'],
  ['ITEM_MOD_CRIT_RATING_SHORT', 'CritRating'],
  ['ITEM_MOD_CRIT_MELEE_RATING', 'CritRating'],
  ['ITEM_MOD_CRIT_MELEE_RATING_SHORT', 'CritRating'],
  ['ITEM_MOD_CRIT_RANGED_RATING', 'CritRating'],
  ['ITEM_MOD_CRIT_RANGED_RATING_SHORT', 'CritRating'],
  ['ITEM_MOD_CRIT_SPELL_RATING', 'SpellCritRating'],
  ['ITEM_MOD_CRIT_SPELL_RATING_SHORT', 'SpellCritRating'],
  ['ITEM_MOD_HASTE_RATING', 'HasteRating'],
  ['ITEM_MOD_HASTE_RATING_SHORT', 'HasteRating'],
  ['ITEM_MOD_HASTE_MELEE_RATING', 'HasteRating'],
  ['ITEM_MOD_HASTE_MELEE_RATING_SHORT', 'HasteRating'],
  ['ITEM_MOD_HASTE_RANGED_RATING', 'HasteRating'],
  ['ITEM_MOD_HASTE_RANGED_RATING_SHORT', 'HasteRating'],
  ['ITEM_MOD_EXPERTISE_RATING', 'ExpertiseRating'],
  ['ITEM_MOD_EXPERTISE_RATING_SHORT', 'ExpertiseRating'],
  ['ITEM_MOD_RESILIENCE_RATING_SHORT', 'ResilienceRating'],
  ['ITEM_MOD_MASTERY_RATING_SHORT', 'MasteryRating'],
  ['ITEM_MOD_VERSATILITY', 'Versatility'],
  // Penetración: por escuela se agrupa en SpellPenetration (Pawn solo tiene esa)
  ['ITEM_MOD_SPELL_PENETRATION_SHORT', 'SpellPenetration'],
  ['ITEM_MOD_ARCANE_PENETRATION_SHORT', 'SpellPenetration'],
  ['ITEM_MOD_FIRE_PENETRATION_SHORT', 'SpellPenetration'],
  ['ITEM_MOD_FROST_PENETRATION_SHORT', 'SpellPenetration'],
  ['ITEM_MOD_NATURE_PENETRATION_SHORT', 'SpellPenetration'],
  ['ITEM_MOD_SHADOW_PENETRATION_SHORT', 'SpellPenetration'],
  // Escuelas de daño
  ['ITEM_MOD_HOLY_DAMAGE_DONE_SHORT', 'HolySpellDamage'],
  ['ITEM_MOD_FIRE_DAMAGE_DONE_SHORT', 'FireSpellDamage'],
  ['ITEM_MOD_FROST_DAMAGE_DONE_SHORT', 'FrostSpellDamage'],
  ['ITEM_MOD_NATURE_DAMAGE_DONE_SHORT', 'NatureSpellDamage'],
  ['ITEM_MOD_SHADOW_DAMAGE_DONE_SHORT', 'ShadowSpellDamage'],
  ['ITEM_MOD_ARCANE_DAMAGE_DONE_SHORT', 'ArcaneSpellDamage'],
  // Resistencias (RESISTANCE1..6_NAME: Holy/Fire/Nature/Frost/Shadow/Arcane)
  ['RESISTANCE1_NAME', null], // Holy: Pawn no tiene clave de resistencia sagrada
  ['RESISTANCE2_NAME', 'FireResist'],
  ['RESISTANCE3_NAME', 'NatureResist'],
  ['RESISTANCE4_NAME', 'FrostResist'],
  ['RESISTANCE5_NAME', 'ShadowResist'],
  ['RESISTANCE6_NAME', 'ArcaneResist'],
  ['ITEM_MOD_FIRE_RESISTANCE_SHORT', 'FireResist'],
  ['ITEM_MOD_FROST_RESISTANCE_SHORT', 'FrostResist'],
  ['ITEM_MOD_NATURE_RESISTANCE_SHORT', 'NatureResist'],
  ['ITEM_MOD_SHADOW_RESISTANCE_SHORT', 'ShadowResist'],
  ['ITEM_MOD_ARCANE_RESISTANCE_SHORT', 'ArcaneResist'],
  // Habilidades de arma
  ['ITEM_MOD_AXES_SHORT', 'AxeRating'],
  ['ITEM_MOD_TWOHANDED_AXES_SHORT', '2HAxeRating'],
  ['ITEM_MOD_MACES_SHORT', 'MaceRating'],
  ['ITEM_MOD_TWOHANDED_MACES_SHORT', '2HMaceRating'],
  ['ITEM_MOD_SWORDS_SHORT', 'SwordRating'],
  ['ITEM_MOD_TWOHANDED_SWORDS_SHORT', '2HSwordRating'],
  ['ITEM_MOD_DAGGERS_SHORT', 'DaggerRating'],
  ['ITEM_MOD_BOWS_SHORT', 'BowRating'],
  ['ITEM_MOD_CROSSBOWS_SHORT', 'CrossbowRating'],
  ['ITEM_MOD_GUNS_SHORT', 'GunRating'],
  // Efectos terciarios (Pawn 2.14 nombra así a los CR_*)
  ['ITEM_MOD_CR_AVOIDANCE_SHORT', 'Avoidance'],
  ['ITEM_MOD_CR_LIFESTEAL_SHORT', 'Leech'],
  ['ITEM_MOD_CR_SPEED_SHORT', 'MovementSpeed'],
  ['ITEM_MOD_CR_STURDINESS_SHORT', 'Indestructible'],
]

export const MAPA_STATS = Object.freeze(Object.fromEntries(PARES_MAPA.filter(([, v]) => v)))

/**
 * Claves Pawn canónicas (los destinos del mapa). Sirven para que la
 * normalización sea **idempotente**: un ítem que ya se guardó con `Agility`
 * —la forma del storage `pawn-stats`— no debe aparecer como «sin mapa».
 */
export const CLAVES_PAWN = Object.freeze(new Set(Object.values(MAPA_STATS)))

/** Claves crudas que el cliente reconoce pero Pawn no sabe puntuar (se reportan). */
export const SIN_CLAVE_PAWN = Object.freeze(PARES_MAPA.filter(([, v]) => !v).map(([k]) => k))

const claveRaw = (k) => typeof k === 'string' && k.length > 0 && k.length <= 64

const numero = (v, max) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max ? v : null)

/**
 * Traduce stats crudos a pesos por clave Pawn. Claves sin mapa → `sinMapa`.
 * Suma cuando dos claves crudas apuntan a la misma clave Pawn (p. ej. Armor y
 * EXTRA_ARMOR): el valor del ítem es la suma, no el último leído.
 */
export function mapearStats(stats) {
  const pesos = {}
  const sinMapa = []
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return { pesos, sinMapa }
  for (const k of Object.keys(stats).sort()) {
    const v = numero(stats[k], MAX_STAT)
    if (v === null || v === 0) continue
    const destino = MAPA_STATS[k] || (CLAVES_PAWN.has(k) ? k : null)
    if (!destino) { sinMapa.push(k); continue }
    pesos[destino] = (pesos[destino] || 0) + v
  }
  return { pesos, sinMapa }
}

/** Slot de equipo de un equipLoc, o null si no se conoce (nunca se adivina). */
export function slotDeEquipLoc(loc) {
  if (typeof loc !== 'string') return null
  return SLOTS_EQUIPLOC[loc] || null
}

function recItem(id, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  // Acepta el bloque crudo del SavedVariables (i/l/c/s/k) y el ya normalizado
  // (ilvl/equipLoc/classID/subClassID/stats): así el parser es idempotente.
  const ilvl = numero(raw.i ?? raw.ilvl, MAX_ILVL)
  const stats = {}
  const crudo = raw.k ?? raw.stats
  if (crudo && typeof crudo === 'object' && !Array.isArray(crudo)) {
    let n = 0
    for (const k of Object.keys(crudo).sort()) {
      if (!claveRaw(k) || n >= MAX_STATS) continue
      const v = numero(crudo[k], MAX_STAT)
      if (v === null || v === 0) continue
      stats[k] = v
      n += 1
    }
  }
  const loc = raw.l ?? raw.equipLoc
  return {
    itemID: id,
    ilvl: ilvl === null ? null : Math.trunc(ilvl),
    equipLoc: typeof loc === 'string' && loc ? loc.slice(0, 64) : null,
    classID: numero(raw.c ?? raw.classID, 1000),
    subClassID: numero(raw.s ?? raw.subClassID, 1000),
    stats,
    truncado: raw.t === true,
  }
}

/**
 * Lee `WoWForeverBridgeDB.pawnCatalogo`. Devuelve null si el bloque no existe o
 * no es la versión que entendemos (el puente puede traer basura).
 */
export function parsePawnCatalogo(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null
  if ((valor.v ?? valor.version) !== VERSION_CATALOGO) return null
  const itens = {}
  let n = 0
  const crudos = valor.itens
  if (crudos && typeof crudos === 'object' && !Array.isArray(crudos)) {
    for (const k of Object.keys(crudos).sort((a, b) => Number(a) - Number(b))) {
      if (n >= MAX_ITENS) break
      if (!/^[1-9][0-9]*$/.test(k)) continue
      const id = Number(k)
      if (!Number.isSafeInteger(id) || id <= 0) continue
      const rec = recItem(id, crudos[k])
      if (!rec) continue
      itens[id] = rec
      n += 1
    }
  }
  return {
    v: VERSION_CATALOGO,
    colhido: numero(valor.colhido, 4e9),
    ciclo: numero(valor.ciclo, 1e6) || 0,
    cursor: numero(valor.cursor, 1e9) || 0,
    volta: numero(valor.volta, 1e6) || 0,
    fonte: numero(valor.fonte, 1e6) || 0,
    resolvidos: numero(valor.resolvidos, 1e6) || 0,
    pendentes: numero(valor.pendentes, 1e6) || 0,
    truncado: valor.truncado === true,
    itens,
  }
}

/**
 * Normaliza el equipo por slot (`pawn.equipado`) que captura el addon junto a la
 * escala. Acepta dos formas: la cruda del puente (claves de slot como string,
 * porque toda tabla Lua llega así) y la ya normalizada que devuelve esta misma
 * función (array), para que guardar y releer no pierda el equipo.
 * Devuelve un array ordenado por slot, sin duplicados de slot.
 */
export function parseEquipado(valor) {
  const out = []
  const push = (slot, raw) => {
    const id = Number.isInteger(raw.itemID) ? raw.itemID : raw.id
    const rec = recItem(Number.isInteger(id) ? id : 0, raw)
    if (!rec) return
    out.push({ slot, itemID: rec.itemID || null, ilvl: rec.ilvl, equipLoc: rec.equipLoc, stats: rec.stats })
  }
  if (Array.isArray(valor)) {
    for (const e of valor) {
      if (!e || typeof e !== 'object') continue
      const slot = numero(e.slot, MAX_SLOTS)
      if (slot === null || !Number.isInteger(slot) || slot < 1) continue
      push(slot, e)
    }
  } else if (valor && typeof valor === 'object') {
    for (const k of Object.keys(valor)) {
      if (!/^[1-9][0-9]*$/.test(k)) continue
      const slot = Number(k)
      if (!Number.isSafeInteger(slot) || slot > MAX_SLOTS) continue
      const raw = valor[k]
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
      push(slot, raw)
    }
  } else {
    return []
  }
  const vistos = new Set()
  const unicos = []
  out.sort((a, b) => a.slot - b.slot)
  for (const rec of out) {
    if (vistos.has(rec.slot)) continue
    vistos.add(rec.slot)
    unicos.push(rec)
  }
  return unicos
}

/** Ítems del catálogo cosechado indexados por slot (para el delta). */
export function equipadoPorSlot(equipado) {
  const out = {}
  for (const rec of equipado || []) {
    const info = slotDeEquipLoc(rec.equipLoc)
    if (!info) continue
    if (!out[info.slot]) out[info.slot] = []
    out[info.slot].push(rec)
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.slot - b.slot)
  return out
}

/* ------------------------------------------------------------------ lectura */

/**
 * Estado del catálogo listo para storage/vista. `catalogo` es el bloque ya
 * parseado por `parseBridge` (o el crudo: el parser es idempotente). Sin datos
 * devuelve un estado vacío honesto (`itens: {}`, `colhido: null`), nunca ceros
 * que parezcan una cosecha real.
 */
export function estadoPawnStats(catalogo, ahora) {
  const cat = parsePawnCatalogo(catalogo)
  return {
    version: VERSION_CATALOGO,
    leido: typeof ahora === 'number' && Number.isFinite(ahora) ? ahora : 0,
    colhido: cat ? cat.colhido : null,
    ciclo: cat ? cat.ciclo : 0,
    cursor: cat ? cat.cursor : 0,
    volta: cat ? cat.volta : 0,
    fonte: cat ? cat.fonte : 0,
    resolvidos: cat ? cat.resolvidos : 0,
    pendentes: cat ? cat.pendentes : 0,
    truncado: cat ? cat.truncado : false,
    itens: cat ? cat.itens : {},
  }
}

/**
 * Persiste el catálogo del puente en `pawn-stats`. Sin catálogo en el puente no
 * se toca lo guardado: una lectura fallida no borra una cosecha buena.
 */
export async function sincronizarPawnStats(ctx, journal, ahora) {
  const cat = parsePawnCatalogo(journal?.pawnCatalogo)
  if (!cat) return { status: 'sin-cambios' }
  const estado = estadoPawnStats(cat, ahora)
  await ctx.storage.set(CLAVE_STATS, estado)
  return { status: 'ok', estado }
}

/** Estado del catálogo desde storage; `{}` si aún no se ha sincronizado. */
export async function lerPawnStats(ctx) {
  try {
    const v = await ctx?.storage?.get?.(CLAVE_STATS)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch { return {} }
}
