// Lógica pura de la sección Mercado: catálogo de fuentes, búsqueda, filtros,
// orden, frescura del scan, perfil del recomendador de farmeo y la geometría
// del gráfico de precios. Sin DOM: los motores de standalone/ se importan como
// CommonJS y se reutilizan tal cual (market.js, market-history.js,
// market-deals.js, market-chart.js y market-farm.js).
import HunterMarket from '../../standalone/market.js'
import HunterHistory from '../../standalone/market-history.js'
import HunterDeals from '../../standalone/market-deals.js'
import HunterChart from '../../standalone/market-chart.js'
import FarmModule from '../../standalone/market-farm.js'
import FarmPlanModule from '../../standalone/farm-plan.js'
import HunterIdentity from '../../standalone/market-identity.js'
import HunterSource from '../../standalone/market-source.js'
import HunterCompare from '../../standalone/market-compare.js'

export { HunterMarket, HunterHistory, HunterDeals, HunterChart, HunterIdentity, HunterSource, HunterCompare }
export const Farm = FarmModule
// Motor v2 (oro realizado por sesión): docs/FARMEO-ORO.md. Se configura con el
// dataset en la vista (mercado.jsx), igual que el motor heredado.
export const FarmPlan = FarmPlanModule
export const TOPES = { k2: 0.02, k5: 0.05, k10: 0.1, libre: 1e9 }

export const PAGE_SIZE = 50
// El snapshot persistido conserva solo una ventana reciente por ítem. El
// histórico tiene un presupuesto propio, independiente de la captura v2.
export const SNAPSHOT_KEEP_DAYS = 5
export const HISTORY_MAX_BYTES = 4194304 - 4096
export const EPOCH = Date.UTC(2020, 0, 1)
export const DAY_MS = 86400000

export const hoy = () => Math.floor((Date.now() - EPOCH) / DAY_MS)
export const fechaDe = (day) => (Number.isSafeInteger(day) ? new Date(EPOCH + day * DAY_MS).toISOString().slice(0, 10) : null)
// Reciente: hasta tres días inclusive; fechas futuras y sin fecha no pasan.
export const reciente = (item, dia = hoy()) =>
  item?.observedDay !== null && item?.observedDay !== undefined && item.observedDay <= dia && dia - item.observedDay <= 3
export const edadItem = (item, dia = hoy()) =>
  item?.observedDay === null || item?.observedDay === undefined ? 'sin-fecha'
    : item.observedDay > dia ? 'fecha-futura' : reciente(item, dia) ? 'reciente' : 'antiguo'

/* ------------------------------------------------------------- catálogo */
// Misma forma que standalone/market-catalog.js (la genera
// tools/build-catalogo-mercado.py): items.json da nombre es/en y dungeons.json
// da jefe, dungeon, rango de nivel y probabilidad de cada ítem del botín.
// Solo entran los ítems con fuente; `source.files` (sha256) no se puede
// calcular de forma síncrona en el plugin y nadie lo consume.
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const nombreEN = (n) => (n && (n.en || n.es)) || ''

function cmpFuente(a, b) {
  const la = a.levelMin == null ? 1 : 0, lb = b.levelMin == null ? 1 : 0
  return la - lb || (a.levelMin || 0) - (b.levelMin || 0) || cmpStr(a.dungeon, b.dungeon) || cmpStr(a.boss, b.boss)
}

export function catalogoMercado(itemsJson, dungeonsJson) {
  const items = itemsJson?.items || {}
  const salida = {}
  for (const [iid, fila] of Object.entries(items)) {
    const es = fila?.[0] || '', en = fila?.[1] || ''
    const entrada = { name: en || es, sources: [] }
    if (es && es !== en) entrada.nameEs = es
    salida[iid] = entrada
  }
  const clasicos = dungeonsJson?.clasicos || {}
  for (const mapa of Object.keys(clasicos).sort((a, b) => Number(a) - Number(b))) {
    const d = clasicos[mapa]
    const niveles = d?.niveles || {}
    for (const jefe of d?.jefes || []) {
      for (const par of jefe?.botin || []) {
        const e = salida[String(par?.[0])]
        if (!e) continue
        e.sources.push({
          dungeon: nombreEN(d?.n), location: nombreEN(d?.n),
          levelMin: niveles.min ?? null, levelMax: niveles.max ?? null,
          boss: nombreEN(jefe?.n), bossLevel: null,
          chance: par?.[1], raid: !!d?.raid,
          reference: `data/dungeons.json#${mapa}/${jefe?.npc}`,
        })
      }
    }
  }
  const ordenado = {}
  for (const iid of Object.keys(salida).sort((a, b) => Number(a) - Number(b))) {
    const e = salida[iid]
    if (!e.sources.length) continue
    e.sources.sort(cmpFuente)
    ordenado[iid] = e
  }
  return {
    schemaVersion: 1,
    source: {
      addon: 'CMaNGOS classic-db + cliente WoW Forever',
      coverage: 'Nombres de ítems del cliente WoW Forever 1.60.1.70888; botín de jefes de dungeons y raids de WoW 1.12 (CMaNGOS), aproximado para Forever. Sin los dungeons nuevos de Forever. No prueba ligadura, venta ni viabilidad en solitario.',
    },
    items: ordenado,
  }
}

