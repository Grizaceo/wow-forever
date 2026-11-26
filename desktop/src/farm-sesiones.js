// farm-sesiones.js — sesiones del contador WoWForeverFarm (addon hermano).
// Puro: valida WoWForeverFarm.lua como DATOS (parser restringido compartido,
// nunca eval), normaliza las sesiones, las fusiona con lo guardado, calcula
// métricas por sesión, calibra el estilo del jugador y arma el contexto que
// se exporta al agente (sin nombres de personaje ni de reino).
import HunterMarket from '../../standalone/market.js'
import FarmPlan from '../../standalone/farm-plan.js'

export const FARM_FILE = 'WoWForeverFarm.lua'
export const FARM_MAX_BYTES = 4 * 1024 * 1024
export const MAX_SESIONES = 500
const MAX_KEYS = 4000
const MIN_MUERTES_ESTILO = 30
const DAY_MS = 86400000

const int = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= min && v <= max
const num = (v, min = 0, max = 1e12) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const lista = (o) => (Array.isArray(o) ? o : o && typeof o === 'object'
  ? Object.keys(o).filter((k) => /^\d+$/.test(k)).sort((a, b) => a - b).map((k) => o[k]) : [])

// {id: n} con ids enteros positivos y conteos acotados.
function conteo(o, max = 1e9) {
  const out = {}
  if (!o || typeof o !== 'object') return out
  let n = 0
  for (const [k, v] of Object.entries(o)) {
    if (!/^\d{1,9}$/.test(k) || !num(v, 0, max)) continue
    if (++n > MAX_KEYS) break
    out[k] = Math.round(v)
  }
  return out
}
// {npcId: {itemId: n}}
function conteo2(o) {
  const out = {}
  if (!o || typeof o !== 'object') return out
  let n = 0
  for (const [k, v] of Object.entries(o)) {
    if (!/^\d{1,9}$/.test(k) || !v || typeof v !== 'object') continue
    if (++n > MAX_KEYS) break
    const c = conteo(v)
    if (Object.keys(c).length) out[k] = c
  }
  return out
}
// Métodos con que el addon ve una muerte (0.2.0: sin registro de combate en
// Forever). «Directos» = ven también a los mobs que no sueltan nada.
const METODOS = ['party', 'died', 'xp', 'slain', 'dies', 'target', 'loot', 'cleu']
const DIRECTOS = ['party', 'died', 'xp', 'slain', 'dies', 'target', 'cleu']
const LECTURAS = [...METODOS, 'position', 'auctionator', 'ammo', 'bags', 'lootchat', 'secretos', 'pesca', 'robo']
const texto = (s, max = 40) => (typeof s === 'string' && s.length <= max && !/[\x00-\x1f]/.test(s) ? s : null)

