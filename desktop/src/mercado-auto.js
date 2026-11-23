// Un único coordinador por instancia del plugin: automático y manual comparten
// cola. Nunca abre selectores en segundo plano ni ejecuta Lua.
import { leerAuctionator } from './auctionator.js'
import {
  HunterMarket, HunterIdentity, planImportacion, snapshotValido, snapshotVisible, parsearFuenteAislada, snapshotSinIdentificar,
} from './mercado-logica.js'

// Deduplicación por procedencia exacta: identidad canónica + sourceKey + día +
// hash de bytes. Nunca por nombre de reino, carpeta ni posición.
export function dedupeProcedencia(observaciones) {
  const seen = new Set(), out = []
  for (const o of (Array.isArray(observaciones) ? observaciones : [])) {
    const key = JSON.stringify([o.identity, o.sourceKey, o.day, o.hash])
    if (seen.has(key)) continue
    seen.add(key); out.push(o)
  }
  return out
}

// Preparación pura de una importación v2. Un snapshot real de Auctionator no
// tiene identidad acreditada: se bloquea antes de planificar o escribir.
export function prepararSincronizacion({ snapshot, snapshotActual = null, historyStore = null } = {}) {
  if (!snapshot) return { status: 'blocked', reason: 'missing-snapshot' }
  if (snapshot.schemaVersion !== 2) return { status: 'blocked', reason: 'legacy-requires-migration' }
  const o = snapshot.observation
  if (!o || o.scope !== 'fresh-scan' || !Number.isSafeInteger(o.fromDay) ||
      !Number.isSafeInteger(o.toDay) || o.toDay < o.fromDay) {
    return { status: 'blocked', reason: 'invalid-observation' }
  }
  for (const realm of (snapshot.realms || [])) {
    const v = HunterIdentity.validateIdentity(realm.identity)
    if (!v.ok || v.identity.provenance.confidence !== 'verified') {
      return { status: 'blocked', reason: 'unknown-provenance' }
    }
  }
  if (!snapshotValido(snapshot)) return { status: 'blocked', reason: 'invalid-snapshot' }
  const plan = planImportacion(snapshot, { snapshotActual, historyStore })
  return { status: 'ok', ...plan }
}

