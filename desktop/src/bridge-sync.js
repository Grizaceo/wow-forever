// bridge-sync.js — seguimiento del diario WoWForeverBridge.lua (addon propio).
// Hermano de mercado-auto/tsm-sync: sondea cada 30 s las carpetas concedidas,
// lee SOLO el diario del puente (mismo contrato de descubrimiento acotado que
// TSM: safePath, BFS con topes, cuarentena de permisos revocados, sin adoptar
// otra cuenta en silencio) y fusiona las capturas nuevas en el almacén v2 a
// través de la cola exclusiva de mercado-auto. Nunca lee .bak ni Config.wtf.
//
// El diario es una entrada por día con retención configurable en el addon
// (/wfb days N): aunque Auctionator sobrescriba su propio archivo, cada escaneo
// capturado por el puente llega al histórico durable del plugin.
import { dataUrlBytes } from './auctionator.js'
import { BRIDGE_FILE, BRIDGE_MAX_BYTES, parseBridge, bridgeToSnapshot } from './bridge.js'

const safePath = p => typeof p === 'string' && p.length <= 2048 && !p.includes('\\') && !/[\x00-\x1f]/.test(p) && p.split('/').every(s => s && s !== '.' && s !== '..' && !s.includes(':'))

async function findBridge(files, folder, read) {
  if (typeof files.list !== 'function') return read(folder, BRIDGE_FILE)
  const queue = [{ path: '', depth: 0 }], seen = new Set(), found = new Set()
  while (queue.length) {
    const { path, depth } = queue.shift()
    if (seen.has(path)) continue
    if (seen.size >= 120) throw Error('Puente: búsqueda incompleta; carpeta demasiado amplia.')
    seen.add(path)
    const result = await files.list(folder.id, path)
    if (!result?.ok || result.truncated || !Array.isArray(result.entries) || result.entries.length > 4000) throw Error('Puente: no se pudo completar la búsqueda dentro del permiso.')
    for (const e of result.entries) {
      if (!safePath(e.path) || (path && !e.path.startsWith(path + '/')) || e.path.slice(path ? path.length + 1 : 0).includes('/') || e.path.split('/').at(-1) !== e.name) throw Error('Puente: ruta de descubrimiento inválida.')
      if (e.isDirectory) {
        if (['Interface', 'Data', 'Cache', 'Logs', '.git'].includes(e.name)) continue
        if (depth >= 6 || queue.length + seen.size >= 120) throw Error('Puente: búsqueda incompleta; carpeta demasiado amplia.')
        queue.push({ path: e.path, depth: depth + 1 })
      } else if (e.name === BRIDGE_FILE) found.add(e.path)
    }
  }
  if (found.size > 1) throw Error('Hay varias cuentas con el diario del puente. Concede la carpeta SavedVariables de la cuenta que juegas.')
  return found.size ? { folderId: folder.id, path: [...found][0] } : null
}

