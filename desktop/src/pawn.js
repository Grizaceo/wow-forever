// pawn.js — escala Pawn: catálogo de escalas (PawnCommon de SavedVariables) y
// captura del addon WoWForeverBridge (WoWForeverBridgeDB.pawn). Módulo PURO
// (sin DOM, sin SDK): parsea el Lua de SavedVariables con el lector restringido
// compartido (HunterMarket.parseSavedVariables), nunca evalúa nada.
//
// Hechos verificados contra el addon instalado (Pawn 2.14.3):
//   Interface/AddOns/Pawn/Pawn.lua
//     - PawnGetAllStatValues(ScaleName) -> PawnCommon.Scales[ScaleName].Values
//       (Pawn.lua:5146-5162); falla con VgerCore.Fail si no está inicializado.
//     - PawnGetInventoryItemValues(UnitName) -> TotalValues, Count, ItemLevel
//       (Pawn.lua:2028-2101); TotalValues = {{ScaleName, Value, 0, LocalizedName}}.
//     - PawnGetAllScalesEx() -> {Name, LocalizedName, Header, IsVisible, IsProvider}
//       (Pawn.lua:5227-5258); PawnGetDefaultScale(ClassID, SpecID, NoStats)
//       (Pawn.lua:834-857).
//     - NO existe API «escala activa»: se infiere por ClassID/SpecID.
//     - PawnUnitializePlugins() pone Scale.Values = nil en escalas de proveedor
//       antes de serializar (Pawn.lua:5665-5671): por eso Pawn.lua (cuenta) no
//       trae pesos; en runtime sí existen (PawnAddPluginScale, Pawn.lua:5779).
//
// Persistencia (ctx.storage):
//   'pawn'            = captura normalizada + erro (ver normalizarEstadoPawn)
//   'pawn-catalogo'   = { v:1, versao, escalas } leído de SavedVariables/Pawn.lua
import HunterMarket from '../../standalone/market.js'

export const CLAVE = 'pawn'
export const CLAVE_CATALOGO = 'pawn-catalogo'
export const VERSION = 1
export const MAX_PESOS = 40
export const MAX_EQUIPE = 8
export const MAX_ILVL = 1000
export const MAX_ESCALAS = 200
const MAX_CAMPO = 200
const MAX_STAT = 100
const MAX_ERRO = 4096
const MAX_BYTES = 8 * 1024 * 1024

const cortar = (v, max = MAX_CAMPO) => String(v ?? '').slice(0, max)
const intOuNull = (v) => {
  const n = typeof v === 'number' ? v : NaN
  return Number.isInteger(n) ? n : null
}
const textoOuNull = (v, max = MAX_CAMPO) =>
  (typeof v === 'string' && v ? v.slice(0, max) : null)

// Pesos de una escala: solo claves string con valores numéricos finitos.
// Devuelve { pesos, truncado } o null si la entrada no es tabla. Las sub-tablas
// (Values puede traer estructuras anidadas) se descartan, nunca se inventan.
function extrairPesos(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const pesos = {}
  let truncado = false
  let n = 0
  for (const k of Object.keys(v)) {
    const val = v[k]
    if (typeof k !== 'string' || !k || k.length > MAX_STAT) continue
    if (typeof val !== 'number' || !Number.isFinite(val)) continue
    if (n >= MAX_PESOS) { truncado = true; break }
    pesos[k] = val
    n++
  }
  return { pesos, truncado }
}

const temPesos = (e) => !!e && typeof e.pesos === 'object' && e.pesos !== null &&
  Object.keys(e.pesos).length > 0

// ---------- catálogo: PawnCommon de SavedVariables/Pawn.lua ----------