export function createMarketSync(ctx, almacen) {
  let queue = Promise.resolve(), stopped = false, lastBytes = null, pollBusy = false
  let state = { status: 'idle', enabled: true }
  const listeners = new Set()
  const publish = patch => {
    if (stopped) return
    // A new outcome must not inherit errors or retry notices from the last one.
    const defaults = patch.status ? { error: undefined, message: '', histOk: undefined, checkedAt: undefined } : {}
    state = { ...state, ...defaults, ...patch }
    for (const fn of listeners) fn(state)
  }
  const exclusive = fn => { const out = queue.then(fn); queue = out.catch(() => {}); return out }
  async function enabled() { return (await ctx.storage.get('auctionator-auto')) !== false }
  // Commit compartido: importBytes (archivo Auctionator) e importRaw (diario
  // del addon puente) entran por la misma cola exclusiva y la misma guardia de
  // procedencia. El puente es transporte, no exportador verificado.
  async function commitRaw(raw, realm) {
    if (stopped) return { status: 'stopped' }
    if (!snapshotValido(raw)) return { status: 'error', error: 'invalid' }
    let est
    try { est = await almacen.read() }
    catch (e) { return { status: 'error', error: 'load', message: e?.message || String(e) } }
    const paired = typeof almacen.commitV2 === 'function' && typeof almacen.backupForMigration === 'function'
    let plan
    try {
      plan = planImportacion(paired ? snapshotSinIdentificar(raw) : raw, {
        snapshotActual: snapshotVisible(est.market, est.history), historyStore: est.history?.store || null,
      })
    } catch (e) { return { status: 'error', error: 'plan', message: e?.message || String(e) } }
    const { snapshot, store } = plan
    const sel = raw.realms.some(r => r.name === (realm || est.market?.realm)) ? (realm || est.market.realm) : raw.realms[0]?.name
    if (stopped) return { status: 'stopped' }
    if (paired) {
      try {
        await almacen.backupForMigration()
        await almacen.commitV2({market:{snapshot,realm:sel},store,revision:est.revision,hrevision:est.history?.revision||0})
      } catch(e) {return {status:'error',error:'save',message:e?.message||String(e)}}
      lastBytes=null
      publish({status:'ok',histOk:true,changed:(state.changed||0)+1})
      return {status:'ok',histOk:true,realm:sel}
    }
    // Compatibility for older SDK/test stores without paired persistence.
    try { await almacen.market({ values: { snapshot, realm: sel }, revision: est.revision }) }
    catch (e) { return { status: 'error', error: 'save', message: e?.message || String(e) } }
    let histOk = true
    try { await almacen.history({ store, revision: est.history?.revision || 0 }) }
    catch { histOk = false }
    // Solo se deduplica después de confirmar AMBOS guardados. Una importación
    // manual invalida la caché para que el siguiente sondeo reconcilie la fuente.
    lastBytes = null
    publish({ status: 'ok', histOk, changed: (state.changed || 0) + 1 })
    return { status: 'ok', histOk, realm: sel }
  }
  async function importBytes(bytes, realm) {
    if (stopped) return { status: 'stopped' }
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    if (!bytes.length || bytes.length > HunterMarket.MAX_BYTES) return { status: 'error', error: 'size' }
    let raw
    try { raw = HunterMarket.parseAuctionator(bytes) }
    catch { return { status: 'error', error: 'parse' } }
    return commitRaw(raw, realm)
  }
  const api = {
    exclusive,
    importBytes: (bytes, realm) => exclusive(() => importBytes(bytes, realm)),
    // Diario del addon WoWForeverBridge ya adaptado a snapshot crudo: misma
    // cola, misma guardia. Lo usa bridge-sync; no abre selectores.
    importRaw: (raw, realm) => exclusive(() => commitRaw(raw, realm)),
    // Fuente aislada verificada: única vía que escribe esquema v2. Exige
    // respaldo durable previo y confirmación conjunta snapshot + store.
    importSeparateSource: text => exclusive(async () => {
      if (stopped) return { status: 'stopped' }
      if (typeof ctx.verifyMarketSource !== 'function') return {status:'blocked', reason:'Sin adaptador verificado; JSON autoetiquetado no acredita procedencia.'}
      let snap
      try {
        if (await ctx.verifyMarketSource(text) !== true) return {status:'blocked', reason:'El adaptador no acreditó la fuente.'}
        snap = parsearFuenteAislada(text, true)
      } catch (e) { return { status: 'blocked', reason: 'invalid-source', message: e?.message || String(e) } }
      const est = await almacen.read()
      const prep = prepararSincronizacion({
        snapshot: snap,
        snapshotActual: snapshotVisible(est.market, est.history),
        historyStore: est.history?.store || null,
      })
      if (prep.status !== 'ok') return prep
      if (typeof almacen.backupForMigration !== 'function' || typeof almacen.commitV2 !== 'function') {
        return { status: 'error', error: 'storage-v2-unavailable' }
      }
      try { await almacen.backupForMigration() }
      catch (e) { return { status: 'error', error: 'backup', message: e?.message || String(e) } }
      const realm = prep.snapshot.realms[0]?.name
      try {
        const committed = await almacen.commitV2({
          market: { snapshot: prep.snapshot, realm }, store: prep.store,
          revision: est.revision, hrevision: est.history?.revision || 0,
        })
        lastBytes = null
        publish({ status: 'ok', histOk: true, changed: (state.changed || 0) + 1 })
        return { status: 'ok', realm, committed }
      } catch (e) {
        return { status: 'error', error: 'save', message: e?.message || String(e) }
      }
    }),
    getState: () => state,
    subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn) },
    async setEnabled(value) {
      await ctx.storage.set('auctionator-auto', !!value)
      if ((await enabled()) !== !!value) throw new Error('No se confirmó el ajuste automático.')
      lastBytes = null
      publish({ enabled: !!value, status: value ? 'idle' : 'paused' })
    },
    async poll() {
      if (stopped) return { status: 'stopped' }
      if (pollBusy) return { status: 'busy' }
      pollBusy = true
      try {
        return await exclusive(async () => {
          if (stopped) return { status: 'stopped' }
          if (!await enabled()) { publish({ status: 'paused', enabled: false }); return state }
          publish({ enabled: true })
          const r = await leerAuctionator(ctx, { silent: true })
          if (stopped || !await enabled()) return { status: stopped ? 'stopped' : 'paused' }
          if (r.status !== 'ok') { publish({ ...r, checkedAt: Date.now() }); return r }
          if (lastBytes && lastBytes.length === r.bytes.length && lastBytes.every((b,i) => b === r.bytes[i])) {
            publish({ status: 'unchanged', checkedAt: Date.now(), message: '' }); return { status: 'unchanged' }
          }
          const result = await importBytes(r.bytes)
          if (result.status === 'ok' && result.histOk) lastBytes = r.bytes.slice()
          publish({ ...result, checkedAt: Date.now(), message: result.message || '' })
          return result
        })
      } catch (e) {
        const r = { status: 'error', error: 'read', message: e?.message || String(e) }
        publish(r); return r
      } finally { pollBusy = false }
    },
    dispose() { stopped = true; listeners.clear() },
  }
  return api
}

export function startMarketSync(ctx, sync) {
  // Timer scoped to the plugin, not a mounted page: changing tabs/routes does
  // not stop history collection. Unload/disable cancels timer + future work.
  if (typeof ctx.setInterval !== 'function') return
  ctx.onDispose?.(() => sync.dispose())
  ctx.setInterval(() => { void sync.poll() }, 30000)
  void sync.poll()
}
