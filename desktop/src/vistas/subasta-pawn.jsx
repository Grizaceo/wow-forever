// Subasta × Pawn: rankea las ofertas del snapshot de Auctionator por lo que
// valen PARA ESTE PERSONAJE según sus propios pesos Pawn.
//
// La tabla NO la produce un modelo: la produce `desktop/src/subasta-pawn.js` con
// una fórmula declarada (score = Σ stats·pesos, delta contra el ítem equipado del
// slot, plata por punto = precio/100/delta, orden delta DESC y empate itemID ASC).
// Esta vista solo presenta, declara procedencia y dice lo que falta. Sin red en
// tiempo de ejecución: todo sale del puente y de subasta ya importada.
import { useEffect, useMemo, useState } from 'react'
import { D } from '../datos.js'
import { C, S } from '../estilos.js'
import { agregarTextos, t } from '../i18n.js'
import { Aviso, Dinero, IconoItem, Tarjeta } from '../ui.jsx'
import { catalogoMercado, nombreItem, snapshotVisible } from '../mercado-logica.js'
import { lerPawn } from '../pawn.js'
import { estadoPawnStats, lerPawnStats } from '../item-stats.js'
import { MOTIVOS, rankear } from '../subasta-pawn.js'

agregarTextos({
  'subasta.titulo': 'Subasta × Pawn',
  'subasta.aviso': 'Ranking por fórmula con tus pesos Pawn. No es una recomendación, no es DPS y no predice precios.',
  'subasta.formula': 'score = Σ stats × pesos · delta = score del ítem − score de lo que llevás en su slot · plata/punto = (precio ÷ 100) ÷ delta · orden delta DESC, empate itemID ASC.',
  'subasta.leyendo': 'Leyendo la captura de Pawn y el catálogo de stats…',
  'subasta.sin-escala': 'SIN DATOS · sin pesos Pawn',
  'subasta.sin-escala.ayuda': 'El addon no capturó la escala activa. Entrá al mundo con Pawn activo y ejecutá /wfbpawn. Sin tus pesos no hay nada que rankear.',
  'subasta.sin-catalogo': 'SIN DATOS · sin catálogo de stats de ítems',
  'subasta.sin-catalogo.ayuda': 'El addon todavía no cosechó los stats de los ítems. En el juego: /wfbp catalogo y después /reload para que se escriba el SavedVariables.',
  'subasta.sin-ofertas': 'SIN DATOS · sin ofertas importadas',
  'subasta.sin-ofertas.ayuda': 'Importá los precios de Auctionator en la pestaña Mercado; esta vista usa ese mismo snapshot.',
  'subasta.col.item': 'Ítem',
  'subasta.col.slot': 'Slot',
  'subasta.col.ilvl': 'ilvl',
  'subasta.col.precio': 'Precio',
  'subasta.col.score': 'Score',
  'subasta.col.delta': 'Δ vs. puesto',
  'subasta.col.punto': 'Plata por punto',
  'subasta.resumen': '{ofertas} ofertas · {items} ítems · {incluidos} en la tabla · {excluidos} excluidas',
  'subasta.sin-punto': '—',
  'subasta.base.vacio': 'slot vacío',
  'subasta.base.equipado': 'contra #{id} (slot {slot})',
  'subasta.sin-peso': 'Sin peso en tu escala: {stats}',
  'subasta.sin-mapa': 'Stats que Pawn no puntúa: {stats}',
  'subasta.procedencia': 'Procedencia',
  'subasta.proc.escala': 'Escala Pawn: {nome} · capturada {fecha}',
  'subasta.proc.sin-escala': 'Escala Pawn: sin captura',
  'subasta.proc.stats': 'Catálogo de stats: {n} ítems · cosechado {fecha}',
  'subasta.proc.sin-stats': 'Catálogo de stats: vacío',
  'subasta.proc.ficha': 'Subasta: {reino} · {n} claves · snapshot {fecha}',
  'subasta.excluidas': 'Excluidas ({n})',
  'subasta.excluidas.por': '{n} × {motivo}',
  'subasta.motivo.sin-stats': 'sin stats cosechados',
  'subasta.motivo.sin-slot': 'slot no reconocido',
  'subasta.motivo.precio-invalido': 'precio inválido',
  'subasta.motivo.sin-equipado-stats': 'lo puesto no tiene stats: comparación a ciegas',
  'subasta.reino': 'Realm de subasta',
  'subasta.recorte': 'Se muestran las {n} primeras filas; el resto se recortó por tamaño.',
}, {
  'subasta.titulo': 'Auction × Pawn',
  'subasta.aviso': 'Ranking by formula with your Pawn weights. Not a recommendation, not DPS, and it does not predict prices.',
  'subasta.formula': 'score = Σ stats × weights · delta = item score − score of what you wear in its slot · gold per point = (price ÷ 100) ÷ delta · order delta DESC, tie itemID ASC.',
  'subasta.leyendo': 'Reading the Pawn capture and the stat catalog…',
  'subasta.sin-escala': 'NO DATA · no Pawn weights',
  'subasta.sin-escala.ayuda': 'The addon has not captured the active scale. Enter the world with Pawn enabled and run /wfbpawn. Without your weights there is nothing to rank.',
  'subasta.sin-catalogo': 'NO DATA · no item stat catalog',
  'subasta.sin-catalogo.ayuda': 'The addon has not harvested item stats yet. In game: /wfbp catalogo then /reload so the SavedVariables is written.',
  'subasta.sin-ofertas': 'NO DATA · no imported auctions',
  'subasta.sin-ofertas.ayuda': 'Import Auctionator prices in the Market tab; this view uses that same snapshot.',
  'subasta.col.item': 'Item',
  'subasta.col.slot': 'Slot',
  'subasta.col.ilvl': 'ilvl',
  'subasta.col.precio': 'Price',
  'subasta.col.score': 'Score',
  'subasta.col.delta': 'Δ vs. worn',
  'subasta.col.punto': 'Gold per point',
  'subasta.resumen': '{ofertas} auctions · {items} items · {incluidos} in table · {excluidos} excluded',
  'subasta.sin-punto': '—',
  'subasta.base.vacio': 'empty slot',
  'subasta.base.equipado': 'vs. #{id} (slot {slot})',
  'subasta.sin-peso': 'Not weighted in your scale: {stats}',
  'subasta.sin-mapa': 'Stats Pawn does not score: {stats}',
  'subasta.procedencia': 'Provenance',
  'subasta.proc.escala': 'Pawn scale: {nome} · captured {fecha}',
  'subasta.proc.sin-escala': 'Pawn scale: no capture',
  'subasta.proc.stats': 'Stat catalog: {n} items · harvested {fecha}',
  'subasta.proc.sin-stats': 'Stat catalog: empty',
  'subasta.proc.ficha': 'Auctions: {reino} · {n} keys · snapshot {fecha}',
  'subasta.excluidas': 'Excluded ({n})',
  'subasta.excluidas.por': '{n} × {motivo}',
  'subasta.motivo.sin-stats': 'no harvested stats',
  'subasta.motivo.sin-slot': 'unrecognized slot',
  'subasta.motivo.precio-invalido': 'invalid price',
  'subasta.motivo.sin-equipado-stats': 'worn item has no stats: blind comparison',
  'subasta.reino': 'Auction realm',
  'subasta.recorte': 'Showing the first {n} rows; the rest was trimmed for size.',
})