export function normalizarSesion(s) {
  if (!s || typeof s !== 'object' || s.v !== 1 || !int(s.start, 1)) return null
  const stop = int(s.stop, s.start) ? s.stop : null
  const out = {
    id: `s${s.start}`, start: s.start, stop,
    level: int(s.level, 1, 100) ? s.level : null,
    class: texto(s.class), faction: texto(s.faction),
    active: num(s.active, 0, 7 * 86400) ? Math.round(s.active) : 0,
    paused: num(s.paused, 0, 30 * 86400) ? Math.round(s.paused) : 0,
    combat: num(s.combat, 0, 7 * 86400) ? Math.round(s.combat) : 0,
    looting: num(s.looting, 0, 7 * 86400) ? Math.round(s.looting) : 0,
    fights: int(s.fights, 0, 1e6) ? s.fights : 0,
    deaths: int(s.deaths, 0, 1e5) ? s.deaths : 0,
    kills: conteo(s.kills), corpses: conteo(s.corpses), skins: conteo(s.skins), gather: conteo(s.gather),
    killsAnon: int(s.killsAnon, 0, 1e6) ? s.killsAnon : 0,
    killBy: {}, signals: {},
    travel: num(s.travel, 0, 7 * 86400) ? Math.round(s.travel) : 0,
    deadTime: num(s.deadTime, 0, 7 * 86400) ? Math.round(s.deadTime) : 0,
    xp: num(s.xp, 0, 1e9) ? Math.round(s.xp) : 0,
    items: conteo2(s.items), skinItems: conteo2(s.skinItems), gatherItems: conteo2(s.gatherItems), other: conteo(s.other),
    got: conteo(s.got),
    // Cadáveres saqueados solos en su ventana (WoWForeverFarm ≥ 0.3.0): las
    // monedas de coinsBy salen solo de ellos. null = sesión anterior, sin muestra.
    coinCorpses: s.coinCorpses && typeof s.coinCorpses === 'object' ? conteo(s.coinCorpses) : null,
    // Pesca (WoWForeverFarm ≥ 0.3.0): capturas por IsFishingLoot y lo pescado.
    fishing: int(s.fishing, 0, 1e6) ? s.fishing : 0, fishItems: conteo(s.fishItems),
    money: {
      loot: num(s.money?.loot, -1e10, 1e10) ? Math.round(s.money.loot) : 0,
      merchant: num(s.money?.merchant, -1e10, 1e10) ? Math.round(s.money.merchant) : 0,
      other: num(s.money?.other, -1e10, 1e10) ? Math.round(s.money.other) : 0,
    },
    coinsBy: conteo(s.coinsBy), zones: conteo(s.zones),
    path: typeof s.path === 'string' && s.path.length <= 20000 && /^[\d:.,;]*$/.test(s.path) ? s.path : '',
    ammo: { start: int(s.ammo?.start) ? s.ammo.start : null, stop: int(s.ammo?.stop) ? s.ammo.stop : null },
    bags: { start: int(s.bags?.start, 0, 500) ? s.bags.start : null, stop: int(s.bags?.stop, 0, 500) ? s.bags.stop : null },
    methods: {},
    open: !stop,
  }
  for (const k of METODOS) {
    out.killBy[k] = int(s.killBy?.[k], 0, 1e6) ? s.killBy[k] : 0
    for (const sk of [k, `${k}_oculto`]) if (int(s.signals?.[sk], 1, 1e7)) out.signals[sk] = s.signals[sk]
  }
  for (const k of LECTURAS) out.methods[k] = s.methods?.[k] === true
  if (out.combat > out.active) out.combat = out.active
  if (out.deadTime > out.active) out.deadTime = out.active
  return out
}

// parseFarm(bytes) -> { sessions:[...], current: sesión abierta | null }
export function parseFarm(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > FARM_MAX_BYTES) throw Error('Sesiones: archivo vacío o mayor de 4 MiB.')
  const db = HunterMarket.parseSavedVariables(bytes, 'WoWForeverFarmDB')
  if (!db || db.version !== 1) throw Error('Sesiones: versión de WoWForeverFarm no compatible.')
  const sessions = []
  for (const s of lista(db.sessions)) {
    const n = normalizarSesion(s)
    if (n && n.stop) sessions.push(n)
  }
  // Las MAX_SESIONES más recientes (el archivo ya está acotado a 4 MiB).
  sessions.sort((a, b) => a.start - b.start)
  if (sessions.length > MAX_SESIONES) sessions.splice(0, sessions.length - MAX_SESIONES)
  const current = normalizarSesion(db.current)
  return { sessions, current: current && current.open ? current : null }
}

// Fusiona por id (inicio de la sesión): lo leído del juego reemplaza a lo
// guardado; lo que el addon ya podó se conserva en el plugin.
export function fusionarSesiones(prev, nuevas) {
  const m = new Map()
  for (const s of Array.isArray(prev) ? prev : []) if (s?.id) m.set(s.id, s)
  for (const s of Array.isArray(nuevas) ? nuevas : []) if (s?.id) m.set(s.id, s)
  return [...m.values()].sort((a, b) => a.start - b.start).slice(-MAX_SESIONES)
}