// parsePawnScales(entrada) -> { versao, escalas, erros }
// entrada: texto Lua o Uint8Array del archivo SavedVariables/Pawn.lua.
// Cada escala: { nome, localized, provider, classID, specID, role, temPesos, pesos? }.
// `nome` es la clave interna (p. ej. '"Classic":HUNTER1', con comillas literales,
// igual que la devuelve PawnGetAllScalesEx). Nunca incluye PerCharacterOptions:
// ahí viven nombres de personaje y no se leen.
export function parsePawnScales(entrada) {
  const erros = []
  const vazio = { versao: null, escalas: [], erros }
  let bytes = null
  if (typeof entrada === 'string') {
    if (!entrada.trim() || entrada.length > MAX_BYTES) { erros.push('vazio'); return vazio }
    bytes = new TextEncoder().encode(entrada)
  } else if (entrada instanceof Uint8Array) {
    if (!entrada.length || entrada.length > MAX_BYTES) { erros.push('vazio'); return vazio }
    bytes = entrada
  } else {
    erros.push('vazio')
    return vazio
  }
  let db
  try {
    db = HunterMarket.parseSavedVariables(bytes, 'PawnCommon')
  } catch (e) {
    erros.push(cortar(e?.message || e, 200))
    return vazio
  }
  const versao = typeof db.LastVersion === 'number' && Number.isFinite(db.LastVersion) ? db.LastVersion : null
  const scales = db.Scales
  if (!scales || typeof scales !== 'object' || Array.isArray(scales)) {
    erros.push('sin-escalas')
    return { versao, escalas: [], erros }
  }
  const escalas = []
  for (const nome of Object.keys(scales)) {
    const s = scales[nome]
    if (!s || typeof s !== 'object' || Array.isArray(s)) continue
    const ext = extrairPesos(s.Values)
    const pesos = ext && Object.keys(ext.pesos).length ? ext.pesos : null
    escalas.push({
      nome: cortar(nome),
      localized: textoOuNull(s.LocalizedName) || cortar(nome),
      provider: textoOuNull(s.Provider),
      classID: intOuNull(s.ClassID),
      specID: intOuNull(s.SpecID),
      role: textoOuNull(s.Role, 50),
      temPesos: !!pesos,
      ...(pesos ? { pesos } : {}),
    })
    if (escalas.length >= MAX_ESCALAS) break
  }
  escalas.sort((a, b) => (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0))
  return { versao, escalas, erros }
}

function normalizarCatalogo(c) {
  if (!c || typeof c !== 'object' || c.v !== VERSION) return null
  if (!Array.isArray(c.escalas)) return null
  const escalas = []
  for (const e of c.escalas.slice(0, MAX_ESCALAS)) {
    if (!e || typeof e !== 'object' || typeof e.nome !== 'string' || !e.nome) continue
    const ext = e.pesos && typeof e.pesos === 'object' ? extrairPesos(e.pesos) : null
    const pesos = ext && Object.keys(ext.pesos).length ? ext.pesos : null
    escalas.push({
      nome: e.nome.slice(0, MAX_CAMPO),
      localized: textoOuNull(e.localized) || e.nome.slice(0, MAX_CAMPO),
      provider: textoOuNull(e.provider),
      classID: intOuNull(e.classID),
      specID: intOuNull(e.specID),
      role: textoOuNull(e.role, 50),
      temPesos: e.temPesos === true || !!pesos,
      ...(pesos ? { pesos } : {}),
    })
  }
  return {
    v: VERSION,
    versao: typeof c.versao === 'number' && Number.isFinite(c.versao) ? c.versao : null,
    escalas,
  }
}

export async function lerCatalogoPawn(ctx) {
  try {
    return normalizarCatalogo(await ctx.storage.get(CLAVE_CATALOGO, null))
  } catch {
    return null
  }
}

// sincronizarCatalogoPawn(ctx, bytes) — bytes del Pawn.lua de cuenta leído de la
// carpeta SavedVariables concedida (mismo directorio que WoWForeverBridge.lua).
export async function sincronizarCatalogoPawn(ctx, bytes) {
  const r = parsePawnScales(bytes)
  if (!r.escalas.length) return { status: 'sin-cambios' }
  await ctx.storage.set(CLAVE_CATALOGO, {
    v: VERSION, versao: r.versao, escalas: r.escalas,
  })
  return { status: 'ok', catalogo: await lerCatalogoPawn(ctx) }
}