// La referencia del catálogo ('data/dungeons.json#MAPA/NPC') permite recuperar
// los nombres en español de dungeon y jefe desde dungeons.json.
export function fuentesItem(entradaCatalogo, dungeonsJson) {
  return (entradaCatalogo?.sources || []).map((s) => {
    let dungeonN = null, bossN = null
    const m = /#(\d+)\/(\d+)$/.exec(s?.reference || '')
    if (m && m[2] !== 'null') {
      const d = dungeonsJson?.clasicos?.[m[1]]
      if (d?.n) dungeonN = { es: d.n.es || d.n.en || '', en: d.n.en || d.n.es || '' }
      const jefe = (d?.jefes || []).find((j) => String(j?.npc) === m[2])
      if (jefe?.n) bossN = { es: jefe.n.es || jefe.n.en || '', en: jefe.n.en || jefe.n.es || '' }
    }
    return { ...s, dungeonN, bossN }
  })
}

// Nombre visible del ítem del scan: items.json (es/en), si no el catálogo,
// si no la clave. itemId null = variante sin ID simple (no se mezcla con la base).
export function nombreItem(item, itemsJson, catalogo, lang) {
  const id = item?.itemId
  if (!Number.isSafeInteger(id) || id <= 0) return null
  const fila = itemsJson?.items?.[String(id)]
  if (fila) {
    const n = { es: fila[0] || fila[1] || '', en: fila[1] || fila[0] || '' }
    return (lang === 'en' ? n.en || n.es : n.es || n.en) || `#${id}`
  }
  const cat = catalogo?.items?.[String(id)]
  if (cat) return (lang === 'es' && cat.nameEs ? cat.nameEs : cat.name) || `#${id}`
  return `#${id}`
}

/* --------------------------------------------------------- búsqueda/filtros */
// Minúsculas + sin acentos: buscar "corazon" encuentra "Corazón".
export const normBuscador = (s) =>
  String(s ?? '').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()

// Texto de búsqueda por sourceKey: ID de ítem, nombres es/en de items.json y
// del catálogo, y jefe/dungeon/ubicación en ambos idiomas. Se calcula una vez
// por lista de ítems (useMemo en la vista).
export function textosBusqueda(items, catalogo, itemsJson, dungeonsJson) {
  const mapa = new Map()
  const itemsData = itemsJson?.items || {}
  for (const it of items || []) {
    const partes = [String(it?.sourceKey ?? '')]
    const id = it?.itemId
    if (Number.isSafeInteger(id) && id > 0) {
      const fila = itemsData[String(id)]
      if (fila) partes.push(String(fila[0] || ''), String(fila[1] || ''))
      const cat = catalogo?.items?.[String(id)]
      if (cat) {
        partes.push(String(cat.name || ''), String(cat.nameEs || ''))
        for (const s of fuentesItem(cat, dungeonsJson)) {
          partes.push(String(s.boss || ''), String(s.dungeon || ''), String(s.location || ''))
          if (s.bossN) partes.push(s.bossN.es, s.bossN.en)
          if (s.dungeonN) partes.push(s.dungeonN.es, s.dungeonN.en)
        }
      }
    }
    mapa.set(it?.sourceKey, normBuscador(partes.join(' ')))
  }
  return mapa
}

// "Con fuente": alguna fuente documentada del catálogo cubre el nivel del
// personaje (rango de grupo, no requisito de equipo — igual que la app vieja).
export function fuenteEnRango(item, nivel, catalogo) {
  const id = item?.itemId
  if (!Number.isSafeInteger(id) || id <= 0) return false
  const fuentes = catalogo?.items?.[String(id)]?.sources || []
  return fuentes.some((s) => s.levelMin !== null && s.levelMax !== null && s.levelMin <= nivel && nivel <= s.levelMax)
}

export function filtrarMercado(items, opciones = {}) {
  const {
    textos, q = '', recientes: soloRecientes = false, conFuente = false, nivel = 0,
    catalogo = null, farmable = null, oferta = null, dia = hoy(),
  } = opciones
  const consulta = normBuscador(q)
  return (items || []).filter((it) => {
    if (soloRecientes && !reciente(it, dia)) return false
    if (conFuente && !fuenteEnRango(it, nivel, catalogo)) return false
    if (farmable && !farmable(it)) return false
    if (oferta && !oferta(it)) return false
    if (consulta) {
      const hay = textos?.get(it?.sourceKey)
      if (!hay || !hay.includes(consulta)) return false
    }
    return true
  })
}