/* --------------------------------------------------------------- métricas */
const suma = (o) => Object.values(o || {}).reduce((s, v) => s + v, 0)
const muertesDe = (s) => suma(s.kills) + (s.killsAnon || 0)
const directo = (s) => DIRECTOS.some((k) => s.methods?.[k])
// Sesión apta para tasas de drop por mob: muertes vistas directamente y casi
// todas con su mob conocido (si no, las tasas por mob saldrían infladas).
const aptaObs = (s) => directo(s) && (s.killsAnon || 0) <= 0.1 * Math.max(1, muertesDe(s))
// Unidades por ítem: lo que entró a las bolsas según el chat («Recibes botín»)
// si el addon lo vio; si no, lo que mostraron las ventanas de botín.
function unidades(s) {
  const u = new Map()
  if (Object.keys(s.got || {}).length) {
    for (const [iid, q] of Object.entries(s.got)) u.set(Number(iid), q)
    return u
  }
  const add = (bag) => { for (const per of Object.values(bag || {})) for (const [iid, q] of Object.entries(per)) u.set(Number(iid), (u.get(Number(iid)) || 0) + q) }
  add(s.items); add(s.skinItems); add(s.gatherItems)
  for (const [iid, q] of Object.entries(s.other || {})) u.set(Number(iid), (u.get(Number(iid)) || 0) + q)
  for (const [iid, q] of Object.entries(s.fishItems || {})) u.set(Number(iid), (u.get(Number(iid)) || 0) + q)
  return u
}
// Zona principal de la sesión (más segundos por mapa) como clave del dataset.
function zonaPrincipal(s, dataset) {
  let best = null, t = -1
  for (const [k, v] of Object.entries(s.zones || {})) if (v > t && dataset?.zones?.[k]) { best = k; t = v }
  if (best) return best
  // Sin posición: la zona principal del mob más matado.
  const [npc] = Object.entries(s.kills || {}).sort((a, b) => b[1] - a[1])[0] || []
  return npc ? dataset?.mobs?.[npc]?.[4] || null : null
}