// ---------- captura: WoWForeverBridgeDB.pawn (escrita por Pawn.lua del addon) ----------

// parsePawnCaptura(valor) -> captura normalizada o null.
// Forma esperada (la escribe addon/WoWForeverBridge/Pawn.lua):
//   { v:1, escala, localized, provider, classID, specID, pesos:{stat:n},
//     equipo:{valores:[{escala,valor,localized}], ilvl},
//     candidatas:[{nome,localized,provider,classID,specID,role}],
//     capturado, origem:'addon', truncado }
// Entrada inválida devuelve null, nunca basura.
export function parsePawnCaptura(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  if (v.v !== VERSION) return null
  if (v.origem !== 'addon') return null
  if (typeof v.escala !== 'string' || !v.escala || v.escala.length > MAX_CAMPO) return null
  if (!Number.isInteger(v.capturado) || v.capturado <= 0) return null

  const ext = extrairPesos(v.pesos)
  const pesos = ext ? ext.pesos : {}
  const truncado = v.truncado === true || (ext ? ext.truncado : false)

  let equipe = null
  const eq = v.equipo
  if (eq && typeof eq === 'object' && !Array.isArray(eq)) {
    const valores = []
    if (Array.isArray(eq.valores)) {
      for (const item of eq.valores.slice(0, MAX_EQUIPE)) {
        if (!item || typeof item !== 'object') continue
        if (typeof item.escala !== 'string' || !item.escala || item.escala.length > MAX_CAMPO) continue
        if (typeof item.valor !== 'number' || !Number.isFinite(item.valor)) continue
        valores.push({
          escala: item.escala.slice(0, MAX_CAMPO),
          valor: item.valor,
          localized: textoOuNull(item.localized),
        })
      }
    }
    const ilvl = intOuNull(eq.ilvl)
    equipe = {
      valores,
      ilvl: ilvl !== null && ilvl >= 0 && ilvl <= MAX_ILVL ? ilvl : null,
    }
  }

  const candidatas = []
  if (Array.isArray(v.candidatas)) {
    for (const c of v.candidatas.slice(0, 3)) {
      if (!c || typeof c !== 'object' || typeof c.nome !== 'string' || !c.nome) continue
      candidatas.push({
        nome: c.nome.slice(0, MAX_CAMPO),
        localized: textoOuNull(c.localized) || c.nome.slice(0, MAX_CAMPO),
        provider: textoOuNull(c.provider),
        classID: intOuNull(c.classID),
        specID: intOuNull(c.specID),
        role: textoOuNull(c.role, 50),
      })
    }
  }

  return {
    v: VERSION,
    origem: 'addon',
    escala: v.escala.slice(0, MAX_CAMPO),
    localized: textoOuNull(v.localized) || v.escala.slice(0, MAX_CAMPO),
    provider: textoOuNull(v.provider),
    classID: intOuNull(v.classID),
    specID: intOuNull(v.specID),
    pesos,
    equipo: equipe,
    candidatas,
    capturado: v.capturado,
    truncado,
  }
}

function normalizarEstadoPawn(e) {
  const c = parsePawnCaptura(e)
  if (!c) return null
  let erro = null
  if (e.erro && typeof e.erro === 'object') {
    const msg = typeof e.erro.msg === 'string' && e.erro.msg ? e.erro.msg.slice(0, MAX_ERRO) : null
    const cap = Number.isInteger(e.erro.capturado) && e.erro.capturado > 0 ? e.erro.capturado : null
    if (msg && cap) erro = { msg, capturado: cap }
  }
  return { ...c, erro }
}

export async function lerPawn(ctx) {
  try {
    return normalizarEstadoPawn(await ctx.storage.get(CLAVE, null))
  } catch {
    return null
  }
}