const cmpItem = (a, b) => cmpStr(String(a?.sourceKey ?? ''), String(b?.sourceKey ?? ''))

// orden: 'nombre' | 'precio' | 'ofertas' | 'roi' | 'gph'.
// `metrica(item)` y `oferta(item)` son callbacks de la vista (Farm.itemMetrics /
// HunterDeals.dealInfo con su caché); sin ellos esas opciones ordenan igual que precio.
export function ordenarMercado(items, orden, opciones = {}) {
  const { lang = 'es', itemsJson = null, catalogo = null, metrica = null, oferta = null } = opciones
  const lista = [...(items || [])]
  if (orden === 'nombre') {
    lista.sort((a, b) => cmpStr(nombreItem(a, itemsJson, catalogo, lang) || String(a?.sourceKey ?? ''),
      nombreItem(b, itemsJson, catalogo, lang) || String(b?.sourceKey ?? '')) || cmpItem(a, b))
  } else if (orden === 'ofertas' && oferta) {
    lista.sort((a, b) => (oferta(b)?.score ?? -Infinity) - (oferta(a)?.score ?? -Infinity) || cmpItem(a, b))
  } else if (orden === 'roi' && metrica) {
    lista.sort((a, b) => ((metrica(b)?.farmable ? metrica(b).roi ?? -999 : -999) - (metrica(a)?.farmable ? metrica(a).roi ?? -999 : -999)) || cmpItem(a, b))
  } else if (orden === 'gph' && metrica) {
    lista.sort((a, b) => ((metrica(b)?.farmable ? metrica(b).gph : -999) - (metrica(a)?.farmable ? metrica(a).gph : -999)) || cmpItem(a, b))
  } else {
    lista.sort((a, b) => (b?.unitPriceCopper ?? 0) - (a?.unitPriceCopper ?? 0) || cmpItem(a, b))
  }
  return lista
}

/* --------------------------------------------------------------- frescura */
// Estado de frescura del scan: fecha de importación, día más reciente
// observado en el realm elegido y aviso si tiene más de 3 días.
export function frescura(snapshot, realmName, dia = hoy()) {
  if (!snapshot) return null
  const realm = snapshot.realms?.find((r) => r.name === realmName)
  const items = realm?.items || []
  let maxDay = null
  for (const i of items) if (i.observedDay != null && (maxDay === null || i.observedDay > maxDay)) maxDay = i.observedDay
  return {
    importedAt: snapshot.importedAt ?? null,
    items: items.length,
    maxDay,
    fechaMax: fechaDe(maxDay),
    diasDesde: maxDay === null ? null : dia - maxDay,
    aviso: maxDay !== null && dia - maxDay > 3,
  }
}

/* ------------------------------------------------------- snapshot / store */
// Vista de trabajo: el snapshot guardado (ventana de 5 días) fusionado con la
// serie completa del store de historial, igual que restore() de market-ui.js.
export function snapshotVisible(mercado, historial) {
  const s = mercado?.snapshot
  if (!s) return null
  const st = historial?.store
  if (!st) return s
  if (st.v === 2) return s.schemaVersion === 2 ? HunterHistory.applyStoreV2(s, st) : s
  return HunterHistory.applyStore(s, st)
}

// Plan de commit de una importación (puro): snapshot recortado + store
// acumulado. El guardado lo hace la vista con almacen.market/history.
// `snapshotActual` debe ser el snapshot visible (applyStore), como en
// commitSnapshot de market-ui.js donde `snapshot` ya lleva la serie completa.
export function snapshotSinIdentificar(raw) {
  if (!raw) return null
  if (raw.schemaVersion === 2) return raw
  // Reuse the legacy scope, never promote its old observations to any known pool.
  const legacy = HunterHistory.migrateStoreV1(HunterHistory.emptyStore(), 'local:legacy')
  const identity = Object.values(legacy.scopes)[0].identity
  return { ...raw, schemaVersion:2,
    observation:{scope:'legacy',fromDay:null,toDay:null,capturedAt:raw.importedAt},
    realms:raw.realms.map(r=>({...r,identity:structuredClone(identity)})) }
}
// La identidad deja de distinguir pools cuando todo quedó UNKNOWN: en ese caso
// el nombre del reino es una etiqueta del cliente, no evidencia de otro pool.
const identidadOpaca = (r) => {
  const id = r?.identity
  return !!id && id.game === 'UNKNOWN' && id.region === 'UNKNOWN' &&
    id.ruleset === 'UNKNOWN' && id.auctionPool === 'UNKNOWN' && id.postingChannel === null
}

