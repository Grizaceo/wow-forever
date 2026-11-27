// farm-sync.js — lectura de WoWForeverFarm.lua (addon hermano del puente).
// Busca SOLO ese archivo dentro de las carpetas ya concedidas (la misma
// SavedVariables de Auctionator/TSM/puente), con el mismo descubrimiento
// acotado que el puente; nunca pide carpeta nueva en segundo plano. Fusiona las
// sesiones en ctx.storage ('farm-sessions') y exporta el contexto del agente.
import { dataUrlBytes } from './auctionator.js'
import { safeSyncPath as safePath } from './sync-path.js'
import { FARM_FILE, FARM_MAX_BYTES, parseFarm, fusionarSesiones } from './farm-sesiones.js'

export const CLAVE_SESIONES = 'farm-sessions'
export const CLAVE_UBICACION = 'farm-location'
export const ARCHIVO_AGENTE = 'farmeo-agente.json'
const MAX_GUARDADAS = 200

const get = async (ctx, k) => { try { return await Promise.resolve(ctx?.storage?.get?.(k)) } catch { return null } }
const set = async (ctx, k, v) => { try { await Promise.resolve(ctx?.storage?.set?.(k, v)); return true } catch { return false } }

async function leerBytes(files, folderId, path) {
  if (!safePath(path) || path.split('/').at(-1) !== FARM_FILE) throw Error('Sesiones: ruta inválida.')
  if (files.readDataUrl) {
    const r = await files.readDataUrl(folderId, path)
    if (r?.ok && typeof r.url === 'string') {
      if (r.url.length > FARM_MAX_BYTES * 1.34 + 200) throw Error('Sesiones: archivo mayor de 4 MiB.')
      return dataUrlBytes(r.url)
    }
  }
  const r = await files.readText(folderId, path)
  if (!r?.ok || typeof r.text !== 'string') return null
  return new TextEncoder().encode(r.text)
}

// Descubrimiento acotado (mismas reglas que el puente: 120 carpetas, 6 niveles,
// sin Interface/Data/Cache/Logs, una sola coincidencia).
async function buscar(files, folder) {
  if (typeof files.list !== 'function') return null
  const queue = [{ path: '', depth: 0 }], seen = new Set(), found = new Set()
  while (queue.length) {
    const { path, depth } = queue.shift()
    if (seen.has(path)) continue
    if (seen.size >= 120) return null
    seen.add(path)
    const result = await files.list(folder.id, path)
    if (!result?.ok || result.truncated || !Array.isArray(result.entries) || result.entries.length > 4000) return null
    for (const e of result.entries) {
      if (!safePath(e.path) || e.path.split('/').at(-1) !== e.name) continue
      if (e.isDirectory) {
        if (['Interface', 'Data', 'Cache', 'Logs', '.git'].includes(e.name) || depth >= 6) continue
        queue.push({ path: e.path, depth: depth + 1 })
      } else if (e.name === FARM_FILE) found.add(e.path)
    }
  }
  if (found.size !== 1) return found.size > 1 ? { varias: true } : null
  return { folderId: folder.id, path: [...found][0] }
}

// Candidatos rápidos: el archivo junto al diario del puente o a TSM.
async function candidatos(ctx) {
  const out = []
  for (const k of ['bridge-location', 'tsm-location']) {
    const loc = await get(ctx, k)
    if (loc?.folderId && typeof loc.path === 'string') {
      const dir = loc.path.includes('/') ? loc.path.slice(0, loc.path.lastIndexOf('/') + 1) : ''
      out.push({ folderId: loc.folderId, path: dir + FARM_FILE })
    }
  }
  return out
}

