import { useEffect, useMemo, useState } from 'react'
import { Button, Checkbox } from '@hermes/plugin-sdk'
import { item, nombre } from '../../datos.js'
import { C, S } from '../../estilos.js'
import { Dinero, NombreItem, Tarjeta } from '../../ui.jsx'
import { resumenTsm } from '../../tsm.js'
import { listarValoracionesTsm } from '../../tsm-valoracion.js'
import { ValoracionPersonal } from './valoracion-personal.jsx'

/**
 * Mis ventas: valoración descriptiva de TSM por variante literal. No se cruzan
 * cifras con Auctionator: TSM v1 no acredita identidad económica ni equivalencia
 * de variantes entre formatos. La contabilidad previa (compras/expiradas/
 * canceladas) queda plegada y etiquetada como "todos los canales", fuera de la
 * referencia de precio de cada fila.
 */
function Contabilidad({ c, tr }) {
  return <details data-testid="tsm-contabilidad" style={{ marginTop: 4 }}>
    <summary style={{ ...S.sub, cursor: 'pointer', fontSize: 11 }}>
      {tr('Contabilidad previa · todos los canales · expiradas ', 'Earlier accounting · all channels · expired ')}<b>{c.expired}</b>
      {` · ${tr('compradas', 'bought')} ${c.bought} · ${tr('canceladas', 'cancelled')} ${c.cancelled}`}
    </summary>
    <div style={{ ...S.sub, marginTop: 4 }}>
      {tr('Vendidas', 'Sold')} {c.sold} · {tr('Ingresos registrados', 'Recorded revenue')} <Dinero cobre={Math.round(c.saleCopper)} />
      {c.avgSale === null ? null : <> · {tr('media/u', 'avg/unit')} <Dinero cobre={Math.round(c.avgSale)} /></>}
      {` · ${tr('compras', 'purchases')} `}<Dinero cobre={Math.round(c.buyCopper)} />
      {c.avgBuy === null ? null : <> · {tr('media compra/u', 'avg buy/unit')} <Dinero cobre={Math.round(c.avgBuy)} /></>}
      {` · ${tr('fuentes', 'sources')} ${c.sources.join(', ')}`}
      <div style={{ color: C.texto3, marginTop: 2 }}>
        {tr('Estos importes no entran en la referencia de precio de arriba: son contabilidad de todos los canales, no ventas de la variante en Auctionator.', 'These amounts do not feed the price reference above: they are all-channel accounting, not Auctionator-variant sales.')}
      </div>
    </div>
  </details>
}