// leerBridge: descubrir (o elegir) y leer SOLO el diario del puente.
export async function leerBridge(ctx, { pick = false, silent = false } = {}) {
  const files = ctx?.files
  if (!files?.readText) return { status: 'unavailable' }
  async function read(folder, path) {
    if (!safePath(path) || path.split('/').at(-1) !== BRIDGE_FILE) throw Error('Puente: ruta guardada inválida.')
    let bytes
    if (files.readDataUrl) {
      const r = await files.readDataUrl(folder.id, path)
      if (r?.ok && typeof r.url === 'string') {
        if (r.url.length > BRIDGE_MAX_BYTES * 1.34 + 200) throw Error('Puente: diario mayor de 8 MiB.')
        bytes = dataUrlBytes(r.url)
      }
    }
    if (!bytes) {
      const r = await files.readText(folder.id, path)
      if (!r?.ok || typeof r.text !== 'string') return null
      bytes = new TextEncoder().encode(r.text)
    }
    if (!bytes.length || bytes.length > BRIDGE_MAX_BYTES) throw Error('Puente: diario vacío o mayor de 8 MiB.')
    return { status: 'ok', bytes, folderId: folder.id, path }
  }
  const remember = async hit => {
    const loaded = hit.bytes ? hit : await read({ id: hit.folderId }, hit.path)
    if (!loaded) return { status: 'error', message: 'Puente: el diario desapareció durante la búsqueda.' }
    await ctx.storage.set('bridge-location', { folderId: loaded.folderId, path: loaded.path })
    return loaded
  }
  try {
    if (!pick) {
      const granted = typeof files.folders === 'function' ? await files.folders() : []
      const available = Array.isArray(granted) ? granted : []
      let location = await ctx.storage.get('bridge-location')
      const auctionFolder = await ctx.storage.get('auctionator-folder')
      const tsmLocation = await ctx.storage.get('tsm-location')
      let preferred = location?.folderId || auctionFolder || tsmLocation?.folderId || null
      if (location && !available.some(f => f.id === location.folderId)) {
        // Permiso revocado: si el usuario concedió otra carpeta para el mismo
        // fin (Auctionator/TSM), esa elección explícita manda; si no, cuarentena
        // y nunca adoptar otra cuenta en silencio.
        const alt = [auctionFolder, tsmLocation?.folderId].find(id => id && available.some(f => f.id === id))
        if (alt) { await ctx.storage.remove('bridge-location'); location = null; preferred = alt }
        else return { status: 'no-folder', message: 'Puente: permiso anterior revocado. Autoriza la carpeta SavedVariables para continuar.' }
      } else if (preferred && !available.some(f => f.id === preferred)) {
        preferred = null
      }
      if (location && available.some(f => f.id === location.folderId)) {
        const hit = await read(available.find(f => f.id === location.folderId), location.path)
        return hit || { status: 'error', message: 'Puente: el diario seleccionado ya no está disponible; no se cambió de cuenta.' }
      }
      const folders = preferred ? available.filter(f => f.id === preferred) : available
      const hits = []
      for (const folder of folders) { const hit = await findBridge(files, folder, read); if (hit) hits.push(hit) }
      if (hits.length > 1) return { status: 'error', message: 'Hay varias carpetas con el diario del puente. Concede la carpeta SavedVariables de la cuenta que juegas.' }
      if (hits.length) return await remember(hits[0])
      if (silent || folders.length) return folders.length
        ? { status: 'no-file', message: 'No se encontró WoWForeverBridge.lua. Instala el addon WoWForeverBridge y haz /reload; el diario se guarda en la misma carpeta SavedVariables de Auctionator.' }
        : { status: 'no-folder' }
    }
    if (typeof files.requestFolder !== 'function') return { status: 'unavailable' }
    const picked = await files.requestFolder()
    if (!picked?.ok || !picked.folder) return { status: 'cancelled' }
    const hit = await findBridge(files, picked.folder, read)
    return hit ? await remember(hit) : { status: 'error', message: 'No se encontró WoWForeverBridge.lua. Instala el addon y haz /reload; concede la carpeta SavedVariables, no Interface/AddOns.' }
  } catch (e) { return { status: 'error', message: e?.message || 'Puente: no se pudo descubrir el diario.' } }
}

