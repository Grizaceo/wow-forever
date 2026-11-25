// Detalle de un ítem del scan: precio actual, estadísticas del historial,
// análisis de oferta, gráfico SVG, historial diario, fuentes documentadas del
// catálogo (dungeons.json), fuentes del dataset de drops (drop-data.js) y
// fuentes de farmeo del motor. Port de paintDetail de market-ui.js.
import { useEffect, useMemo, useState } from 'react'
import { S } from '../../estilos.js'
import { D, nombre } from '../../datos.js'
import { t } from '../../i18n.js'
import { Dinero, Hueco, Origen, Tarjeta } from '../../ui.jsx'
import { HunterHistory, Farm, fuentesItem, fuentesDropData, nombreItem, fmtDia, fechaDe, EPOCH } from '../../mercado-logica.js'
import { GraficoPrecios } from './grafico.jsx'
import { RutaFarmeo } from './ruta-farmeo.jsx'
import { ConsultaValoracionTsm, edadSeg } from './valoracion-personal.jsx'

const TENDENCIA = { sube: 'mercado.tend.sube', baja: 'mercado.tend.baja', estable: 'mercado.tend.estable', 'sin-datos': 'mercado.tend.pocos' }
const KIND_DROP = { mob: '', skin: 'Piel: ', pick: 'Pillosidad: ', object: 'Objeto: ' }

function fmtPct(v) { return v == null ? '—' : `${Math.round(v * 100)}%` }

