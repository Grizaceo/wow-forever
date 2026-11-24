/*
 * valoracion-personal.jsx — primera entrega descriptiva de "Mis ventas" de TSM.
 *
 * Núcleo puro en ../tsm-valoracion.js. Esta capa SOLO muestra lo que el núcleo
 * devuelve: mediana/cuartiles entre días, recuentos y motivo de insuficiencia.
 *
 * Dos niveles de texto:
 *   · Fuera de los desplegables, el texto es de jugador: nada de códigos
 *     internos ni de jerga estadística. Los motivos van en palabras y con su
 *     número cuando el dato existe (días con ventas, días mínimos, edad de la
 *     última venta).
 *   · Dentro del desplegable de método queda el detalle técnico: versión del
 *     método, reglas declaradas y los códigos internos de los motivos.
 *
 * No estima precios futuros, no calcula beneficio ni demanda, no descuenta
 * comisiones y NO cruza TSM con Auctionator: TSM v1 no acredita identidad
 * económica ni equivalencia entre variantes de distintos formatos.
 */
import { useEffect, useMemo, useState } from 'react'
import { C, S } from '../../estilos.js'
import { Dinero, NombreItem } from '../../ui.jsx'
import { METODO_TSM, valorarTsm } from '../../tsm-valoracion.js'

const DAY_MS = 86400000
const cp = (lang, es, en) => (lang === 'en' ? en : es)

const RAZONES = {
  'insufficient-days': ['días insuficientes', 'insufficient days'],
  stale: ['última venta antigua', 'stale last sale'],
  'wide-dispersion': ['dispersión amplia', 'wide dispersion'],
  'no-sales': ['sin ventas Auction', 'no Auction sales'],
}

export const razonTexto = (code, lang) => RAZONES[code]?.[lang === 'en' ? 1 : 0] || code

// La política vive solo en el núcleo versionado que se incluye en este bundle.
export function razonesDe(v) { return v.reasons }

export function fechaSeg(seg) {
  return Number.isFinite(seg) && seg > 0 ? new Date(seg * 1000).toISOString().slice(0, 10) : '—'
}

// Días transcurridos desde un instante en SEGUNDOS epoch. `null` si no hay dato.
export function diasDesde(seg, ahoraMs) {
  if (!Number.isFinite(seg) || seg <= 0) return null
  const base = Number.isFinite(ahoraMs) ? ahoraMs : Date.now()
  return Math.max(0, Math.floor((base - seg * 1000) / DAY_MS))
}

export function edadSeg(seg, ahoraMs, lang) {
  const dias = diasDesde(seg, ahoraMs)
  if (dias == null) return cp(lang, 'sin fecha', 'no date')
  return lang === 'en'
    ? `${dias} day${dias === 1 ? '' : 's'} ago`
    : `hace ${dias} día${dias === 1 ? '' : 's'}`
}

/**
 * Motivo explicado en palabras de jugador, con el número cuando el dato existe
 * en la valoración. NUNCA devuelve el código interno: esto se muestra fuera del
 * desplegable de método, que es donde quedan los códigos.
 */
export function motivoVisible(code, v, ahoraMs, lang) {
  const w = v?.window || {}
  const cfg = v?.config || {}
  const en = lang === 'en'
  if (code === 'insufficient-days') {
    const dias = Number.isFinite(w.days) ? w.days : null
    const min = Number.isFinite(cfg.minDays) ? cfg.minDays : null
    if (dias == null || min == null) return cp(lang, 'faltan días con ventas', 'not enough days with sales')
    return en ? `sales on ${dias} of the ${min} days needed` : `ventas en ${dias} de los ${min} días necesarios`
  }
  if (code === 'stale') {
    const dias = diasDesde(w.lastSale, ahoraMs)
    const max = Number.isFinite(cfg.staleDays) ? cfg.staleDays : null
    if (dias == null || max == null) return cp(lang, 'última venta antigua', 'last sale too old')
    // El núcleo marca «stale» con edad > max días en ms; el piso puede dar justo
    // max (p. ej. 7,5 días → 7). Entonces se dice «más de max» y no «hace 7 (máximo 7)».
    if (dias <= max) return en ? `last sale more than ${max} days ago` : `última venta hace más de ${max} días`
    return en
      ? `last sale ${dias} day${dias === 1 ? '' : 's'} ago (max ${max})`
      : `última venta hace ${dias} día${dias === 1 ? '' : 's'} (máximo ${max})`
  }
  if (code === 'wide-dispersion') return cp(lang, 'precios muy dispersos', 'prices too spread out')
  if (code === 'no-sales') {
    const n = Number.isFinite(cfg.windowDays) ? cfg.windowDays : 28
    return en ? `no auction sales in the last ${n} days` : `sin ventas de subasta en los últimos ${n} días`
  }
  return cp(lang, 'pocos datos', 'not enough data')
}