// Catálogo de nombres/iconos: la misma fuente que la pestaña Mercado.
const CATALOGO = catalogoMercado(D.items, D.dungeons)

const dia = (ts) => (Number.isSafeInteger(ts) && ts > 0 ? new Date(ts * 1000).toISOString().slice(0, 10) : '—')
const lista = (xs) => xs.map(x => `${x.stat} ${x.valor}`).join(', ')

const MOTIVO_TEXTO = {
  [MOTIVOS.SIN_STATS]: 'subasta.motivo.sin-stats',
  [MOTIVOS.SIN_SLOT]: 'subasta.motivo.sin-slot',
  [MOTIVOS.PRECIO_INVALIDO]: 'subasta.motivo.precio-invalido',
  [MOTIVOS.SIN_EQUIPADO_STATS]: 'subasta.motivo.sin-equipado-stats',
}

export function VistaSubastaPawn({ ctx, mercado, historial, perfil, lang }) {
  const snapshot = useMemo(() => snapshotVisible(mercado, historial), [mercado, historial])
  const reinos = snapshot?.realms || []
  const [reino, setReino] = useState('')
  // El reino elegido sigue válido; si no, el del perfil; si no, el primero.
  const realm = reinos.find(r => r.name === reino) || reinos.find(r => r.name === perfil?.reino) || reinos[0] || null

  const [captura, setCaptura] = useState(null)
  const [stats, setStats] = useState(null)
  const [leyendo, setLeyendo] = useState(true)
  useEffect(() => {
    let vivo = true
    Promise.all([lerPawn(ctx), lerPawnStats(ctx)]).then(([p, s]) => {
      if (!vivo) return
      setCaptura(p)
      setStats(s && typeof s === 'object' ? s : null)
      setLeyendo(false)
    }).catch(() => { if (vivo) { setCaptura(null); setStats(null); setLeyendo(false) } })
    return () => { vivo = false }
  }, [ctx])

  const ofertas = useMemo(() => (realm?.items || []).map(i => ({ itemId: i.itemId, unitPriceCopper: i.unitPriceCopper })), [realm])
  const r = useMemo(() => rankear({ ofertas, escala: captura, equipado: captura?.equipado, catalogo: stats }), [ofertas, captura, stats])

  // El catálogo guardado puede estar vacío pero existir: se informa igual.
  const ficha = useMemo(() => {
    try { return estadoPawnStats(stats, null) } catch { return estadoPawnStats(null, null) }
  }, [stats])

  const nombre = (id) => nombreItem({ itemId: id, sourceKey: String(id) }, D.items, CATALOGO, lang) || '#' + id
  const porMotivo = r.estado === 'listo' ? r.resumen.porMotivo || {} : {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Aviso>{t(lang, 'subasta.aviso')}</Aviso>
      <div style={S.sub}>{t(lang, 'subasta.formula')}</div>

      {reinos.length > 1 ? (
        <label style={S.campo}>
          <span style={S.sub}>{t(lang, 'subasta.reino')}</span>
          <select aria-label={t(lang, 'subasta.reino')} value={realm?.name || ''} onChange={e => setReino(e.target.value)}>
            {reinos.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}
          </select>
        </label>
      ) : null}

      {leyendo ? <p role="status" style={S.sub}>{t(lang, 'subasta.leyendo')}</p> : null}

      {!leyendo && r.estado !== 'listo' ? (
        <Tarjeta titulo={t(lang, 'subasta.' + (r.motivo === MOTIVOS.SIN_ESCALA ? 'sin-escala' : r.motivo === MOTIVOS.SIN_CATALOGO ? 'sin-catalogo' : 'sin-ofertas'))}>
          <p style={S.sub}>
            {t(lang, 'subasta.' + (r.motivo === MOTIVOS.SIN_ESCALA ? 'sin-escala' : r.motivo === MOTIVOS.SIN_CATALOGO ? 'sin-catalogo' : 'sin-ofertas') + '.ayuda')}
          </p>
        </Tarjeta>
      ) : null}

      {!leyendo && r.estado === 'listo' ? (
        <Tarjeta titulo={`${t(lang, 'subasta.titulo')} · ${realm?.name || '—'}`}
          extra={<span style={S.sub}>{t(lang, 'subasta.resumen', r.resumen)}</span>}>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.tabla}>
              <thead>
                <tr>
                  <th style={S.th}>{t(lang, 'subasta.col.item')}</th>
                  <th style={S.th}>{t(lang, 'subasta.col.slot')}</th>
                  <th style={S.th}>{t(lang, 'subasta.col.ilvl')}</th>
                  <th style={S.th}>{t(lang, 'subasta.col.precio')}</th>
                  <th style={S.th}>{t(lang, 'subasta.col.score')}</th>
                  <th style={S.th}>{t(lang, 'subasta.col.delta')}</th>
                  <th style={S.th}>{t(lang, 'subasta.col.punto')}</th>
                </tr>
              </thead>
              <tbody>
                {r.filas.map(f => (
                  <tr key={f.itemID} data-item={f.itemID}>
                    <td style={S.td}>
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <IconoItem id={f.itemID} size={20} titulo={nombre(f.itemID)} />
                        <span>{nombre(f.itemID)}</span>
                      </span>
                      {f.sinPeso && f.sinPeso.length ? <div style={{ ...S.sub, color: C.texto3 }}>{t(lang, 'subasta.sin-peso', { stats: lista(f.sinPeso) })}</div> : null}
                      {f.sinMapa && f.sinMapa.length ? <div style={{ ...S.sub, color: C.texto3 }}>{t(lang, 'subasta.sin-mapa', { stats: lista(f.sinMapa) })}</div> : null}
                    </td>
                    <td style={S.td}>{f.slot}</td>
                    <td style={S.td}>{f.ilvl ?? '—'}</td>
                    <td style={S.td}><Dinero cobre={f.precio} /></td>
                    <td style={S.td}>{f.score}</td>
                    <td style={S.td} title={t(lang, 'subasta.base.' + (f.baseTipo === 'equipado' ? 'equipado' : 'vacio'), { id: f.baseItemID, slot: f.baseSlot })}>
                      {f.delta > 0 ? '+' : ''}{f.delta}
                    </td>
                    <td style={S.td}>{f.plataPorPunto === null ? t(lang, 'subasta.sin-punto') : f.plataPorPunto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.resumen.recortados > 0 ? <div style={S.sub}>{t(lang, 'subasta.recorte', { n: r.filas.length })}</div> : null}
        </Tarjeta>
      ) : null}

      {!leyendo && r.estado === 'listo' && r.excluidos.length ? (
        <details>
          <summary style={{ cursor: 'pointer', ...S.sub }}>{t(lang, 'subasta.excluidas', { n: r.excluidos.length })}</summary>
          <ul style={S.sub}>
            {Object.entries(porMotivo).map(([m, n]) => (
              <li key={m}>{t(lang, 'subasta.excluidas.por', { n, motivo: t(lang, MOTIVO_TEXTO[m] || m) })}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {!leyendo ? (
        <Tarjeta titulo={t(lang, 'subasta.procedencia')}>
          <div style={S.sub}>
            {captura && captura.pesos && Object.keys(captura.pesos).length
              ? t(lang, 'subasta.proc.escala', { nome: captura.localized || captura.escala || '—', fecha: dia(captura.capturado) })
              : t(lang, 'subasta.proc.sin-escala')}
          </div>
          <div style={S.sub}>
            {ficha.colhido
              ? t(lang, 'subasta.proc.stats', { n: Object.keys(ficha.itens || {}).length, fecha: dia(ficha.colhido) })
              : t(lang, 'subasta.proc.sin-stats')}
          </div>
          <div style={S.sub}>
            {t(lang, 'subasta.proc.ficha', {
              reino: realm?.name || '—',
              n: (realm?.items || []).length,
              fecha: dia(snapshot?.importedAt ? Math.floor(new Date(snapshot.importedAt).getTime() / 1000) : 0),
            })}
          </div>
        </Tarjeta>
      ) : null}
    </div>
  )
}