// Métricas de una sesión. ctx (opcional) = contexto del motor para valorar a
// precios actuales y predecir lo mismo que se farmeó.
export function metricasSesion(s, ctx = null, dataset = null) {
  const h = s.active / 3600
  const kills = muertesDe(s), corpses = suma(s.corpses), skins = suma(s.skins), gathers = suma(s.gather)
  const u = unidades(s)
  let vend = 0, ah = 0
  for (const [iid, q] of u) {
    const v = ctx ? FarmPlan.unitValue(iid, ctx) : { ah: 0, vendor: dataset?.items?.[String(iid)]?.[9] || 0 }
    vend += q * v.vendor; ah += q * Math.max(v.vendor, v.ah)
  }
  const coins = Math.max(0, s.money.loot)
  const m = {
    id: s.id, start: s.start, horas: h, activo: s.active, pausa: s.paused,
    combatePct: s.active ? s.combat / s.active : 0, saqueoPct: s.active ? s.looting / s.active : 0,
    restoPct: s.active ? Math.max(0, s.active - s.combat - s.looting) / s.active : 0,
    muertes: kills, muertesH: h > 0 ? kills / h : 0, peleaS: kills ? s.combat / kills : null,
    saqueoS: corpses + skins + gathers + (s.fishing || 0) ? s.looting / (corpses + skins + gathers + (s.fishing || 0)) : null,
    segPorMuerte: kills ? s.active / kills : null,
    cadaveres: corpses, desuellos: skins, recolecciones: gathers, muertesJugador: s.deaths,
    pescas: s.fishing || 0, pescasH: h > 0 ? (s.fishing || 0) / h : 0,
    // «pesca» si las capturas superan a las muertes: el modelo de mobs no la predice.
    tipo: (s.fishing || 0) > 0 && (s.fishing || 0) >= kills ? 'pesca' : 'mobs',
    monedas: coins, valorVendedor: vend, valorSubasta: ah,
    oroHVendedor: h > 0 ? (coins + vend) / h : 0, oroHSubasta: h > 0 ? (coins + ah) / h : 0,
    vendedorNeto: s.money.merchant, zona: zonaPrincipal(s, dataset),
    metodoMuertes: directo(s) ? 'directo' : s.methods.loot ? 'solo-saqueo' : 'sin-dato',
    muertesSinMob: s.killsAnon || 0, viajeS: s.travel || 0, muertoS: s.deadTime || 0,
    xp: s.xp || 0, xpH: h > 0 ? (s.xp || 0) / h : 0, botinDe: Object.keys(s.got || {}).length ? 'chat' : 'ventana',
    mobs: Object.entries(s.kills).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([e, n]) => ({ npcId: Number(e), nombre: dataset?.mobs?.[e]?.[0] || `#${e}`, muertes: n })),
    items: [...u].map(([iid, q]) => {
      const v = ctx ? FarmPlan.unitValue(iid, ctx) : { ah: 0, vendor: dataset?.items?.[String(iid)]?.[9] || 0 }
      return { itemId: iid, nombre: dataset?.items?.[String(iid)]?.[0] || `#${iid}`, unidades: q, valor: q * Math.max(v.vendor, v.ah) }
    }).sort((a, b) => b.valor - a.valor).slice(0, 8),
    prediccion: null,
  }
  if (ctx && kills >= 5 && h > 0) {
    // Predicción con el MODELO BASE (drops de Classic, estilo por defecto) y la
    // misma valoración que lo real (sin tope de venta): así «ritmo» y «botín»
    // dicen cuánto se aparta tu juego del modelo, sin circularidad con la
    // calibración hecha con estas mismas sesiones.
    const sinTope = new Map([...(ctx.market || new Map()).keys()].map((i) => [i, { units: 1e12, basis: 'sin-tope' }]))
    const base = { ...ctx, caps: sinTope, observed: null, style: { ...FarmPlan.STYLE_DEFAULT, ...(ctx.style?.speed ? { speed: ctx.style.speed } : {}) } }
    const f = FarmPlan.mixFarm(Object.entries(s.kills).map(([e, n]) => [Number(e), n]), m.zona, base)
    if (f) {
      const hp = FarmPlan.hourly(f, base)
      const valorMuertePred = f.rate > 0 ? (hp.gold + hp.ammo) / (f.rate * f.riskMult) : 0
      const valorMuerteReal = kills ? (coins + ah) / kills : 0
      m.prediccion = {
        oroH: hp.gph, muertesH: f.rate * f.riskMult, valorMuerte: valorMuertePred,
        errorOro: hp.gph > 0 ? m.oroHSubasta / hp.gph - 1 : null,
        errorRitmo: f.rate > 0 ? m.muertesH / (f.rate * f.riskMult) - 1 : null,
        errorBotin: valorMuertePred > 0 ? valorMuerteReal / valorMuertePred - 1 : null,
      }
    }
  }
  return m
}

/* --------------------------------------------------------- estilo y drops */
const mediana = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2 }

// Estilo del jugador a partir de sus sesiones (mismo nivel ±5 que `nivel`).
// Devuelve parámetros para FarmPlan (style) con la fuente y el tamaño de muestra.
export function perfilJugador(sesiones, dataset, { nivel = null } = {}) {
  const base = { ...FarmPlan.STYLE_DEFAULT }
  const usadas = (sesiones || []).filter((s) => muertesDe(s) >= 5 && s.active >= 300 && (!nivel || !s.level || Math.abs(s.level - nivel) <= 5))
  const muertes = usadas.reduce((n, s) => n + muertesDe(s), 0)
  if (!dataset?.mobX || muertes < MIN_MUERTES_ESTILO) {
    return { ...base, source: 'default', muertes, sesiones: usadas.length }
  }
  const dps = [], loot = [], down = []
  for (const s of usadas) {
    const k = muertesDe(s), L = s.level || nivel || 1
    let hp = 0, nn = 0, n = 0
    for (const [e, c] of Object.entries(s.kills)) { const x = dataset.mobX[e]; if (x) { hp += c * x[0]; nn += c * x[4]; n += c } }
    if (!n) continue
    const peleaObs = s.combat / k
    if (peleaObs > 1) dps.push(hp / n / L / peleaObs)
    const saqueos = suma(s.corpses) + suma(s.skins) + suma(s.gather)
    if (saqueos) loot.push(s.looting / saqueos)
    // Pausas: lo que sobra por muerte después de pelear, saquear y caminar.
    const porMuerte = s.active / k, camino = nn / n / base.speed
    const neto = peleaObs + (saqueos ? s.looting / k : base.lootSec) + camino
    if (porMuerte > 0) down.push(Math.min(0.7, Math.max(0, 1 - neto / porMuerte)))
  }
  const dpsK = mediana(dps), lootSec = mediana(loot), downtime = mediana(down)
  return {
    ...base,
    dpsK: dpsK ? Math.min(6, Math.max(0.5, dpsK)) : base.dpsK,
    lootSec: lootSec ? Math.min(10, Math.max(0.5, lootSec)) : base.lootSec,
    downtime: downtime != null ? downtime : base.downtime,
    uncertainty: Math.max(0.08, 0.2 * Math.sqrt(MIN_MUERTES_ESTILO / muertes)),
    source: 'sesiones', muertes, sesiones: usadas.length,
  }
}

