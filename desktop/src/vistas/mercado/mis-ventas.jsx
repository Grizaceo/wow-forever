import { useEffect, useMemo, useState } from 'react'
import { Button, Checkbox } from '@hermes/plugin-sdk'
import { item, nombre } from '../../datos.js'
import { C, S } from '../../estilos.js'
import { Tarjeta, Dinero, NombreItem } from '../../ui.jsx'
import { resumenTsm } from '../../tsm.js'
import { fechaDe } from '../../mercado-logica.js'

export function MisVentas({ ventas, auctionSnapshot, perfil, lang }) {
  const [state, setState] = useState(() => ventas?.getState() || { status: 'unavailable', enabled: false, snapshot: null })
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false)
  const [selected, setSelected] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(0)
  useEffect(() => ventas?.subscribe(setState), [ventas])
  const en = lang === 'en', tr = (es, english) => en ? english : es
  const snap = state.snapshot
  const realms = snap?.realms || []
  const realm = realms.some(r => r.name === selected) ? selected : realms.some(r => r.name === perfil?.reino) ? perfil.reino : realms[0]?.name || ''
  const rows = useMemo(() => resumenTsm(snap, realm), [snap, realm])
  const filtered = useMemo(() => rows.filter(r => {
    const n = nombre(item(r.itemId)?.n, lang) || ''
    return `${n} ${r.itemString}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  }), [rows, search, lang])
  useEffect(() => setPage(0), [search, realm, snap])
  const safePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 25) - 1))
  const auctions = auctionSnapshot?.realms?.find(r => r.name === realm)
  const prices = useMemo(() => new Map((auctions?.items || []).filter(i => /^\d+$/.test(i.sourceKey)).map(i => [i.itemId, i])), [auctions])
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
  const headings = [tr('Objeto / origen', 'Item / source'), tr('Vendidas · media/u', 'Sold · avg/unit'), tr('Compradas · media/u', 'Bought · avg/unit'), tr('Expiradas / canceladas', 'Expired / cancelled'), tr('Ingresos registrados', 'Recorded revenue'), tr('Última venta', 'Last sale'), tr('Anunciado Auctionator/u', 'Auctionator listed/unit')]
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
      <p style={S.sub}>{tr('Detectamos TSM automáticamente en las carpetas autorizadas, reutilizando el permiso de Auctionator. No necesitas elegir archivos. Si falta permiso, autoriza una vez la carpeta del juego o WTF (no Interface/AddOns). Con varias cuentas se requiere escoger una. TSM guarda al usar /reload o cerrar sesión; el seguimiento continúa entre pestañas. No se guardan nombres de jugadores.', 'TSM is discovered automatically within authorized folders, reusing Auctionator’s permission. No file selection is needed. If access is missing, authorize the game or WTF folder once (not Interface/AddOns). Multiple accounts require choosing one. TSM saves after /reload or logout; tracking continues across tabs. Player names are not stored.')}</p>
      {!snap ? <p>{tr('Sin operaciones importadas', 'No imported transactions')}</p> : <>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label>{tr('Reino TSM', 'TSM realm')} <select aria-label={tr('Reino TSM', 'TSM realm')} value={realm} onChange={e => setSelected(e.target.value)}>{realms.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}</select></label>
          <label>{tr('Buscar operaciones', 'Search transactions')} <input type="text" aria-label={tr('Buscar operaciones', 'Search transactions')} value={search} onChange={e => setSearch(e.target.value)} /></label>
        </div>
        <div style={S.sub}>
          {tr('Importado: ', 'Imported: ')}{new Date(snap.importedAt).toLocaleString(en ? 'en' : 'es')}
          {range ? ` · ${tr('Operaciones entre', 'Transactions between')} ${date(range[0])} — ${date(range[1])}` : ''}
          {` · ${filtered.length} ${tr('objetos', 'items')}`}
        </div>
        <div style={{ overflowX: 'auto' }}><table style={S.tabla} aria-label={tr('Resumen de operaciones TSM', 'TSM transaction summary')}>
          <thead><tr>{headings.map(h => <th key={h} scope="col" style={S.th}>{h}</th>)}</tr></thead>
          <tbody>{filtered.slice(safePage * 25, (safePage + 1) * 25).map(r => {
            const price = /^i:\d+$/.test(r.itemString) ? prices.get(r.itemId) : null
            return <tr key={r.itemString}>
              <td style={S.td}><NombreItem id={r.itemId} lang={lang} /><div style={S.etiqueta}>{r.itemString} · {r.sources.join(', ')}</div></td>
              <td style={S.td}><b>{r.sold}</b> · {r.avgSale === null ? '—' : <Dinero cobre={Math.round(r.avgSale)} />}</td>
              <td style={S.td}>{r.bought} · {r.avgBuy === null ? '—' : <Dinero cobre={Math.round(r.avgBuy)} />}</td>
              <td style={S.td}>{r.expired} / {r.cancelled}</td>
              <td style={S.td}><Dinero cobre={r.saleCopper} /><div style={S.etiqueta}>{tr('Compras: ', 'Purchases: ')}<Dinero cobre={r.buyCopper} /></div></td>
              <td style={S.td}>{r.lastSale ? date(r.lastSale) : '—'}</td>
              <td style={S.td}>{price ? <><Dinero cobre={price.unitPriceCopper} /><div style={S.etiqueta}>{tr('Observación día Auctionator: ', 'Auctionator observation day: ')}{fechaDe(price.observedDay) ?? '—'}</div></> : <span style={S.etiqueta}>{tr('Sin referencia compatible', 'No matching reference')}</span>}</td>
            </tr>
          })}{!filtered.length && <tr><td colSpan={7} style={S.td}>{tr('Sin operaciones para esta selección.', 'No transactions for this selection.')}</td></tr>}</tbody>
        </table></div>
        {filtered.length > 25 && <div style={{ display: 'flex', gap: 8 }}><Button variant="outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>{tr('Anterior', 'Previous')}</Button><span>{safePage + 1} / {Math.ceil(filtered.length / 25)}</span><Button variant="outline" disabled={(safePage + 1) * 25 >= filtered.length} onClick={() => setPage(safePage + 1)}>{tr('Siguiente', 'Next')}</Button></div>}
      </>}
      <div style={{ ...S.aviso, borderColor: C.azul }}>{tr('Importes registrados por TSM, no beneficio neto: en ventas desde correo, TSM ya descuenta la comisión y redondea por unidad. No reconstruimos el bruto ni descontamos de nuevo comisiones; faltan costes de fabricación y depósitos. Expiradas y canceladas son unidades en intentos de subasta (una misma unidad puede repetirse), no ventas perdidas ni tasa de venta del servidor. La comparación usa solo el mismo reino y objetos base sin variantes. Cada lectura válida reemplaza la copia completa de TSM: refleja también sus recortes o borrados; no recupera operaciones anteriores a instalarlo.', 'TSM recorded amounts, not net profit: mail auction sales already deduct the AH cut and round per unit. We do not reconstruct gross revenue or deduct fees twice; crafting costs and deposits are missing. Expired/cancelled counts are units in auction attempts (the same unit can recur), not lost sales or server sale rates. Comparison requires the same realm and plain base items. Each valid import replaces the complete TSM copy, including trims or deletions; it cannot recover transactions from before installation.')}</div>
    </Tarjeta>
  </div>
}