export function MisVentas({ ventas, auctionSnapshot, perfil, lang }) {
  const [state, setState] = useState(() => ventas?.getState() || { status: 'unavailable', enabled: false, snapshot: null })
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false)
  const [selected, setSelected] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(0)
  // Reloj LOCAL de la vista: solo refresca la fecha/antigüedad mostrada. No
  // dispara lecturas, no es un sondeo del plugin y se limpia al desmontar.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => ventas?.subscribe(setState), [ventas])
  const en = lang === 'en', tr = (es, english) => en ? english : es
  const snap = state.snapshot
  const realms = snap?.realms || []
  const realm = realms.some(r => r.name === selected) ? selected : realms.some(r => r.name === perfil?.reino) ? perfil.reino : realms[0]?.name || ''
  const valoraciones = useMemo(() => realm ? listarValoracionesTsm(snap, realm, { nowMs }) : [], [snap, realm, nowMs])
  const resumen = useMemo(() => resumenTsm(snap, realm), [snap, realm])
  const contabilidad = useMemo(() => {
    const map = new Map()
    for (const r of resumen) map.set(r.itemString, r)
    return map
  }, [resumen])
  const filas = useMemo(() => {
    const conValoracion = new Set(valoraciones.map(v => v.itemString))
    return [
      ...valoraciones.map(v => ({ itemId: v.itemId, itemString: v.itemString, valoracion: v })),
      ...resumen.filter(c => !conValoracion.has(c.itemString)).map(c => ({ itemId: c.itemId, itemString: c.itemString, contabilidad: c })),
    ]
  }, [valoraciones, resumen])
  const filtered = useMemo(() => filas.filter(f => {
    const n = nombre(item(f.itemId)?.n, lang) || ''
    return `${n} ${f.itemString}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  }), [filas, search, lang])
  useEffect(() => setPage(0), [search, realm, snap])
  const safePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 25) - 1))
  const range = useMemo(() => {
    let first = Infinity, last = 0
    for (const r of snap?.realms?.find(r => r.name === realm)?.records || []) { first = Math.min(first, r.time); last = Math.max(last, r.time) }
    return last ? [first, last] : null
  }, [snap, realm])
  const date = time => new Date(time * 1000).toLocaleString(en ? 'en' : 'es')
  async function run(fn) {
    setBusy(true)
    try { await fn() } finally { setBusy(false); setConfirm(false) }
  }
  const statuses = {
    ok: tr('Importación TSM guardada', 'TSM import saved'),
    unchanged: tr('TSM sin cambios', 'TSM unchanged'),
    paused: tr('Seguimiento TSM pausado', 'TSM tracking paused'),
    'no-folder': tr('Sin permiso de carpeta: autoriza el juego o WTF una vez; los archivos se buscan automáticamente.', 'No folder permission: authorize the game or WTF once; addon files are discovered automatically.'),
    cancelled: tr('Selección cancelada', 'Selection cancelled'),
    unavailable: tr('Lectura TSM no disponible en este host.', 'TSM reading unavailable on this host.'),
    cleared: tr('Historial TSM borrado; seguimiento pausado.', 'TSM history cleared; tracking paused.'),
    error: tr('No se pudo completar la operación TSM.', 'Could not complete the TSM operation.'),
    idle: tr('TSM listo', 'TSM ready'),
  }
  return <div data-testid="tsm-panel">
    <Tarjeta titulo={tr('Mis ventas · TradeSkillMaster', 'My sales · TradeSkillMaster')} extra={<span style={S.chip}>{tr('Operaciones registradas · local', 'Recorded transactions · local')}</span>}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button disabled={busy || !ventas} onClick={() => run(() => ventas.read())}>{tr('Leer TradeSkillMaster.lua', 'Read TradeSkillMaster.lua')}</Button>
        <Button variant="outline" disabled={busy || !ventas} onClick={() => run(() => ventas.read({ pick: true }))}>{tr('Elegir carpeta TSM', 'Choose TSM folder')}</Button>
        <Button variant="outline" disabled={busy || !ventas} onClick={() => run(() => ventas.restore())}>{tr('Reabrir TSM', 'Reopen TSM')}</Button>
        <Button variant="outline" disabled={busy || !ventas || !snap} onClick={() => confirm ? run(() => ventas.clear()) : setConfirm(true)}>{confirm ? tr('Confirmar borrado TSM', 'Confirm clear TSM') : tr('Borrar historial TSM', 'Clear TSM history')}</Button>
        {confirm && <Button variant="outline" onClick={() => setConfirm(false)}>{tr('Cancelar', 'Cancel')}</Button>}
      </div>
      <label style={S.sub}><Checkbox checked={state.enabled} disabled={busy || !ventas} onCheckedChange={() => run(async () => { await ventas.setEnabled(!state.enabled); if (!state.enabled) await ventas.poll() })} />{tr(' Seguimiento TSM · cada 30 s', ' TSM tracking · every 30 s')}</label>
      <p style={{ ...S.sub, margin: 0 }} role="status" aria-live="polite">{statuses[state.status] || state.status}{state.message ? ` · ${state.message}` : ''}</p>
      <details data-testid="tsm-sincronizacion">
        <summary style={{ ...S.sub, cursor: 'pointer' }}>{tr('Fuente y sincronización', 'Source and synchronization')}</summary>
        {snap && <div style={S.sub}>{tr('Importado: ', 'Imported: ')}{new Date(snap.importedAt).toLocaleString(en ? 'en' : 'es')}{range ? ` · ${tr('Registros contables de todos los canales entre', 'All-channel accounting records between')} ${date(range[0])} — ${date(range[1])}` : ''}</div>}
      <p style={S.sub}>{tr('Detectamos TSM automáticamente en las carpetas autorizadas, reutilizando el permiso de Auctionator. No necesitas elegir archivos. Si falta permiso, autoriza una vez la carpeta del juego o WTF (no Interface/AddOns). Con varias cuentas se requiere escoger una. TSM guarda al usar /reload o cerrar sesión; el seguimiento continúa entre pestañas. No se guardan nombres de jugadores.', 'TSM is discovered automatically within authorized folders, reusing Auctionator’s permission. No file selection is needed. If access is missing, authorize the game or WTF folder once (not Interface/AddOns). Multiple accounts require choosing one. TSM saves after /reload or logout; tracking continues across tabs. Player names are not stored.')}</p>
      </details>
      {!snap ? <p>{tr('Sin operaciones importadas', 'No imported transactions')}</p> : <>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label>{tr('Reino TSM', 'TSM realm')} <select aria-label={tr('Reino TSM', 'TSM realm')} value={realm} onChange={e => setSelected(e.target.value)}>{realms.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}</select></label>
          <label>{tr('Buscar valoraciones', 'Search valuations')} <input type="text" aria-label={tr('Buscar valoraciones', 'Search valuations')} value={search} onChange={e => setSearch(e.target.value)} /></label>
        </div>
        <div style={S.sub}>
          {`${filtered.length} ${tr('objetos · ventana de 28 días', 'items · 28-day window')}`}
        </div>
        <p data-testid="tsm-incompatibilidad" style={{ ...S.aviso, borderColor: C.azul, margin: 0 }}>
          {tr('TSM y Auctionator se muestran por separado: aquí ves solo tus ventas registradas por TSM, sin mezclarlas con los precios anunciados en Auctionator.', 'TSM and Auctionator are shown separately: here you see only your sales recorded by TSM, not mixed with Auctionator listing prices.')}
        </p>
        <div data-testid="tsm-lista" style={{ overflowX: 'auto', display: 'grid', gap: 8 }}>
          {filtered.slice(safePage * 25, (safePage + 1) * 25).map(f => f.valoracion ? (
            <div key={f.itemString} style={{ ...S.tarjeta, gap: 4 }}>
              <ValoracionPersonal valoracion={f.valoracion} lang={lang} ahoraMs={nowMs} />
              {contabilidad.get(f.itemString) ? <Contabilidad c={contabilidad.get(f.itemString)} tr={tr} /> : null}
            </div>
          ) : (
            <div key={f.itemString} data-testid="tsm-solo-contabilidad" style={{ ...S.tarjeta, gap: 4 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                <NombreItem id={f.itemId} lang={lang} />
                <code style={{ color: C.texto3, fontSize: 11 }}>{f.itemString}</code>
              </div>
              <div style={S.sub}>{tr('Sin ventas de subasta registradas: sin valoración.', 'No recorded auction sales: no valuation.')}</div>
              <Contabilidad c={f.contabilidad} tr={tr} />
            </div>
          ))}
          {!filtered.length && <p style={S.sub}>{tr('Sin operaciones para esta selección.', 'No transactions for this selection.')}</p>}
        </div>
        {filtered.length > 25 && <div style={{ display: 'flex', gap: 8 }}><Button variant="outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>{tr('Anterior', 'Previous')}</Button><span>{safePage + 1} / {Math.ceil(filtered.length / 25)}</span><Button variant="outline" disabled={(safePage + 1) * 25 >= filtered.length} onClick={() => setPage(safePage + 1)}>{tr('Siguiente', 'Next')}</Button></div>}
      </>}
      <div style={{ ...S.aviso, borderColor: C.azul }}>{tr('Importes registrados por TSM, no beneficio neto: no se verificó la comisión de la versión instalada. No reconstruimos el bruto ni descontamos de nuevo comisiones; faltan costes de fabricación y depósitos. Expiradas y canceladas son unidades en intentos de subasta (una misma unidad puede repetirse), no ventas perdidas ni tasa de venta del servidor. Cada lectura válida reemplaza la copia completa de TSM: refleja también sus recortes o borrados; no recupera operaciones anteriores a instalarlo. La versión instalada de TSM no está verificada: el importe registrado puede ya descontar la comisión y aquí nunca se vuelve a descontar.', 'TSM recorded amounts, not net profit: the installed version’s commission treatment has not been verified. We do not reconstruct gross revenue or deduct fees twice; crafting costs and deposits are missing. Expired/cancelled counts are units in auction attempts (the same unit can recur), not lost sales or server sale rates. Each valid import replaces the complete TSM copy, including trims or deletions; it cannot recover transactions from before installation. The installed TSM version is unverified: the recorded amount may already include the commission, which is never deducted again here.')}</div>
    </Tarjeta>
  </div>
}