// Drops y monedas observados por mob, para FarmPlan (ctx.observed). Solo
// sesiones con muertes vistas directamente (PARTY_KILL, XP, cadáver visto…) y
// casi todas con su mob conocido: con "solo saqueo" los mobs sin botín no
// cuentan y la tasa saldría inflada.
export function observados(sesiones) {
  const mobs = new Map()
  let usadas = 0
  for (const s of sesiones || []) {
    if (!aptaObs(s)) continue
    usadas++
    for (const [e, k] of Object.entries(s.kills || {})) {
      let o = mobs.get(e)
      if (!o) { o = { kills: 0, corpses: 0, coins: 0, coinCorpses: 0, items: new Map(), skinOnly: new Set() }; mobs.set(e, o) }
      o.kills += k
      o.corpses += s.corpses?.[e] || 0
      // Monedas por cadáver: solo de los saqueados solos (coinsBy sale de ellos);
      // dividir por todos los cadáveres subestima con saqueo de área.
      if (s.coinCorpses) { o.coins += s.coinsBy?.[e] || 0; o.coinCorpses += s.coinCorpses[e] || 0 }
      for (const [iid, q] of Object.entries(s.items?.[e] || {})) o.items.set(Number(iid), (o.items.get(Number(iid)) || 0) + q)
      for (const [iid, q] of Object.entries(s.skinItems?.[e] || {})) {
        o.items.set(Number(iid), (o.items.get(Number(iid)) || 0) + q); o.skinOnly.add(Number(iid))
      }
    }
  }
  const key = usadas ? `obs:${(sesiones || []).filter(aptaObs).map((s) => s.id).join(',')}` : null
  return { mobs, sesiones: usadas, key }
}

/* --------------------------------------------------- ventas propias (TSM) */
// Unidades vendidas por día en subasta por ítem (ventana `dias`), para el tope.
// Nunca suma reinos: el tope de un mercado sale de las ventas de ese reino.
// `reino` = nombre del reino del mercado que miras. Se usa el reino TSM con el
// mismo nombre (sin mayúsculas ni sufijo de facción); si ninguno coincide y solo
// un reino tiene ventas, ese; si varios tienen ventas y ninguno coincide, ninguno
// (el motor usa entonces el tope por ofertas).
const reinoBase = (n) => String(n ?? '').toLowerCase().replace(/\s*-?\s*(horde|alliance|horda|alianza)\s*$/, '').replace(/\s+/g, ' ').trim()
export function ventasPorDia(tsmSnapshot, { ahora = Date.now(), dias = 30, reino = null } = {}) {
  const out = new Map(), desde = ahora / 1000 - dias * 86400
  const conVentas = (tsmSnapshot?.realms || []).filter((realm) =>
    (realm?.records || []).some((r) => r.kind === 'sale' && r.source === 'Auction' && r.time >= desde))
  const base = reino == null ? null : reinoBase(reino)
  const elegido = (base && conVentas.find((realm) => reinoBase(realm.name) === base)) || (conVentas.length === 1 ? conVentas[0] : null)
  let primera = Infinity
  for (const realm of elegido ? [elegido] : []) {
    for (const r of realm.records || []) {
      if (r.kind !== 'sale' || r.source !== 'Auction' || r.time < desde) continue
      primera = Math.min(primera, r.time)
      const a = out.get(r.itemId) || { units: 0, events: 0 }
      a.units += r.quantity; a.events += 1
      out.set(r.itemId, a)
    }
  }
  const span = Number.isFinite(primera) ? Math.max(1, Math.min(dias, (ahora / 1000 - primera) / 86400)) : dias
  for (const a of out.values()) a.perDay = a.units / span
  return out
}