// leerSesionesFarm(ctx) -> { status, sesiones, abierta, message }
// status: ok | no-file | no-folder | unavailable | error
export async function leerSesionesFarm(ctx) {
  const files = ctx?.files
  const guardado = await get(ctx, CLAVE_SESIONES)
  const previas = Array.isArray(guardado?.sessions) ? guardado.sessions : []
  if (!files?.readText) return { status: 'unavailable', sesiones: previas, abierta: null }
  try {
    const granted = typeof files.folders === 'function' ? await files.folders() : []
    const disponibles = Array.isArray(granted) ? granted : []
    if (!disponibles.length) return { status: 'no-folder', sesiones: previas, abierta: null }
    let hit = null
    const loc = await get(ctx, CLAVE_UBICACION)
    const intentos = [...(loc?.folderId ? [loc] : []), ...(await candidatos(ctx))]
      .filter((c) => disponibles.some((f) => f.id === c.folderId))
    for (const c of intentos) {
      const bytes = await leerBytes(files, c.folderId, c.path).catch(() => null)
      if (bytes?.length) { hit = { ...c, bytes }; break }
    }
    if (!hit) {
      for (const folder of disponibles) {
        const r = await buscar(files, folder)
        if (r?.varias) return { status: 'error', sesiones: previas, abierta: null, message: 'Hay varias cuentas con WoWForeverFarm.lua: concede la carpeta SavedVariables de la que juegas.' }
        if (r) { const bytes = await leerBytes(files, r.folderId, r.path); if (bytes?.length) { hit = { ...r, bytes }; break } }
      }
    }
    if (!hit) return { status: 'no-file', sesiones: previas, abierta: null, message: 'No se encontró WoWForeverFarm.lua: instala el addon WoWForeverFarm, cierra una sesión con /wff stop y haz /reload.' }
    const parsed = parseFarm(hit.bytes)
    const sesiones = fusionarSesiones(previas, parsed.sessions).slice(-MAX_GUARDADAS)
    await set(ctx, CLAVE_UBICACION, { folderId: hit.folderId, path: hit.path })
    await set(ctx, CLAVE_SESIONES, { v: 1, sessions: sesiones, leidoEn: new Date().toISOString() })
    return { status: 'ok', sesiones, abierta: parsed.current, nuevas: sesiones.length - previas.length }
  } catch (e) {
    return { status: 'error', sesiones: previas, abierta: null, message: String(e?.message || e).slice(0, 240) }
  }
}

// Escribe el contexto del agente en la carpeta de datos del plugin (la que lee
// consultar.py farmeo-*). Devuelve true si quedó escrito.
export async function exportarAgente(ctx, payload) {
  if (typeof ctx?.files?.writeText !== 'function') return false
  try {
    const r = await ctx.files.writeText('data', ARCHIVO_AGENTE, JSON.stringify(payload, null, 1))
    return !!r?.ok
  } catch { return false }
}

// Sincronizador a nivel de plugin (hermano de bridge-sync/tsm-sync): un solo
// sondeo de 30 s con ctx.setInterval, que respeta el «Seguimiento automático»
// del mercado. La vista se suscribe; «Leer sesiones» llama a read().
export function createFarmSync(ctx, marketSync = null) {
  let state = { status: 'idle', sesiones: [], abierta: null, lectura: null, checkedAt: null }
  let stopped = false, busy = false
  const listeners = new Set()
  const publish = (patch) => {
    if (stopped) return
    state = { ...state, ...patch, checkedAt: new Date().toISOString() }
    listeners.forEach((fn) => { try { fn(state) } catch { /* oyente roto no tumba el sondeo */ } })
  }
  const run = async () => {
    if (stopped || busy) return { status: busy ? 'busy' : 'stopped' }
    busy = true
    try {
      const r = await leerSesionesFarm(ctx)
      publish({ status: r.status, lectura: r, abierta: r.abierta || null, ...(Array.isArray(r.sesiones) ? { sesiones: r.sesiones } : {}) })
      return r
    } finally { busy = false }
  }
  return {
    getState: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    async restore() {
      const v = await get(ctx, CLAVE_SESIONES)
      if (Array.isArray(v?.sessions)) publish({ sesiones: v.sessions })
    },
    poll: () => (marketSync?.getState?.().enabled === false ? Promise.resolve({ status: 'paused' }) : run()),
    read: run,
    dispose() { stopped = true; listeners.clear() },
  }
}

export function startFarmSync(ctx, sync) {
  ctx.onDispose?.(() => sync.dispose())
  void sync.restore().then(() => sync.poll())
  ctx.setInterval?.(() => { void sync.poll() }, 30000)
}
