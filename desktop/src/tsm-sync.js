import { dataUrlBytes } from './auctionator.js'
import { MAX_TSM_BYTES, parseTsm, validTsm } from './tsm.js'
import { safeSyncPath as safePath } from './sync-path.js'

// Discovery is confined to SDK grants. Only exact addon data filenames are read;
// no Config.wtf, credentials, .bak files, raw filesystem bridge or background picker.
const TSM_FILE = 'TradeSkillMaster.lua'
async function findTsm(files, folder, read) {
  // Even a root hit must be checked against nested accounts before reading/pinning.
  if (typeof files.list !== 'function') return read(folder, TSM_FILE)
  const queue = [{ path: '', depth: 0 }], seen = new Set(), found = new Set()
  while (queue.length) {
    const { path, depth } = queue.shift()
    if (seen.has(path)) continue
    if (seen.size >= 120) throw Error('TSM: búsqueda incompleta; carpeta demasiado amplia.')
    seen.add(path)
    const result = await files.list(folder.id, path)
    if (!result?.ok || result.truncated || !Array.isArray(result.entries) || result.entries.length > 4000) throw Error('TSM: no se pudo completar la búsqueda dentro del permiso.')
    for (const e of result.entries) {
      if (!safePath(e.path) || (path && !e.path.startsWith(path + '/')) || e.path.slice(path ? path.length + 1 : 0).includes('/') || e.path.split('/').at(-1) !== e.name) throw Error('TSM: ruta de descubrimiento inválida.')
      if (e.isDirectory) {
        if (['Interface', 'Data', 'Cache', 'Logs', '.git'].includes(e.name)) continue
        if (depth >= 6 || queue.length + seen.size >= 120) throw Error('TSM: búsqueda incompleta; carpeta demasiado amplia.')
        queue.push({ path: e.path, depth: depth + 1 })
      } else if (e.name === TSM_FILE) found.add(e.path)
    }
  }
  if (found.size > 1) throw Error('Hay varias cuentas con TSM. Usa Elegir carpeta TSM para seleccionar una cuenta; no se eligió ninguna automáticamente.')
  return found.size ? { folderId: folder.id, path: [...found][0] } : null
}
export async function leerTsm(ctx, { pick = false, silent = false } = {}) {
  const files = ctx?.files
  if (!files?.readText) return { status: 'unavailable' }
  async function read(folder, path) {
    if (!safePath(path) || path.split('/').at(-1) !== TSM_FILE) throw Error('TSM: ruta guardada inválida.')
    let bytes
    if (files.readDataUrl) {
      const r = await files.readDataUrl(folder.id, path)
      if (r?.ok && typeof r.url === 'string') {
        if (r.url.length > MAX_TSM_BYTES * 1.34 + 200) throw Error('TSM: archivo mayor de 8 MiB.')
        bytes = dataUrlBytes(r.url)
      }
    }
    if (!bytes) {
      const r = await files.readText(folder.id, path)
      if (!r?.ok || typeof r.text !== 'string') return null
      bytes = new TextEncoder().encode(r.text)
    }
    if (!bytes.length || bytes.length > MAX_TSM_BYTES) throw Error('TSM: archivo vacío o mayor de 8 MiB.')
    return { status: 'ok', bytes, folderId: folder.id, path }
  }
  const remember = async hit => {
    const loaded = hit.bytes ? hit : await read({ id: hit.folderId }, hit.path)
    if (!loaded) return { status: 'error', message: 'TSM: el archivo desapareció durante la búsqueda.' }
    await ctx.storage.set('tsm-location', { folderId: loaded.folderId, path: loaded.path })
    return loaded
  }
  try {
    if (!pick) {
      const granted = typeof files.folders === 'function' ? await files.folders() : []
      const available = Array.isArray(granted) ? granted : []
      const location = await ctx.storage.get('tsm-location')
      const preferred = location?.folderId || await ctx.storage.get('tsm-folder')
      if (preferred && typeof files.folders === 'function' && !available.some(f => f.id === preferred)) {
        // Keep the revoked identity quarantined: a later poll must not adopt a different account.
        if (!location) await ctx.storage.set('tsm-location', { folderId: preferred, path: TSM_FILE })
        await ctx.storage.set('tsm-folder', null)
        return { status: 'no-folder', message: 'TSM: permiso anterior revocado. Autoriza otra carpeta para continuar.' }
      }
      if (location && available.some(f => f.id === location.folderId)) {
        const hit = await read(available.find(f => f.id === location.folderId), location.path)
        return hit || { status: 'error', message: 'TSM: el archivo seleccionado ya no está disponible; no se cambió de cuenta.' }
      }
      const auctionFolder = await ctx.storage.get('auctionator-folder')
      const folders = preferred ? available.filter(f => f.id === preferred) : available.some(f => f.id === auctionFolder) ? available.filter(f => f.id === auctionFolder) : available
      const hits = []
      for (const folder of folders) { const hit = await findTsm(files, folder, read); if (hit) hits.push(hit) }
      if (hits.length > 1) return { status: 'error', message: 'Hay varias carpetas con TSM. Usa Elegir carpeta TSM para seleccionar una cuenta.' }
      if (hits.length) return await remember(hits[0])
      if (silent || folders.length) return folders.length ? { status: 'error', message: 'No se encontró TradeSkillMaster.lua en las carpetas autorizadas. TSM debe guardar con /reload o cerrar sesión.' } : { status: 'no-folder' }
    }
    if (typeof files.requestFolder !== 'function') return { status: 'unavailable' }
    const picked = await files.requestFolder()
    if (!picked?.ok || !picked.folder) return { status: 'cancelled' }
    const hit = await findTsm(files, picked.folder, read)
    return hit ? await remember(hit) : { status: 'error', message: 'No se encontró TradeSkillMaster.lua. Autoriza la carpeta del juego, WTF o SavedVariables; no Interface/AddOns.' }
  } catch (e) { return { status: 'error', message: e?.message || 'TSM: no se pudo descubrir el archivo.' } }
}