// Mueve el acumulado de un reino a otro nombre dentro del store v2. El store
// indexa por nombre, así que sin esto un reino renombrado por el cliente parte
// el histórico en dos claves y pierde la serie continua.
function renombrarReinoStore(store, viejo, nuevo) {
  if (!store || store.v !== 2 || viejo === nuevo || !store.scopes) return store
  const out = structuredClone(store)
  for (const sk of Object.keys(out.scopes)) {
    const realms = out.scopes[sk]?.realms
    if (!realms || !realms[viejo]) continue
    const origen = realms[viejo]
    const destino = realms[nuevo]
    if (!destino) { realms[nuevo] = origen; delete realms[viejo]; continue }
    for (const src of Object.keys(origen.items || {})) {
      const previas = destino.items[src]
      destino.items[src] = previas ? HunterHistory.mergeRows(previas, origen.items[src]) : origen.items[src]
    }
    delete realms[viejo]
  }
  return HunterHistory.validStoreV2(out) ? out : store
}

export function planImportacion(raw, { snapshotActual = null, historyStore = null } = {}) {
  const v2 = raw?.schemaVersion === 2 || historyStore?.v === 2 || snapshotActual?.schemaVersion === 2
  if (v2) {
    raw = snapshotSinIdentificar(raw)
    snapshotActual = snapshotSinIdentificar(snapshotActual)
    // Replace only this exact source scope, preserving other pools with the
    // same raw realm label. History remains separate from current observations.
    const key = r => JSON.stringify([HunterIdentity.identityKey(r.identity), r.name])
    const byScope = new Map((snapshotActual?.schemaVersion === 2 ? snapshotActual.realms : []).map(r => [key(r), r]))
    for (const r of raw.realms) byScope.set(key(r), r)
    // Auctionator rotula el mismo servidor según la facción del personaje
    // activo ("PvP" vs "PvP Horde"). Si la identidad es opaca, el nombre no
    // puede separar pools: se colapsa a una sola entrada por identidad (la del
    // scan nuevo) para no duplicar ítems ni reventar el tope del snapshot.
    const delScan = new Set((raw.realms || []).map(key))
    const realms = []
    const porIdentidad = new Map()
    const renombres = []
    for (const r of [...byScope.values()]) {
      const ik = HunterIdentity.identityKey(r.identity)
      const i = porIdentidad.get(ik)
      if (i === undefined) { porIdentidad.set(ik, realms.length); realms.push(r); continue }
      const previo = realms[i]
      if (previo.name === r.name) { realms[i] = r; continue }
      if (!identidadOpaca(r) || !identidadOpaca(previo)) { realms.push(r); continue }
      const rNuevo = delScan.has(key(r)), pNuevo = delScan.has(key(previo))
      if (rNuevo && !pNuevo) { renombres.push([previo.name, r.name]); realms[i] = r; continue }
      if (!rNuevo && pNuevo) continue
      realms.push(r)
    }
    const combined = { ...raw, realms }
    if (renombres.length) {
      const avisos = renombres.map(([v, n]) =>
        `Reino unificado: «${v}» y «${n}» son el mismo pool sin identidad verificada; se conserva «${n}» y el histórico queda en una sola serie.`)
      combined.warnings = [...(Array.isArray(raw.warnings) ? raw.warnings : []), ...avisos]
    }
    const snapshot = HunterHistory.trimSnapshotHistory(combined, SNAPSHOT_KEEP_DAYS)
    let base = historyStore && historyStore.v === 2
      ? historyStore
      : (historyStore
        ? HunterHistory.migrateStoreV1(historyStore, 'local:legacy')
        : (snapshotActual && snapshotActual.schemaVersion === 2
          ? HunterHistory.storeV2FromSnapshot(snapshotActual)
          : HunterHistory.emptyStoreV2()))
    for (const [v, n] of renombres) base = renombrarReinoStore(base, v, n)
    const merged = HunterHistory.storeV2Merge(base, raw)
    const store = HunterHistory.fitStoreV2(merged, HISTORY_MAX_BYTES)
    if (Object.keys(merged.scopes).length && !Object.keys(store.scopes).length) {
      throw new Error('El histórico no cabe en su presupuesto ni conservando solo el último día. Se conservan los datos anteriores.')
    }
    return { snapshot, store }
  }
  const snapshot = HunterHistory.trimSnapshotHistory(raw, SNAPSHOT_KEEP_DAYS)
  const base = historyStore || (snapshotActual ? HunterHistory.storeFromSnapshot(snapshotActual) : HunterHistory.emptyStore())
  const store = HunterHistory.fitStore(HunterHistory.storeMerge(base, raw), HISTORY_MAX_BYTES)
  return { snapshot, store }
}