/* ------------------------------------------------------------- agente */
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10)
const oro = (c) => (c == null || !Number.isFinite(c) ? null : Math.round(c / 100) / 100)  // cobre -> oro con 2 decimales
const pct = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 10)
const oro4 = (c) => (c == null || !Number.isFinite(c) ? null : Math.round(c) / 10000)  // precios: cobre exacto, en oro
const aportesDe = (top) => (top || []).map((t) => ({ itemId: t.itemId, nombre: t.name, cuotaPct: pct(t.share),
  unidadesH: r1(t.units), subastaH: r1(t.ahUnits) }))

// Evaluación del motor (FarmPlan.evaluate) en la forma del archivo del agente:
// ranking de campamentos, cada mob elegible farmeado solo y los precios usados.
function evaluacionAgente(ev, vistos = null) {
  if (!ev || !Array.isArray(ev.mobs)) return null
  // Muertes en tus sesiones de WoWForeverFarm: la única verificación en Forever
  // que tiene el plugin (los spawns y drops son de Classic 1.12).
  const visto = (npcId) => (vistos && vistos.get ? vistos.get(Number(npcId)) || 0 : 0)
  const campo = (d) => ({
    concentrado: d.concentrated ? { itemId: d.concentrated.itemId, nombre: d.concentrated.name, cuotaPct: pct(d.concentrated.share) } : null,
    vistoMuertes: (d.members || []).reduce((n, m) => n + visto(m.npcId), 0),
    zona: d.zone, tipo: d.kind === 'clear' ? 'limpiar' : d.kind === 'target' ? 'solo' : d.kind, mobs: d.names,
    oroH: oro(d.gph), muertesH: r1(d.rate), spawns: d.spawns, riesgo: d.riskLevel || null,
    mapa: d.mapX != null ? [d.mapX, d.mapY] : null,
    monedasPct: pct(d.coinsShare), subastaPct: pct(d.ahShare), vendedorPct: pct(d.vendorShare),
    aportes: aportesDe(d.top),
  })
  const precios = {}
  for (const [iid, p] of ev.items || []) {
    precios[iid] = { nombre: p.name, medianaOro: oro4(p.price), p25Oro: oro4(p.p25), p75Oro: oro4(p.p75), hoyOro: oro4(p.last),
      dias: p.days, ofertas: p.avail, delgado: p.thin, vendedorOro: oro4(p.vendor), topeUnidades: r1(p.capUnits), tope: p.capBasis }
  }
  return {
    nota: 'Oro/h estimado farmeando cada sitio 1 h, con tus precios (mediana de 14 días) y el tope de venta; drops de Classic 1.12 salvo lo observado en tus sesiones.',
    ranking: ev.ranking.map(campo),
    mobs: ev.mobs.map((d) => ({ npcId: d.npcId, nombre: d.name, nivel: d.lvl, pos: d.pos, ...campo(d) })),
    totalMobs: ev.totalMobs,
    precios,
  }
}