// TSM failure is isolated from the guide and Auctionator. Two slots + readback
// before moving the pointer. Uncertain pointer commit poisons further writes
// until an explicit reload, never silently claims old data survived.
export function createTsmStore(ctx) {
  let cached, pointer = null, poisoned = false
  async function read() {
    if (poisoned) throw Error('TSM: guardado sin confirmar. Pulsa Reabrir TSM antes de continuar.')
    if (cached !== undefined) return structuredClone(cached)
    pointer = await ctx.storage.get('tsm-pointer')
    if (pointer == null) {
      // An absent index is not evidence of an empty store: storage and data can
      // be cleared independently. Never initialize over an orphaned slot, even
      // if that slot is empty/corrupt or was an unconfirmed write.
      for (const slot of ['a', 'b']) {
        const r = await ctx.files.readText('data', `tsm-${slot}.json`)
        if (r?.ok || (typeof r?.text === 'string' && r.text.length)) throw Error('TSM: índice ausente pero hay archivos guardados. No se sobrescribió ningún respaldo.')
      }
      cached = null; return null
    }
    if (Object.keys(pointer).sort().join(',') !== 'revision,slot' || !['a', 'b'].includes(pointer.slot) || !Number.isSafeInteger(pointer.revision) || pointer.revision < 1) throw Error('TSM: índice guardado inválido. No se sobrescribió.')
    const r = await ctx.files.readText('data', `tsm-${pointer.slot}.json`)
    if (!r?.ok || typeof r.text !== 'string' || r.text.length > 4 * 1024 * 1024) throw Error('TSM: no se pudo leer el historial guardado.')
    let record
    try { record = JSON.parse(r.text) } catch { throw Error('TSM: historial guardado ilegible. No se sobrescribió.') }
    if (!record || Object.keys(record).sort().join(',') !== 'revision,snapshot' || record.revision !== pointer.revision || (record.snapshot !== null && !validTsm(record.snapshot))) throw Error('TSM: historial guardado inválido. No se sobrescribió.')
    cached = record.snapshot; return structuredClone(cached)
  }
  return {
    read,
    reset() { cached = undefined; pointer = null; poisoned = false },
    async save(snapshot, canStart = () => true) {
      if (snapshot !== null && !validTsm(snapshot)) throw Error('TSM: snapshot inválido. No se guardó.')
      await read()
      const slot = pointer?.slot === 'a' ? 'b' : 'a', revision = (pointer?.revision || 0) + 1
      if (!Number.isSafeInteger(revision)) throw Error('TSM: revisión fuera de rango.')
      const body = JSON.stringify({ revision, snapshot })
      if (new TextEncoder().encode(body).length > 4 * 1024 * 1024) throw Error('TSM: historial demasiado grande.')
      if (!canStart()) return false
      const wrote = await ctx.files.writeText('data', `tsm-${slot}.json`, body)
      if (!wrote?.ok) throw Error('TSM: no se pudo guardar. Se conserva la versión anterior.')
      const check = await ctx.files.readText('data', `tsm-${slot}.json`)
      if (!check?.ok || check.text !== body) throw Error('TSM: archivo no confirmado. Se conserva la versión anterior.')
      const next = { slot, revision }
      try {
        await ctx.storage.set('tsm-pointer', next)
        if (JSON.stringify(await ctx.storage.get('tsm-pointer')) !== JSON.stringify(next)) throw Error('unconfirmed')
      } catch { poisoned = true; throw Error('TSM: índice sin confirmar; el resultado es incierto. Pulsa Reabrir TSM.') }
      cached = structuredClone(snapshot); pointer = next
    },
  }
}