// Misma validación que validSnapshot de market-ui.js antes de persistir.
const histValido = (h) =>
  Number.isSafeInteger(h.day) && h.day >= 0 && h.day <= 100000 &&
  Number.isSafeInteger(h.low) && h.low > 0 && Number.isSafeInteger(h.high) && h.high >= h.low &&
  (h.available === null || (Number.isSafeInteger(h.available) && h.available >= 0))
const itemValido = (i) =>
  typeof i.sourceKey === 'string' && (i.itemId === null || (Number.isSafeInteger(i.itemId) && i.itemId > 0)) &&
  Number.isSafeInteger(i.unitPriceCopper) && i.unitPriceCopper > 0 &&
  (i.observedDay === null || (Number.isSafeInteger(i.observedDay) && i.observedDay >= 0 && i.observedDay <= 100000)) &&
  Array.isArray(i.history) && i.history.length <= 10000 && i.history.every(histValido)
const realmValido = (r) =>
  typeof r.name === 'string' && Array.isArray(r.items) && r.items.length <= 100000 && r.items.every(itemValido)

export function snapshotValido(s) {
  if (s?.schemaVersion === 2) {
    const o = s.observation
    const realmOk = r => typeof r.name === 'string' && Array.isArray(r.items) &&
      HunterIdentity.validateIdentity(r.identity).ok &&
      r.items.length <= 100000 && r.items.every(itemValido)
    return s.sourceVersion === 8 && typeof s.importedAt === 'string' && Number.isFinite(Date.parse(s.importedAt)) &&
      ((o?.scope === 'fresh-scan' && Number.isSafeInteger(o.fromDay) && Number.isSafeInteger(o.toDay) && o.toDay >= o.fromDay) ||
       (o?.scope === 'legacy' && o.fromDay === null && o.toDay === null)) &&
      typeof o.capturedAt === 'string' && Number.isFinite(Date.parse(o.capturedAt)) &&
      Array.isArray(s.warnings) && s.warnings.length <= 1000 && s.warnings.every(w => typeof w === 'string') &&
      Array.isArray(s.realms) && s.realms.length > 0 && s.realms.length <= 100 && s.realms.every(realmOk)
  }
  return s?.schemaVersion === 1 && s.sourceVersion === 8 &&
    typeof s.importedAt === 'string' && Number.isFinite(Date.parse(s.importedAt)) &&
    Array.isArray(s.warnings) && s.warnings.length <= 1000 && s.warnings.every((w) => typeof w === 'string') &&
    Array.isArray(s.realms) && s.realms.length > 0 && s.realms.length <= 100 && s.realms.every(realmValido)
}

// Parser validado de fuente aislada. Nunca acepta el export crudo de
// Auctionator: exige identidad acreditada y observación fresca explícita.
export const parsearFuenteAislada = (text, adapterVerified = false) => HunterSource.parseSeparateSourceObservations(text, adapterVerified)

// Comparación pura. Bloquea procedencia desconocida antes de mirar precios.
export const compararPools = (pools, options) => HunterCompare.compare(pools, options)

// Días y entradas del store acumulado (para el pie de estado del historial).
export function infoHistorial(store) {
  if (!store) return { days: 0, entries: 0 }
  if (store.v === 2) {
    if (!HunterHistory.validStoreV2(store)) return { days: 0, entries: 0 }
    const seen = new Set(); let entries = 0
    for (const scope of Object.values(store.scopes)) {
      for (const realm of Object.values(scope.realms)) {
        for (const rows of Object.values(realm.items)) for (const r of rows) { entries++; seen.add(r[0]) }
      }
    }
    return { days: seen.size, entries }
  }
  if (!HunterHistory.validStore(store)) return { days: 0, entries: 0 }
  const seen = new Set()
  let entries = 0
  for (const rn of Object.keys(store.realms || {})) {
    for (const k of Object.keys(store.realms[rn]?.items || {})) {
      for (const r of store.realms[rn].items[k]) { entries++; seen.add(r[0]) }
    }
  }
  return { days: seen.size, entries }
}

/* ------------------------------------------------------- recomendador farm */
// market-farm.js entiende tres clases con equipo útil (warrior/hunter/shaman)
// y facción alliance/horde. El resto de clases puntúa igual pero sin bonus de
// equipo útil (usefulGear devuelve false para cls desconocida); la interfaz lo
// aclara con la nota "sin ajuste por equipo de clase".
const CLASE_MOTOR = { 1: 'warrior', 3: 'hunter', 7: 'shaman' }
export function perfilMotor(perfil, hubZones = '') {
  return {
    level: perfil?.nivel || 12,
    cls: CLASE_MOTOR[perfil?.clase] || 'otro',
    fac: perfil?.faccion === 'alianza' ? 'alliance' : 'horde',
    spec: '', pref: 'any', hubZones: hubZones || '',
  }
}