const detalleStyle = { ...S.sub, fontSize: 11, marginTop: 6 }
const resumenStyle = { cursor: 'pointer', fontSize: 12, color: C.texto2, padding: '2px 0' }

/**
 * Una tarjeta por variante literal de TSM. `id` permite reutilizarla tanto en
 * la lista de MisVentas como en la consulta separada del detalle Auctionator.
 */
export function ValoracionPersonal({ valoracion: v, lang, ahoraMs, id = 'valoracion-fila' }) {
  const razones = razonesDe(v, ahoraMs)
  const suficiente = v.sufficient
  const w = v?.window || {}
  const cfg = v?.config || {}
  const h = v?.history || {}
  const d = v?.window?.daily || []
  const excl = v?.excluded || {}
  return (
    <div data-testid={id} style={{ ...S.fila, flexWrap: 'wrap', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
        <NombreItem id={v?.itemId} lang={lang} />
        <code style={{ color: C.texto3, fontSize: 11 }}>{v?.itemString}</code>
        {suficiente ? (
          <span style={{ color: C.verde }} data-testid="valoracion-tipico">
            {cp(lang, 'Precio típico de tus ventas:', 'Typical price of your sales:')} <Dinero cobre={w.medianCopper} />
          </span>
        ) : (
          <>
            <span data-testid="valoracion-insuficiente" style={{ ...S.chip, color: C.amarillo }}>
              {cp(lang, 'Pocos datos', 'Not enough data')}
            </span>
            {razones.length ? (
              <span data-testid="valoracion-motivos" style={{ color: C.texto2 }}>
                {' · '}{razones.map((r) => motivoVisible(r, v, ahoraMs, lang)).join(' · ')}
              </span>
            ) : null}
          </>
        )}
        {!suficiente && w.medianCopper != null ? (
          <span data-testid="valoracion-descriptivo">
            {cp(lang, 'Referencia con pocos datos (no es un precio fiable):', 'Reference with little data (not a reliable price):')} <Dinero cobre={w.medianCopper} />
          </span>
        ) : null}
      </div>
      <div style={{ ...S.sub, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span>{cp(lang, 'unidades', 'units')} <b data-testid="tsm-unidades">{w.units ?? 0}</b></span>
        <span>{cp(lang, 'registros', 'records')} <b>{w.records ?? 0}</b></span>
        <span>{cp(lang, 'días con ventas', 'days with sales')} <b>{w.days ?? 0}</b></span>
        <span data-testid="tsm-ultima-venta">
          {cp(lang, 'última venta', 'last sale')} {fechaSeg(w.lastSale)} · {edadSeg(w.lastSale, ahoraMs, lang)}
        </span>
      </div>

      <details data-testid="valoracion-metodo" style={{ width: '100%' }}>
        <summary style={resumenStyle}>{cp(lang, 'Método y límites', 'Method and limits')}</summary>
        <div style={detalleStyle}>
          <div>{METODO_TSM} · {cp(lang, 'solo ventas de subasta ya registradas; no estima precios futuros', 'recorded auction sales only; it does not estimate future prices')}</div>
          <div>{cp(lang, 'Reglas fijas, no calibradas', 'Fixed rules, not calibrated')}: {cp(lang, 'ventana', 'window')} {cfg.windowDays ?? 28} {cp(lang, 'días', 'days')} · {cp(lang, 'mínimo', 'minimum')} {cfg.minDays ?? 5} {cp(lang, 'días con ventas', 'days with sales')} · {cp(lang, 'antigüedad máxima', 'max age')} {cfg.staleDays ?? 7} {cp(lang, 'días', 'days')} · {cp(lang, 'dispersión', 'dispersion')} ≤ {String(cfg.dispersionLimit ?? 0.5).replace('.', lang === 'en' ? '.' : ',')}</div>
          <div>{cp(lang, 'Cada día se resume con la mediana ponderada por unidades (primer precio que alcanza la mitad de las unidades; empate hacia abajo). Después todos los días tienen el mismo peso y se calculan los cuartiles Q1/Q3 interpolados tipo 7. No se quitan extremos.', 'Each day is summarised with the unit-weighted median (first price reaching half the units; ties down). Then all days have the same weight and the Q1/Q3 quartiles are interpolated type 7. Extremes are not removed.')}</div>
          <div>{cp(lang, 'Describe solo los días con ventas registradas: no es el precio de mercado. Días distintos no garantizan independencia.', 'It describes only days with recorded sales: it is not the market price. Different days do not guarantee independence.')}</div>
          <div style={{ color: C.amarillo }}>
            {cp(lang, 'TSM puede haber descontado ya la comisión en ventas por correo; la versión instalada no está verificada. Aquí no se vuelve a descontar ni se calcula beneficio.', 'TSM may have already deducted the mail-sale commission; the installed version is unverified. Nothing is deducted again here and no profit is computed.')}
          </div>
          {!suficiente && razones.length
            ? <div>{cp(lang, 'Motivos', 'Reasons')}: {razones.map((r) => `${r} (${razonTexto(r, lang)})`).join(' · ')}</div>
            : null}
        </div>
      </details>

      <details data-testid="valoracion-fuente" style={{ width: '100%' }}>
        <summary style={resumenStyle}>{cp(lang, 'Fuente y exclusiones', 'Source and exclusions')}</summary>
        <div style={detalleStyle}>
          <div>{cp(lang, 'Fuente', 'Source')}: TSM · Auction · {v?.realmName} · {v?.itemString} · {cp(lang, 'ID base', 'base ID')} {v?.itemId ?? '—'}</div>
          <div>{cp(lang, 'Ventana de evaluación', 'Evaluation window')} {fechaSeg(v.windowStart / 1000)} → {fechaSeg(v.evaluatedAt / 1000)} (UTC).</div>
          <div>{cp(lang, 'Período de ventas registradas en ventana', 'Recorded sale period within window')} {fechaSeg(w.firstSale)} → {fechaSeg(w.lastSale)} · Q1 <Dinero cobre={w.q1Copper} /> · Q3 <Dinero cobre={w.q3Copper} /> · {cp(lang, 'mín', 'min')} <Dinero cobre={w.minCopper} /> · {cp(lang, 'máx', 'max')} <Dinero cobre={w.maxCopper} /></div>
          <div data-testid="valoracion-historico">{cp(lang, 'Histórico completo disponible (no seguimiento continuo)', 'Full available history (not continuous tracking)')}: {h.units ?? 0} {cp(lang, 'unidades', 'units')} · {h.records ?? 0} {cp(lang, 'registros', 'records')} · {h.days ?? 0} {cp(lang, 'días', 'days')} · {fechaSeg(h.firstSale)} → {fechaSeg(h.lastSale)} · {cp(lang, 'mediana descriptiva', 'descriptive median')} <Dinero cobre={h.medianCopper} /> · Q1 <Dinero cobre={h.q1Copper} /> · Q3 <Dinero cobre={h.q3Copper} /> · {cp(lang, 'mín', 'min')} <Dinero cobre={h.minCopper} /> · {cp(lang, 'máx', 'max')} <Dinero cobre={h.maxCopper} /></div>
          <div>{cp(lang, 'Excluidos', 'Excluded')}: {cp(lang, 'futuros', 'future')} {excl.future ?? 0} · {cp(lang, 'ceros', 'zero')} {excl.zero ?? 0} · {cp(lang, 'inválidos', 'invalid')} {excl.invalid ?? 0} · {cp(lang, 'fuera de ventana', 'outside window')} {excl.outsideWindow ?? 0}</div>
          {d.length ? (
            <div style={{ marginTop: 4 }}>
              <div>{cp(lang, 'Mediana diaria (día UTC, unidades, registros)', 'Daily median (UTC day, units, records)')}</div>
              {d.map((x) => <div key={x.day} style={{ color: C.texto3 }}>{fechaSeg(x.day * (DAY_MS / 1000))} · {x.units} · {x.records} · <Dinero cobre={x.medianCopper} /></div>)}
            </div>
          ) : null}
          <div style={{ color: C.texto3 }}>{cp(lang, 'Esta consulta no crea equivalencia con ningún anuncio de Auctionator.', 'This lookup creates no equivalence with any Auctionator listing.')}</div>
        </div>
      </details>
    </div>
  )
}

/**
 * Consulta explícita y separada desde el detalle de Auctionator. No recibe el
 * ítem seleccionado: no hay preselección ni cruce por reino/ID base. El usuario
 * elige reino y variante TSM a mano; sin esa elección no se muestra ningún dato.
 */
export function ConsultaValoracionTsm({ snapshot, lang, ahoraMs }) {
  const realms = Array.isArray(snapshot?.realms) ? snapshot.realms : []
  const [selection, setSelection] = useState(null)
  // La autorización manual pertenece a este snapshot, no a futuras importaciones.
  const realm = selection?.snapshot === snapshot ? selection.realm : ''
  const itemString = selection?.snapshot === snapshot ? selection.itemString : ''
  useEffect(() => { setSelection(null) }, [snapshot])
  const variantes = useMemo(() => {
    const r = realms.find((x) => x?.name === realm)
    const vistos = new Set()
    for (const rec of r?.records || []) {
      if (rec?.kind === 'sale' && rec?.source === 'Auction' && typeof rec.itemString === 'string') vistos.add(rec.itemString)
    }
    return [...vistos].sort()
  }, [realm, snapshot])
  const valoracion = useMemo(() => {
    if (!realm || !itemString || !snapshot) return null
    try { return valorarTsm(snapshot, realm, itemString, { nowMs: ahoraMs }) } catch { return null }
  }, [realm, itemString, snapshot, ahoraMs])
  return (
    <details data-testid="detalle-tsm-consulta" style={{ marginTop: 8 }}>
      <summary style={resumenStyle}>
        {cp(lang, 'Consultar mi fuente TSM por separado', 'Look up my TSM source separately')}
      </summary>
      <div style={detalleStyle}>
        <div style={{ color: C.amarillo }}>
          {cp(lang, 'Elegir aquí una variante de TSM no la enlaza con el objeto abierto ni mezcla sus cifras con las de Auctionator.', 'Choosing a TSM variant here does not link it to the open item or mix its figures with Auctionator figures.')}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          <label style={S.campo}>
            {cp(lang, 'Reino TSM', 'TSM realm')}
            <select data-testid="detalle-tsm-reino" aria-label={cp(lang, 'Reino TSM', 'TSM realm')} value={realm}
              onChange={(e) => setSelection({ snapshot, realm: e.target.value, itemString: '' })}>
              <option value="">—</option>
              {realms.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
            </select>
          </label>
          <label style={S.campo}>
            {cp(lang, 'Variante TSM (literal)', 'TSM variant (literal)')}
            <select data-testid="detalle-tsm-item" aria-label={cp(lang, 'Variante TSM (literal)', 'TSM variant (literal)')}
              value={itemString} onChange={(e) => setSelection({ snapshot, realm, itemString: e.target.value })}>
              <option value="">—</option>
              {variantes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
        {valoracion
          ? <div data-testid="detalle-tsm-valoracion" style={{ marginTop: 8 }}>
              <ValoracionPersonal valoracion={valoracion} lang={lang} ahoraMs={ahoraMs} id="detalle-tsm-valoracion-fila" />
            </div>
          : <div style={{ color: C.texto3, marginTop: 6 }}>
              {cp(lang, 'Sin selección TSM: no se muestra ningún dato de mis ventas.', 'No TSM selection: no sales data is shown.')}
            </div>}
        {!snapshot
          ? <div style={{ color: C.texto3, marginTop: 6 }}>{cp(lang, 'Importa mis ventas desde la pestaña Mercado para habilitar esta consulta.', 'Import my sales from the Market tab to enable this lookup.')}</div>
          : null}
      </div>
    </details>
  )
}