export function createBridgeSync(ctx, marketSync) {
  let state = { status: 'idle', enabled: true, message: null, error: null, checkedAt: null, entries: 0, items: 0, lastDay: null, lastCaptureAt: null }
  let stopped = false, busy = false, lastDigest = null
  const listeners = new Set()
  const publish = patch => {
    if (stopped) return
    state = { ...state, ...patch, busy, checkedAt: new Date().toISOString() }
    listeners.forEach(fn => { try { fn(state) } catch {} })
  }
  const error = e => {
    const r = { status: 'error', error: String(e?.message || e).slice(0, 240), message: null }
    publish(r)
    return r
  }
  const exclusive = async fn => {
    if (stopped) return { status: 'stopped' }
    if (busy) return { status: 'busy' }
    busy = true
    publish({ status: 'checking' })
    try { return await fn() } finally { busy = false; publish({}) }
  }
  const digest = async bytes => {
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
  }
  const ingest = async bytes => {
    const hash = await digest(bytes)
    if (hash === lastDigest) { publish({ status: 'unchanged', message: 'Puente sin cambios.', error: null }); return { status: 'unchanged' } }
    const journal = parseBridge(bytes)
    if (!journal.entries.length) {
      lastDigest = hash
      const r = { status: 'ok', message: 'El diario del puente está vacío. Haz un escaneo y /reload.', entries: 0, items: 0, lastDay: null, lastCaptureAt: null, error: null }
      publish(r)
      return r
    }
    const raw = bridgeToSnapshot(journal)
    const result = await marketSync.importRaw(raw)
    if (result?.status !== 'ok') throw new Error(result?.message || result?.error || 'El mercado no pudo fusionar el diario del puente.')
    if (stopped) return { status: 'stopped' }
    lastDigest = hash
    let items = 0, lastDay = null, lastCaptureAt = null
    for (const e of journal.entries) {
      items += Object.keys(e.items).length
      if (lastDay === null || e.day > lastDay) lastDay = e.day
      if (lastCaptureAt === null || e.at > lastCaptureAt) lastCaptureAt = e.at
    }
    const r = { status: 'ok', message: `Puente: ${journal.entries.length} día(s) fusionados en el histórico.`, entries: journal.entries.length, items, lastDay, lastCaptureAt, error: null }
    publish(r)
    return r
  }
  const surface = r => {
    const out = r.status === 'error'
      ? { status: 'error', error: r.message || 'Puente: error de lectura.', message: null }
      : { status: 'waiting', message: r.message || (r.status === 'no-folder' ? 'Sin carpeta concedida para el puente.' : null), error: null }
    publish(out)
    return out
  }
  const poll = () => exclusive(async () => {
    // exclusive publica 'checking' al entrar: si estamos pausados hay que
    // volver a publicar 'paused' o el panel se queda en 'checking'.
    if (stopped || !state.enabled) { publish({ status: 'paused' }); return { status: 'paused' } }
    try {
      const r = await leerBridge(ctx, { silent: true })
      if (stopped) return { status: 'stopped' }
      if (r.status !== 'ok') return surface(r)
      return await ingest(r.bytes)
    } catch (e) { return error(e) }
  })
  const api = {
    getState: () => state,
    subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn) },
    restore: () => exclusive(async () => {
      const value = await ctx.storage.get('bridge-auto')
      if (stopped) return
      state = { ...state, enabled: value !== false }
      publish({ status: state.enabled ? 'idle' : 'paused' })
    }),
    poll,
    read: ({ pick = false } = {}) => exclusive(async () => {
      if (stopped) return { status: 'stopped' }
      try {
        const r = await leerBridge(ctx, { pick })
        if (r.status === 'cancelled') { publish({ status: 'idle', message: 'Lectura cancelada.' }); return r }
        if (r.status !== 'ok') return surface(r)
        return await ingest(r.bytes)
      } catch (e) { return error(e) }
    }),
    setEnabled: value => exclusive(async () => {
      if (stopped) return
      try {
        await ctx.storage.set('bridge-auto', !!value)
        state = { ...state, enabled: !!value }
        publish({ status: value ? 'idle' : 'paused' })
      } catch (e) { return error(e) }
    }),
    dispose() { stopped = true; listeners.clear(); lastDigest = null },
  }
  return api
}

export function startBridgeSync(ctx, sync) {
  ctx.onDispose?.(() => sync.dispose())
  void sync.restore().then(() => sync.poll())
  ctx.setInterval?.(() => { void sync.poll() }, 30000)
}