// Texto de zonas para el "hub" del motor (acelera el factor de viaje y marca
// las zonas de tu ruta). Primero la banda de nivel de la guía curada si la
// clase tiene una (routes del primer reino disponible); si no, las zonas de
// zonas.json cuyo rango de niveles contiene el nivel del perfil y que no son
// de la facción contraria.
export function hubZonesDe(nivel, rutas, zonasJson, faccion) {
  if (rutas && typeof rutas === 'object') {
    for (const bandas of Object.values(rutas)) {
      if (!Array.isArray(bandas)) continue
      const b = bandas.find((x) => x && nivel >= x.min && nivel <= x.max)
      if (b?.zones) return b.zones
    }
  }
  const enemiga = faccion === 'alianza' ? 'horda' : 'alianza'
  const nombres = []
  for (const z of Object.values(zonasJson?.zonas || {})) {
    const nv = z?.niveles
    if (!nv || nv.min == null || nv.max == null || nivel < nv.min || nivel > nv.max) continue
    if (z.faccion === enemiga) continue
    const n = nombreEN(z.n)
    if (n) nombres.push(n)
  }
  return nombres.join(' / ')
}

// Recolección del motor: piel = Desuello (393), hierbas = Herboristería (182),
// minería = Minería (186). Pesca (356) no cuenta como farmeo en el motor.
export function ajustesBase(perfil) {
  const p = new Set(perfil?.profesiones || [])
  return {
    comp: 'auto', zoneComp: {}, gph: 5,
    prof: { skin: p.has(393), herb: p.has(182), mine: p.has(186) },
    group: false, pvp: true, n: 5, session: 2,
    campMode: 'single', campWeights: null,
    horas: 2, tope: 'k5', miEstilo: true, montura: false,
    meta: 0, tengo: 0,
  }
}

const COMP_ORDER = ['low', 'med', 'high']
// Mismas reglas de normalización que normalizeSettings de market-farm.js.
export function normalizarAjustes(s) {
  s = s || {}
  const zc = {}
  if (s.zoneComp && typeof s.zoneComp === 'object') {
    for (const k of Object.keys(s.zoneComp)) if (COMP_ORDER.includes(s.zoneComp[k])) zc[k] = s.zoneComp[k]
  }
  const p = s.prof || {}, n = Number(s.n)
  const campMode = s.campMode === 'rotation' ? 'rotation' : 'single'
  const weights = Array.isArray(s.campWeights) ? s.campWeights : []
  const valid = weights.length === 3 && weights.every(w => Number.isFinite(w) && w >= 0)
    && weights.reduce((sum, w) => sum + w, 0) <= 1 + 1e-9
  return {
    comp: COMP_ORDER.includes(s.comp) ? s.comp : 'auto', zoneComp: zc,
    gph: Number.isFinite(+s.gph) && +s.gph > 0 ? Math.min(1000, +s.gph) : 5,
    prof: { skin: !!p.skin, herb: !!p.herb, mine: !!p.mine },
    group: !!s.group, pvp: s.pvp !== false,
    n: Number.isInteger(n) && n >= 3 && n <= 8 ? n : 5,
    session: [1, 2, 4].includes(+s.session) ? +s.session : 2,
    // H2: rotación sólo con pesos de tiempo declarados (canonicalizado en el motor).
    campMode, campWeights: valid ? [...weights] : campMode === 'rotation' ? [0.5, 0.3, 0.2] : null,
    // Motor v2: horas de sesión, tope de venta, estilo calibrado y montura.
    horas: [1, 2, 3, 4].includes(+s.horas) ? +s.horas : [1, 2, 4].includes(+s.session) ? +s.session : 2,
    tope: Object.hasOwn(TOPES, s.tope) ? s.tope : 'k5',
    miEstilo: s.miEstilo !== false,
    montura: !!s.montura,
    // Meta de oro y oro actual, en oro entero (0 = sin meta). Los escribe el jugador.
    meta: oroEntero(s.meta), tengo: oroEntero(s.tengo),
  }
}
function oroEntero(v) {
  const n = Math.floor(Number(v))
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 1000000) : 0
}