// Contexto para el agente (data/farmeo-agente.json). Solo agregados: sin
// nombres de personaje, reino ni ruta de posiciones.
export function exportAgente({ sesiones = [], metricas = [], estilo = null, plan = null, perfil = null, evaluacion = null, meta = null, vistos = null, ahora = new Date() } = {}) {
  const ses = metricas.slice(-50).map((m) => ({
    id: m.id, inicio: new Date(m.start * 1000).toISOString(), minutos: Math.round(m.activo / 60), pausaMin: Math.round(m.pausa / 60),
    zona: m.zona, combatePct: pct(m.combatePct), saqueoPct: pct(m.saqueoPct), restoPct: pct(m.restoPct),
    muertes: m.muertes, muertesH: r1(m.muertesH), peleaS: r1(m.peleaS), saqueoS: r1(m.saqueoS), segPorMuerte: r1(m.segPorMuerte),
    muertesJugador: m.muertesJugador, metodoMuertes: m.metodoMuertes,
    viajeMin: r1((m.viajeS || 0) / 60), muertoMin: r1((m.muertoS || 0) / 60), muertesSinMob: m.muertesSinMob || 0,
    xpH: Math.round(m.xpH || 0), botinDe: m.botinDe, tipo: m.tipo || 'mobs', pescas: m.pescas || 0, pescasH: r1(m.pescasH || 0),
    monedasOro: oro(m.monedas), valorVendedorOro: oro(m.valorVendedor), valorSubastaOro: oro(m.valorSubasta),
    oroHVendedor: oro(m.oroHVendedor), oroHSubasta: oro(m.oroHSubasta),
    prediccion: m.prediccion && {
      oroH: oro(m.prediccion.oroH), muertesH: r1(m.prediccion.muertesH),
      errorOroPct: pct(m.prediccion.errorOro), errorRitmoPct: pct(m.prediccion.errorRitmo), errorBotinPct: pct(m.prediccion.errorBotin),
    },
    mobs: m.mobs.map((x) => ({ nombre: x.nombre, npcId: x.npcId, muertes: x.muertes })),
    items: m.items.slice(0, 5).map((x) => ({ nombre: x.nombre, itemId: x.itemId, unidades: x.unidades, valorOro: oro(x.valor) })),
  }))
  return {
    schema: 1, generado: ahora.toISOString(),
    nota: 'Generado por el plugin WoW Forever (Mercado → Farmeo). Valores en oro; estimaciones con drops de Classic 1.12 salvo lo observado en tus sesiones.',
    personaje: perfil ? { nivel: perfil.nivel ?? null, clase: perfil.clase ?? null, faccion: perfil.faccion ?? null } : null,
    estilo: estilo && {
      fuente: estilo.source, muertes: estilo.muertes ?? 0, sesiones: estilo.sesiones ?? 0,
      dpsK: r1(estilo.dpsK), saqueoS: r1(estilo.lootSec), pausasPct: pct(estilo.downtime), velocidad: estilo.speed,
      incertidumbrePct: pct(estilo.uncertainty),
    },
    sesiones: ses,
    totalSesiones: sesiones.length,
    plan: plan?.best ? {
      horas: plan.best.hours, oroH: oro(plan.best.gph), rango: [oro(plan.best.low), oro(plan.best.high)],
      zonas: plan.best.zones.map((z) => z.name), viajeMin: plan.best.travelMin,
      tramos: plan.best.legs.map((l) => ({ minutos: l.minutes, zona: l.farm.zone, tipo: l.farm.kind === 'clear' ? 'limpiar' : 'solo', mobs: l.farm.names, oro: oro(l.gold),
        mapa: l.farm.mapX != null ? [l.farm.mapX, l.farm.mapY] : null })),
      aportes: plan.best.top.map((t) => ({ nombre: t.name, oro: oro(t.gold), tope: t.capBasis })),
      alternativas: (plan.alternatives || []).map((a) => ({ zonas: a.zones.map((z) => z.name), oroH: oro(a.gph) })),
      meta: meta ? { metaOro: oro(meta.target), tengoOro: oro(meta.have), faltaOro: oro(meta.falta),
        horas: r1(meta.horas), horasRango: [r1(meta.horasMin), r1(meta.horasMax)] } : null,
    } : null,
    evaluacion: evaluacionAgente(evaluacion, vistos),
  }
}

// npcId -> muertes en todas tus sesiones medidas (para «visto por ti en Forever»).
export function vistosEnSesiones(sesiones) {
  const m = new Map()
  for (const s of Array.isArray(sesiones) ? sesiones : []) {
    for (const [e, n] of Object.entries(s?.kills || {})) {
      const id = Number(e)
      if (Number.isSafeInteger(id) && id > 0 && Number.isFinite(n) && n > 0) m.set(id, (m.get(id) || 0) + n)
    }
  }
  return m
}

export const _test = { conteo, conteo2, unidades, zonaPrincipal, mediana, DAY_MS, evaluacionAgente }