export function DetalleItem({ item, lang, catalogo, metrica, deal, onCerrar, tsmSnapshot = null, ahoraMs: relojExterno }) {
  const [relojLocal, setRelojLocal] = useState(() => Date.now())
  useEffect(() => {
    if (relojExterno != null) return
    const id = setInterval(() => setRelojLocal(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [relojExterno])
  const ahoraMs = relojExterno ?? relojLocal
  const stats = useMemo(() => HunterHistory.priceStats(item), [item])
  const catEntry = useMemo(() => (item?.itemId != null ? catalogo?.items?.[String(item.itemId)] : null), [item, catalogo])
  const fuentes = useMemo(() => (catEntry ? fuentesItem(catEntry, D.dungeons) : []), [catEntry])
  const drops = useMemo(() => fuentesDropData(item?.itemId, D.dropData), [item])
  const fss = useMemo(() => (metrica?.sources?.length
    ? [...metrica.sources].sort((a, b) => Number(b.eligible) - Number(a.eligible) || (b.gph || 0) - (a.gph || 0)).slice(0, 10)
    : []), [metrica])
  const historial = useMemo(() => (item?.history || []).slice().sort((a, b) => b.day - a.day), [item])
  // El historial de Auctionator usa días del EPOCH de la app (2020-01-01), no
  // días unix: se fecha con los mismos helpers que la tabla diaria de abajo.
  const diaObs = historial[0]?.day
  const diaObsFecha = Number.isSafeInteger(diaObs) ? fechaDe(diaObs) : null
  const diaObsSeg = Number.isSafeInteger(diaObs) ? EPOCH / 1000 + diaObs * 86400 : null
  const ofertaMax = historial[0]?.available ?? null
  if (!item) return null
  const nombreVisible = nombreItem(item, D.items, catalogo, lang) || item.sourceKey
  const esVariante = item.itemId == null
  const fmt = Farm.fmt || {}
  const dealKind = deal?.kind
  const verdict = dealKind === 'oferta' ? t(lang, 'mercado.deal.oferta')
    : dealKind === 'sobreprecio' ? t(lang, 'mercado.deal.sobreprecio')
    : dealKind === 'estable' ? t(lang, 'mercado.deal.estable') : null

  return (
    <Tarjeta titulo={`${nombreVisible} · ${item.sourceKey}`}
      extra={onCerrar ? <button type="button" onClick={onCerrar} style={{ ...S.etiqueta, cursor: 'pointer' }}>{t(lang, 'mercado.cerrar')}</button> : null}>
      <p style={S.sub}>
        {t(lang, 'mercado.det.ultimo')}: <Dinero cobre={item.unitPriceCopper} />. {t(lang, 'mercado.det.aviso')}
        {metrica?.doubtful ? ` ${t(lang, 'mercado.det.dudoso')}` : ''}
        {esVariante ? ` ${t(lang, 'mercado.det.variante')}` : ''}
      </p>

      <p style={S.sub} data-testid="detalle-anuncios">
        {diaObsFecha == null
          ? (lang === 'en' ? 'Last day seen by Auctionator: no data' : 'Último día visto por Auctionator: sin datos')
          : `${lang === 'en' ? 'Last day seen by Auctionator' : 'Último día visto por Auctionator'}: ${diaObsFecha} · ${edadSeg(diaObsSeg, ahoraMs, lang)}`}
        {'. '}{lang === 'en' ? 'Highest listed that day' : 'Máximo anunciado ese día'}: {ofertaMax == null
          ? (lang === 'en' ? 'no data' : 'sin datos')
          : `${ofertaMax} ${lang === 'en' ? 'units' : 'unidades'}`}
        {lang === 'en' ? '. Listings, not sales or current stock.' : '. Son anuncios, no ventas ni existencias actuales.'}
      </p>

      {stats?.diasMuestra > 0 && (
        <p style={S.sub}>
          {t(lang, 'mercado.det.historial')}: {stats.diasMuestra}d ·
          {' '}{t(lang, 'mercado.det.minimo')} <Dinero cobre={stats.minLow} /> ·
          {' '}{t(lang, 'mercado.det.mediana')} <Dinero cobre={stats.medianaLow} /> ·
          {' '}{t(lang, 'mercado.det.promedio')} <Dinero cobre={stats.avgLow} /> ·
          {' '}{t(lang, TENDENCIA[stats.tendencia] || 'mercado.tend.pocos')}
        </p>
      )}

      {verdict && (
        <p style={S.sub}>
          {t(lang, 'mercado.det.analisis')}: <b>{verdict}</b>
          {deal?.medianaLow != null ? <> — {t(lang, 'mercado.det.mediana')} <Dinero cobre={deal.medianaLow} /></> : null}
          {deal?.minLow != null ? <> · {t(lang, 'mercado.det.minimo')} <Dinero cobre={deal.minLow} /></> : null}
          {deal?.days ? ` · ${deal.days}d` : ''}
          {deal?.available != null ? ` · ${deal.available} ${t(lang, 'mercado.det.ofertas')}` : ''}.
          {(deal?.reasons || []).length ? ` ${deal.reasons.join(' ')}` : ''}
        </p>
      )}

      <div>
        <h4 style={{ ...S.titulo, fontSize: 12, margin: '4px 0' }}>{t(lang, 'mercado.det.grafico')}</h4>
        <GraficoPrecios history={item.history} actual={item.unitPriceCopper} lang={lang} />
        <p style={S.sub}>{t(lang, 'mercado.det.graficoNota')}</p>
      </div>

      <div>
        <h4 style={{ ...S.titulo, fontSize: 12, margin: '4px 0' }}>{t(lang, 'mercado.det.diario')}</h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={S.tabla}>
            <thead><tr>
              <th style={S.th}>{t(lang, 'mercado.det.dia')}</th>
              <th style={S.th}>{t(lang, 'mercado.det.minDiario')}</th>
              <th style={S.th}>{t(lang, 'mercado.det.maxMin')}</th>
              <th style={S.th}>{t(lang, 'mercado.det.maxOferta')}</th>
            </tr></thead>
            <tbody>
              {historial.length ? historial.map((h) => (
                <tr key={h.day}>
                  <td style={S.td}>{fmtDia(h.day)}</td>
                  <td style={S.td}><Dinero cobre={h.low} /></td>
                  <td style={S.td}><Dinero cobre={h.high} /></td>
                  <td style={S.td}>{h.available == null ? t(lang, 'mercado.det.sinDato') : h.available}</td>
                </tr>
              )) : <tr><td style={S.td} colSpan={4}>{t(lang, 'mercado.det.sinHistorialFila')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h4 style={{ ...S.titulo, fontSize: 12, margin: '4px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
          {t(lang, 'mercado.det.fuentes')}
          <Origen f={['cmangos-1.12', 'cliente-forever']} lang={lang} />
        </h4>
        {fuentes.length ? (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
            {fuentes.map((s, i) => (
              <li key={i}>
                {nombre(s.bossN || { es: s.boss, en: s.boss }, lang) || s.boss} · {nombre(s.dungeonN || { es: s.dungeon, en: s.dungeon }, lang) || s.dungeon}
                {s.location ? ` · ${nombre({ es: s.dungeonN?.es || s.location, en: s.dungeonN?.en || s.location }, lang)}` : ''}
                {s.levelMin != null && s.levelMax != null ? ` · ${t(lang, 'mercado.det.rangoGrupo', { min: s.levelMin, max: s.levelMax })}` : ''}
                <div style={S.etiqueta}>{s.reference}</div>
              </li>
            ))}
          </ul>
        ) : <Hueco lang={lang}>{t(lang, 'mercado.det.sinFuente')}</Hueco>}
        <p style={S.sub}>{t(lang, 'mercado.det.fuentesNota')}</p>
      </div>

      <div>
        <h4 style={{ ...S.titulo, fontSize: 12, margin: '4px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
          {t(lang, 'mercado.det.drops')}
          <Origen f="cmangos-1.12" lang={lang} />
        </h4>
        {drops.length ? (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
            {drops.slice(0, 20).map((s, i) => (
              <li key={i}>
                {KIND_DROP[s.kind || (s.tipo === 'o' ? 'object' : 'mob')] || ''}{s.nombre || `#${s.id}`}
                {s.objKind ? ` (${s.objKind})` : ''}
                {s.nivelMin != null ? ` · nv ${s.nivelMin}${s.nivelMax != null && s.nivelMax !== s.nivelMin ? `–${s.nivelMax}` : ''}` : ''}
                {s.chance != null ? ` · ${fmtPct(s.chance / 100)} ${t(lang, 'mercado.det.cadaMuerte')}` : ''}
                {s.minC != null && s.maxC != null && s.maxC !== s.minC ? ` · ${s.minC}–${s.maxC}` : ''}
                {s.zonas.length ? (
                  <div style={S.etiqueta}>
                    {s.zonas.slice(0, 4).map((z) => z.nombre).join(' · ')}
                    {s.zonas.length > 4 ? ` +${s.zonas.length - 4}` : ''}
                  </div>
                ) : null}
              </li>
            ))}
            {drops.length > 20 ? <li style={S.etiqueta}>+{drops.length - 20}</li> : null}
          </ul>
        ) : <Hueco lang={lang}>{t(lang, 'mercado.det.sinDrops')}</Hueco>}
      </div>

      {fss.length > 0 && (
        <div>
          <h4 style={{ ...S.titulo, fontSize: 12, margin: '4px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
            {t(lang, 'mercado.det.farmeo')}
            <Origen f="cmangos-1.12" lang={lang} />
          </h4>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
            {fss.map((s, i) => (
              <li key={i}>
                {fmt.srcLabel ? fmt.srcLabel(s) : `${s.name || '#' + s.id}`}
                {s.zoneKey != null && fmt.zoneName ? ` · ${fmt.zoneName(s.zoneKey)}` : ''}
                {s.eligible
                  ? ` · ${fmt.pct ? fmt.pct(s.chance) : fmtPct(s.chance)} · ~${fmt.gph ? fmt.gph(s.gph) : s.gph}/h${s.roi != null ? ` · ${lang === 'en' ? 'Margin vs target gold/h' : 'Margen frente al oro/h objetivo'} ${s.roi >= 0 ? '+' : ''}${Math.round(s.roi * 100)}%` : ''}`
                  : ` — ${s.reason || t(lang, 'mercado.det.noElegible')}`}
                <RutaFarmeo fuente={s} fmt={fmt} lang={lang} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div data-testid="detalle-tsm" style={{ marginTop: 10 }}>
        <h4 style={{ ...S.titulo, fontSize: 12, margin: '4px 0' }}>
          {lang === 'en' ? 'My TSM sales · separate source' : 'Mis ventas TSM · fuente separada'}
        </h4>
        <p style={S.sub}>
          {lang === 'en'
            ? 'TSM and Auctionator are shown separately: this Auctionator item is not linked to your TSM sales, and their figures are not mixed. The daily maximum offer above counts listings, not sales.'
            : 'TSM y Auctionator se muestran por separado: este objeto de Auctionator no se enlaza con tus ventas TSM ni se mezclan sus cifras. La oferta máxima diaria de arriba son anuncios, no ventas.'}
        </p>
        <ConsultaValoracionTsm snapshot={tsmSnapshot} lang={lang} ahoraMs={ahoraMs} />
      </div>

      <p style={S.sub}>
        {t(lang, 'mercado.det.cobertura', { addon: catalogo?.source?.addon || t(lang, 'mercado.det.sinCatalogo') })}
        {' '}{catalogo?.source?.coverage || ''}
      </p>
    </Tarjeta>
  )
}