// Contexto del motor v2 a partir de lo que ya tiene la vista. `marketKey`
// identifica el snapshot (importación + reino) para las cachés del motor.
export function contextoFarmeo({ perfil, settings, items, ventas = null, estilo = null, observados = null, marketKey = '' }) {
  const market = FarmPlan.marketModel(items || [])
  const kappa = TOPES[settings?.tope] ?? TOPES.k5
  // «Sin tope (optimista)» quita también el tope por tus ventas TSM.
  const caps = FarmPlan.sellCaps(market, settings?.tope === 'libre' ? null : ventas, { kappa })
  const base = estilo && settings?.miEstilo !== false && estilo.source === 'sesiones' ? estilo : { ...FarmPlan.STYLE_DEFAULT }
  const style = { ...base, ...(settings?.montura ? { speed: 14 } : {}) }
  const observed = settings?.miEstilo !== false && observados?.sesiones ? observados : null
  const profile = {
    level: perfil?.nivel || 12, fac: perfil?.faccion === 'alianza' ? 'alliance' : 'horde',
    cls: CLASE_MOTOR[perfil?.clase] || 'otro', prof: { skin: !!settings?.prof?.skin }, group: !!settings?.group,
  }
  const ajustes = { pvp: settings?.pvp !== false, zoneComp: settings?.zoneComp || {} }
  // Los topes por ventas propias (TSM) cambian sin cambiar el escaneo: van en la
  // clave para que el índice por ítem (columna Farmeo) no quede con el tope viejo.
  const ventasKey = [...caps].filter(([, c]) => c.basis === 'ventas-propias').map(([i, c]) => `${i}:${Math.round(c.units * 1000)}`).join(',')
  const cacheKey = JSON.stringify([marketKey, (items || []).length, profile, ajustes, kappa, style, observed?.key || null, ventasKey])
  return { profile, market, caps, style, observed, settings: ajustes, kappa, cacheKey }
}

// Ajustes efectivos: defaults del personaje + lo guardado por el usuario en
// ctx.storage ('farm-settings'), normalizado.
export function ajustesFarm(perfil, guardado) {
  const base = ajustesBase(perfil)
  const g = guardado && typeof guardado === 'object' ? guardado : {}
  return normalizarAjustes({
    ...base, ...g,
    prof: { ...base.prof, ...(g.prof || {}) },
    zoneComp: { ...(base.zoneComp || {}), ...(g.zoneComp || {}) },
  })
}

/* ------------------------------------------------------------ gráfico SVG */
// Misma geometría que standalone/market-chart.js (points, escalas, ticks),
// devuelta como datos para pintarla con elementos React y colores C.*.
function puntoDe(h) {
  let day, low
  if (Array.isArray(h)) { if (h.length < 2) return null; day = h[0]; low = h[1] }
  else if (h && typeof h === 'object') { day = h.day; low = h.low }
  else return null
  if (!Number.isSafeInteger(day) || !Number.isSafeInteger(low) || low <= 0) return null
  return { day, low }
}

function puntosDe(history) {
  const porDia = new Map()
  for (const h of Array.isArray(history) ? history : []) {
    const p = puntoDe(h)
    if (!p) continue
    const prev = porDia.get(p.day)
    if (prev === undefined || p.low > prev) porDia.set(p.day, p.low)
  }
  return [...porDia.keys()].sort((a, b) => a - b).map((d) => ({ day: d, low: porDia.get(d) }))
}

const pad2 = (n) => (n < 10 ? '0' : '') + n
export const fmtDia = (day) => {
  const d = new Date(EPOCH + day * DAY_MS)
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
}
// Cobre compacto para ejes: 156000 -> "15.6g", 45200 -> "4.5g", 8500 -> "85s".
export const fmtCobre = (c) => {
  c = Math.round(c)
  if (c >= 10000) {
    const g = c / 10000
    return `${g >= 100 ? Math.round(g) : Math.round(g * 10) / 10}g`
  }
  if (c >= 100) return `${Math.round(c / 100)}s`
  return `${c}c`
}
function pasoLindo(raw) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1
  const p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}
function medianaDe(vals) {
  const s = vals.slice().sort((a, b) => a - b)
  const n = s.length
  return n % 2 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2)
}
const f1 = (v) => Math.round(v * 10) / 10