export function createTsmSync(ctx) {
  const store = createTsmStore(ctx), listeners = new Set()
  let queue = Promise.resolve(), stopped = false, pollBusy = false, lastDigest = null
  let state = { status: 'idle', enabled: false, snapshot: null, message: '' }
  const publish = patch => {
    if (stopped) return
    state = { ...state, message: '', ...patch }
    for (const fn of listeners) fn(state)
  }
  const exclusive = fn => { const out = queue.then(fn); queue = out.catch(() => {}); return out }
  async function enabled() { return (await ctx.storage.get('tsm-auto')) !== false }
  async function setting(value) {
    await ctx.storage.set('tsm-auto', value)
    if (await enabled() !== value) throw Error('TSM: no se confirmó el seguimiento automático.')
    publish({ enabled: value })
  }
  async function ingest(bytes) {
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('')
    if (stopped) return { status: 'stopped' }
    if (digest === lastDigest) return { status: 'unchanged' }
    const snapshot = parseTsm(bytes)
    await store.read()
    if (stopped) return { status: 'stopped' }
    if (await store.save(snapshot, () => !stopped) === false) return { status: 'stopped' }
    lastDigest = digest
    publish({ snapshot })
    return { status: 'ok' }
  }
  const error = e => { const r = { status: 'error', message: e?.message || 'TSM: no se pudo completar la operación.' }; publish(r); return r }
  const api = {
    getState: () => state,
    subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn) },
    restore: () => exclusive(async () => {
      if (stopped) return
      try { store.reset(); const snapshot = await store.read(); publish({ snapshot, enabled: await enabled(), status: 'idle' }); lastDigest = null }
      catch (e) { error(e) }
    }),
    read: ({ pick = false } = {}) => exclusive(async () => {
      if (stopped) return { status: 'stopped' }
      try {
        const result = await leerTsm(ctx, { pick })
        if (stopped) return { status: 'stopped' }
        if (result.status !== 'ok') { publish(result); return result }
        const r = await ingest(result.bytes)
        if (stopped) return { status: 'stopped' }
        if (['ok', 'unchanged'].includes(r.status)) await setting(true)
        publish({ ...r, checkedAt: Date.now() }); return r
      } catch (e) { return error(e) }
    }),
    async poll() {
      if (stopped) return { status: 'stopped' }
      if (pollBusy) return { status: 'busy' }
      pollBusy = true
      try {
        return await exclusive(async () => {
          if (stopped) return { status: 'stopped' }
          await store.read() // do not hide corrupt/uncertain storage behind a paused toast
          if (stopped) return { status: 'stopped' }
          if (!await enabled()) { const r = { status: 'paused', enabled: false }; publish(r); return r }
          const result = await leerTsm(ctx, { silent: true })
          if (stopped || !await enabled()) return { status: stopped ? 'stopped' : 'paused' }
          const r = result.status === 'ok' ? await ingest(result.bytes) : result
          publish({ ...r, enabled: true, checkedAt: Date.now() }); return r
        })
      } catch (e) { return error(e) }
      finally { pollBusy = false }
    },
    setEnabled: value => exclusive(async () => {
      if (stopped) return
      try { await setting(!!value); publish({ status: value ? 'idle' : 'paused' }) } catch (e) { return error(e) }
    }),
    clear: () => exclusive(async () => {
      if (stopped) return { status: 'stopped' }
      try {
        await setting(false)
        await store.read()
        if (stopped) return { status: 'stopped' }
        if (await store.save(null, () => !stopped) === false) return { status: 'stopped' }
        lastDigest = null
        const r = { status: 'cleared', snapshot: null }; publish(r); return r
      } catch (e) { return error(e) }
    }),
    dispose() { stopped = true; listeners.clear(); lastDigest = null },
  }
  return api
}

export function startTsmSync(ctx, sync) {
  ctx.onDispose?.(() => sync.dispose())
  void sync.restore().then(() => sync.poll())
  ctx.setInterval?.(() => { void sync.poll() }, 30000)
}
