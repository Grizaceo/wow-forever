// Extras / AH (viewExtras de index.html): lista de compras de subasta,
// tips de clase y aviso sobre el servidor.
import { t, agregarTextos } from '../../i18n.js'
import { Origen, Tarjeta, TextoRico } from '../../ui.jsx'
import { Detalle, Icono, NombreCalidad, P } from './piezas.jsx'

agregarTextos({
  'guia.extras.tipsN': '{n} tips',
  'guia.extras.servidor': 'Sobre el servidor "Forever"',
  'guia.extras.contexto': 'contexto del servidor',
}, {
  'guia.extras.tipsN': '{n} tips',
  'guia.extras.servidor': 'About the "Forever" server',
  'guia.extras.contexto': 'server context',
})

export function VistaExtras({ v, lang }) {
  const { G } = v
  const X = G.extras || {}
  const ah = G.ahList || []
  const tips = X.tips || []
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 12, alignItems: 'start' }}>
        <Tarjeta titulo={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icono n="coin" size={14} />{X.ahTitle || t(lang, 'tab.mercado')}</span>}
          extra={<Origen f="curado" lang={lang} />}>
          {ah.map((a, i) => (
            <div key={i} style={{ ...P.loot, ...(i === ah.length - 1 ? P.lootSinBorde : {}) }}>
              <span><NombreCalidad q="rare"><b>{a[0]}</b></NombreCalidad> <span style={P.muted}><TextoRico html={a[1]} /></span></span>
              {a[2] ? <span style={{ ...P.muted, textAlign: 'right', maxWidth: '45%', flexShrink: 0 }}><TextoRico html={a[2]} /></span> : null}
            </div>
          ))}
          {!ah.length ? <div style={P.muted}>—</div> : null}
        </Tarjeta>

        <Detalle titulo={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icono n="scroll" size={14} />{X.tipsTitle || ''}</span>}
          meta={t(lang, 'guia.extras.tipsN', { n: tips.length })} extra={<Origen f="curado" lang={lang} />}>
          {tips.map((tip, i) => (
            <div key={i} style={{ ...P.mst, ...(i === tips.length - 1 ? P.mstUlt : {}) }}>
              <span style={P.tdot} />
              <span style={P.mstTxt}><b><TextoRico html={tip[0]} /></b> <TextoRico html={tip[1]} /></span>
            </div>
          ))}
        </Detalle>
      </div>

      <Detalle titulo={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icono n="alert" size={14} />{t(lang, 'guia.extras.servidor')}</span>}
        meta={t(lang, 'guia.extras.contexto')} extra={<Origen f="curado" lang={lang} />}>
        <div style={P.muted}><TextoRico html={X.warn || ''} /></div>
      </Detalle>
    </>
  )
}
