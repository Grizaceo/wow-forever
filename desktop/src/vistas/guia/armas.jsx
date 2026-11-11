// Armas (viewWeapons de index.html): tabla de armas de la facción con filtro
// por tipo, "ocultar obtenidas" y tilde de "la tengo" (sincroniza loot de
// dungeons en build.gear, como setWeaponOwned).
import { Checkbox } from '@hermes/plugin-sdk'
import { C, S } from '../../estilos.js'
import { t, agregarTextos } from '../../i18n.js'
import { Origen, Tarjeta, TextoRico } from '../../ui.jsx'
import { fmtDps, setWeaponOwnedEstado, wfOf } from '../../guia-logica.js'
import { NombreCalidad, P, Placa } from './piezas.jsx'

agregarTextos({
  'guia.armas.arma': 'Arma', 'guia.armas.tipo': 'Tipo', 'guia.armas.dps': 'DPS', 'guia.armas.req': 'Req',
  'guia.armas.delta': 'Δ vs tuya', 'guia.armas.fuente': 'Fuente',
  'guia.armas.ocultar': 'ocultar obtenidas', 'guia.armas.obtenidas': 'obtenidas:',
  'guia.armas.equipada': 'equipada', 'guia.armas.approx': '~ = dps aproximado. Forever puede haber retocado algún stat — verificá in-game.',
  'guia.armas.vacia': 'Ningún arma coincide con el filtro.',
}, {
  'guia.armas.arma': 'Weapon', 'guia.armas.tipo': 'Type', 'guia.armas.dps': 'DPS', 'guia.armas.req': 'Req',
  'guia.armas.delta': 'Δ vs yours', 'guia.armas.fuente': 'Source',
  'guia.armas.ocultar': 'hide owned', 'guia.armas.obtenidas': 'owned:',
  'guia.armas.equipada': 'equipped', 'guia.armas.approx': '~ = approximate dps. Forever may have retuned some stats — verify in-game.',
  'guia.armas.vacia': 'No weapon matches the filter.',
})

const btnFiltro = (activo) => ({
  ...P.chipBtn,
  ...(activo ? { borderColor: C.acento, color: C.acento, fontWeight: 600 } : {}),
})

export function VistaArmas({ v, lang }) {
  const { G, build, guardar, os, dps, weapons, tipos } = v

  let list = weapons.filter((w) => build.wf === 'all' || wfOf(w) === build.wf)
  if (build.who) list = list.filter((w) => !os.has(w.id))
  list = list.slice().sort((a, b) => a.lvl - b.lvl || a.dps - b.dps)
  const cnt = weapons.filter((w) => os.has(w.id)).length

  const toggleW = (w, checked) => guardar((b) => {
    const r = setWeaponOwnedEstado(b, w.id, checked, { weapons, dungeons: G.dungeons || [] })
    return { ...b, owned: r.owned, gear: r.gear }
  })

  return (
    <Tarjeta extra={<Origen f="curado" lang={lang} />}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {(G.typeFilters || []).map((f) => (
          <button key={f[0]} type="button" style={btnFiltro(build.wf === f[0])}
            onClick={() => guardar((b) => ({ ...b, wf: f[0] }))}>{f[1]}</button>
        ))}
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8, cursor: 'pointer', fontSize: 12, color: C.texto2 }}>
          <Checkbox checked={!!build.who} onCheckedChange={(val) => guardar((b) => ({ ...b, who: !!val }))} />
          {t(lang, 'guia.armas.ocultar')}
        </label>
        <span style={{ ...P.muted, marginLeft: 'auto' }}>{t(lang, 'guia.armas.obtenidas')} <b>{cnt}/{weapons.length}</b></span>
      </div>

      <div style={P.tablaScroll}>
        <table style={S.tabla}>
          <thead>
            <tr>
              <th style={S.th} />
              <th style={S.th}>{t(lang, 'guia.armas.arma')}</th>
              <th style={S.th}>{t(lang, 'guia.armas.tipo')}</th>
              <th style={S.th}>{t(lang, 'guia.armas.dps')}</th>
              <th style={S.th}>{t(lang, 'guia.armas.req')}</th>
              <th style={S.th}>{t(lang, 'guia.armas.delta')}</th>
              <th style={S.th}>{t(lang, 'guia.armas.fuente')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((w) => {
              const own = os.has(w.id), eq = build.cur === w.id, dlt = w.dps - dps
              return (
                <tr key={w.id} className={(own ? 'owned ' : '') + (eq ? 'equipped' : '')} style={{ ...(own ? P.trOwned : {}), ...(eq ? P.trEq : {}) }}>
                  <td style={S.td}>
                    <Checkbox data-wid={w.id} checked={own} onCheckedChange={(val) => toggleW(w, val)} />
                  </td>
                  <td style={S.td}>
                    <NombreCalidad q={w.q}><b>{w.n}</b></NombreCalidad>
                    {eq ? <Placa tono="eq">{t(lang, 'guia.armas.equipada')}</Placa> : null}
                    {w.note ? <div style={{ ...P.muted, fontSize: 11 }}><i><TextoRico html={w.note} /></i></div> : null}
                  </td>
                  <td style={S.td}>{tipos[w.t] || w.t}{w.eng ? <Placa tono="eng" estilo={{ marginLeft: 4 }}>ENG</Placa> : null}</td>
                  <td style={S.td}><b>{fmtDps(w)}</b></td>
                  <td style={S.td}>{w.lvl}</td>
                  <td style={{ ...S.td, color: dlt > 0 ? C.verde : C.texto3 }}>{dps ? (dlt > 0 ? '+' : '') + dlt.toFixed(1) : '—'}</td>
                  <td style={{ ...S.td, ...P.muted }}><TextoRico html={w.src} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!list.length ? <div style={{ ...P.muted, padding: '8px 0' }}>{t(lang, 'guia.armas.vacia')}</div> : null}
      </div>
      <div style={P.tip}>{t(lang, 'guia.armas.approx')}</div>
    </Tarjeta>
  )
}