// Devuelve null sin puntos; con ejes devuelve ticks listos para <text>.
export function geometriaGrafico(history, opciones = {}) {
  const pts = puntosDe(history)
  if (!pts.length) return null
  const W = opciones.w || 720, H = opciones.h || 210
  const P = opciones.pad || { l: 52, r: 12, t: 12, b: 30 }
  const axes = opciones.axes !== false
  const current = opciones.current != null && Number.isFinite(opciones.current) && opciones.current > 0 ? opciones.current : null
  const n = pts.length
  const lows = pts.map((p) => p.low)
  let lo = Math.min(...lows), hi = Math.max(...lows)
  // El precio actual no estira el dominio: solo se dibuja si cae en rango.
  if (hi <= lo) { const pad = Math.max(1, Math.round(lo * 0.05)); lo -= pad; hi += pad }
  const x0 = P.l, x1 = W - P.r, y0 = P.t, y1 = H - P.b
  const plotW = Math.max(1, x1 - x0), plotH = Math.max(1, y1 - y0)
  const dMin = pts[0].day, dMax = pts[n - 1].day
  const sx = (d) => (dMax > dMin ? x0 + ((d - dMin) / (dMax - dMin)) * plotW : x0 + plotW / 2)
  const sy = (v) => y1 - ((v - lo) / (hi - lo)) * plotH
  const coords = pts.map((p) => `${f1(sx(p.day))},${f1(sy(p.low))}`)
  const firstX = coords[0].split(',')[0], lastX = coords[n - 1].split(',')[0]
  const linea = `M${coords.join(' L')}`
  const area = `${linea} L${lastX},${y1} L${firstX},${y1} Z`
  const med = medianaDe(lows)
  const mediana = med > lo && med < hi ? f1(sy(med)) : null
  const fin = { x: f1(sx(dMax)), y: f1(sy(pts[n - 1].low)) }
  // Precio actual solo si cae dentro del dominio y hay más de un día.
  const actual = current != null && current >= lo && current <= hi && dMax > dMin
    ? { x: f1(sx(dMax)), y: f1(sy(current)) } : null
  const out = { W, H, x0, x1, y0, y1, area, linea, mediana, fin, actual }
  if (axes) {
    const paso = pasoLindo((hi - lo) / 4)
    const primero = Math.ceil(lo / paso) * paso
    const ticksY = []
    const vistos = {}
    for (let k = 0; k < 6; k++) {
      const v = Math.round((primero + k * paso) * 100) / 100
      if (v > hi || vistos[v]) break
      vistos[v] = true
      ticksY.push({ v, y: f1(sy(v)), label: fmtCobre(v) })
    }
    const ticksX = []
    const vistosX = {}
    for (let i = 0; i <= 4; i++) {
      const idx = Math.round((i * (n - 1)) / 4)
      if (vistosX[idx]) continue
      vistosX[idx] = true
      ticksX.push({ x: f1(sx(pts[idx].day)), label: fmtDia(pts[idx].day) })
    }
    out.ticksY = ticksY
    out.ticksX = ticksX
  }
  return out
}

/* ------------------------------------------------------ fuentes dropData */
// drop-data.js (generado, no se edita): items[id] = [nombre, calidad, clase,
// subclase, invType, reqLevel, itemLevel, bonding, allowableClass,
// sellPriceCopper, sources[[m|o|s|p, id, chancePct, min, max]], world?].
// 'o' resuelve contra objects, 'm'/'s'/'p' contra mobs (igual que el motor:
// 's' = desuello, 'p' = pillaje). Devuelve nombres y zonas ya resueltos; los
// ids sin fila en el dataset se conservan sin inventar nombre.
function paresZona(main, otros) {
  const zm = {}
  for (const p of otros || []) if (p && p[0]) zm[p[0]] = p[1]
  if (main && main[0]) zm[main[0]] = main[1]
  return Object.entries(zm)
}

export function fuentesDropData(itemId, dd) {
  const it = dd?.items?.[String(itemId ?? '')]
  if (!it) return []
  const out = []
  for (const s of it[10] || []) {
    const [t, rid, chance, minC, maxC] = s || []
    const sid = String(rid ?? '')
    const base = { tipo: t, id: sid, chance: chance ?? null, minC: minC ?? null, maxC: maxC ?? null, nombre: null, zonas: [] }
    if (t === 'o') {
      const o = dd.objects?.[sid]
      if (o) {
        base.nombre = o[0] || null
        base.objKind = o[1] || null
        for (const [zk, sp] of paresZona([o[2], o[3]], o[5])) {
          const z = dd.zones?.[zk]
          if (z) base.zonas.push({ key: zk, nombre: z[0] || zk, faccion: z[2] || null, nivelMin: z[3] ?? null, nivelMax: z[4] ?? null, spawns: sp ?? null })
        }
      }
    } else {
      const m = dd.mobs?.[sid]
      if (m) {
        base.nombre = m[0] || null
        base.nivelMin = m[1] ?? null
        base.nivelMax = m[2] ?? null
        base.rank = m[3] || null
        base.kind = t === 's' ? 'skin' : t === 'p' ? 'pick' : 'mob'
        for (const [zk, sp] of paresZona([m[4], m[5]], m[8])) {
          const z = dd.zones?.[zk]
          if (z) base.zonas.push({ key: zk, nombre: z[0] || zk, faccion: z[2] || null, nivelMin: z[3] ?? null, nivelMax: z[4] ?? null, spawns: sp ?? null })
        }
      }
    }
    out.push(base)
  }
  return out
}