export async function guardarPawn(ctx, registro) {
  const n = normalizarEstadoPawn(registro)
  if (!n) return null
  await ctx.storage.set(CLAVE, n)
  return lerPawn(ctx)
}

// sincronizarPawn(ctx, journal) — journal = salida de parseBridge. El addon
// escribe WoWForeverBridgeDB.pawn (última captura buena) y .pawnErro (último
// intento fallido). Gana el capturado más nuevo; un pawnErro más nuevo que la
// captura se conserva junto a ella (nunca borra una captura buena).
export async function sincronizarPawn(ctx, journal) {
  const cap = parsePawnCaptura(journal?.pawn)
  const capBom = cap && Number.isInteger(cap.capturado) && cap.capturado > 0 ? cap : null
  const mau = journal?.pawnErro
  const capMau = mau && typeof mau.erro === 'string' && mau.erro &&
    Number.isInteger(mau.capturado) && mau.capturado > 0
    ? { msg: mau.erro.slice(0, MAX_ERRO), capturado: mau.capturado } : null
  if (!capBom && !capMau) return { status: 'sin-cambios' }
  const atual = await lerPawn(ctx)
  let prox = null
  if (capBom && (!atual || (atual.capturado ?? -1) < capBom.capturado)) {
    prox = { ...capBom, erro: capMau && capMau.capturado > capBom.capturado ? capMau : null }
  } else if (capMau && atual && capMau.capturado > (atual.erro?.capturado ?? -1)) {
    prox = { ...atual, erro: capMau }
  }
  if (!prox) return { status: 'sin-cambios' }
  const estado = await guardarPawn(ctx, prox)
  return estado ? { status: 'ok', estado } : { status: 'sin-cambios' }
}

// ---------- elección de escala ----------

// escalaDoJogador(catalogo, captura, { classe, spec }) ->
//   { escala, motivo, candidatas, temPesos }
// Orden de preferencia (declarado):
//   (a) la escala capturada por el addon (la que el juego tenía activa);
//   (b) escala del catálogo con classID == classe y specID == spec;
//   (c) escala del catálogo con classID == classe;
//   (d) null + motivo.
// `catalogo` admite { escalas: [...] } o el array directo. Empates se resuelven
// por orden de nombre (determinista) y todas las candidatas quedan listadas.
export function escalaDoJogador(catalogo, captura, { classe = null, spec = null } = {}) {
  const lista = Array.isArray(catalogo) ? catalogo
    : (catalogo && Array.isArray(catalogo.escalas) ? catalogo.escalas : [])

  // (a) captura del addon: es la escala que el juego tenía activa.
  const cap = parsePawnCaptura(captura)
  if (cap) {
    return {
      escala: {
        nome: cap.escala,
        localized: cap.localized,
        provider: cap.provider,
        classID: cap.classID,
        specID: cap.specID,
        pesos: cap.pesos,
      },
      motivo: 'capturada',
      candidatas: cap.candidatas.map((c) => c.nome),
      temPesos: Object.keys(cap.pesos).length > 0,
    }
  }

  const porClase = lista
    .filter((e) => e && e.classID !== null && e.classID !== undefined && e.classID === classe)
    .sort((a, b) => (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0))
  if (!porClase.length) {
    return { escala: null, motivo: 'sin-coincidencia', candidatas: [], temPesos: false }
  }
  let grupo = porClase
  let motivo = 'catalogo-clase'
  if (spec !== null && spec !== undefined) {
    const porSpec = porClase.filter((e) => e.specID === spec)
    if (porSpec.length) { grupo = porSpec; motivo = 'catalogo-clase-spec' }
  }
  const elegida = grupo[0]
  return {
    escala: {
      nome: elegida.nome,
      localized: elegida.localized,
      provider: elegida.provider,
      classID: elegida.classID,
      specID: elegida.specID,
      pesos: elegida.pesos || {},
    },
    motivo,
    candidatas: grupo.map((e) => e.nome),
    temPesos: temPesos(elegida),
  }
}
