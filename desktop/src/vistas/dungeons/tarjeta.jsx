// Una ficha de dungeon: jefes en orden con su botín generado (<NombreItem> +
// probabilidad, filtrable a "útil para mi clase"), las misiones de dungeon de tu
// facción y las notas/botín curados de la guía que coinciden por nombre.
import { useMemo } from 'react'
import { Checkbox } from '@hermes/plugin-sdk'
import { D, huecos, nombre } from '../../datos.js'
import { botinUtil, dungeonEnRango, misionesDeDungeon } from '../../ruta-logica.js'
import { agregarTextos, t } from '../../i18n.js'
import { C, S } from '../../estilos.js'
import { Hueco, NombreItem, Origen } from '../../ui.jsx'

agregarTextos({
  'dungeon.niveles': 'Nv {min}–{max}',
  'dungeon.jugadores': 'hasta {n} jugadores',
  'dungeon.raid': 'Raid',
  'dungeon.forever': 'Forever',
  'dungeon.enRango': 'en tu rango',
  'dungeon.sinDatosForever': 'Niveles, tamaño de grupo y botín son datos del servidor: no figuran en las tablas del cliente.',
  'dungeon.jefes': 'Jefes',
  'dungeon.sinBotin': 'sin botín en los datos',
  'dungeon.sinUtil': 'nada útil para tu clase',
  'dungeon.utiles': '{n} útiles',
  'dungeon.misiones': 'Misiones de dungeon',
  'dungeon.clave': 'CLAVE',
  'dungeon.contK': 'Kalimdor',
  'dungeon.contE': 'Reinos del Este',
}, {
  'dungeon.niveles': 'Lv {min}–{max}',
  'dungeon.jugadores': 'up to {n} players',
  'dungeon.raid': 'Raid',
  'dungeon.forever': 'Forever',
  'dungeon.enRango': 'in your range',
  'dungeon.sinDatosForever': 'Level range, group size and loot are server-side data: they are not in the client tables.',
  'dungeon.jefes': 'Bosses',
  'dungeon.sinBotin': 'no loot in the data',
  'dungeon.sinUtil': 'nothing useful for your class',
  'dungeon.utiles': '{n} useful',
  'dungeon.misiones': 'Dungeon quests',
  'dungeon.clave': 'KEY',
  'dungeon.contK': 'Kalimdor',
  'dungeon.contE': 'Eastern Kingdoms',
})

const estiloDetails = {
  border: `1px solid ${C.borde}`, borderRadius: 6, background: C.tarjeta,
}
const estiloSummary = {
  cursor: 'pointer', padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'baseline',
  flexWrap: 'wrap', fontSize: 13,
}
const estiloCuerpo = { padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }

const contLabel = (c, lang) => (c === 'K' ? t(lang, 'dungeon.contK') : c === 'E' ? t(lang, 'dungeon.contE') : c)

export function TarjetaDungeon({ d, lang, perfil, soloUtil, items, competencias, gear, curados, onGear }) {
  const enRango = dungeonEnRango(d, perfil.nivel)
  const misiones = useMemo(() => misionesDeDungeon(D.misiones.misiones, perfil, d.mapa), [perfil, d.mapa])
  const hs = huecos('dungeons', { tema: 'botin', mapa: d.mapa })
  const utilesTotal = useMemo(() => {
    if (!soloUtil) return 0
    return d.jefes.reduce((n, j) => n + (j.botin ? botinUtil(items, j.botin, competencias).length : 0), 0)
  }, [soloUtil, d, items, competencias])

  const meta = d.niveles
    ? [t(lang, 'dungeon.niveles', { min: d.niveles.min, max: d.niveles.max }),
       d.jugadores ? t(lang, 'dungeon.jugadores', { n: d.jugadores }) : null].filter(Boolean).join(' · ')
    : t(lang, 'dungeon.forever')

  return (
    <details open={enRango} data-dungeon={d.mapa} style={estiloDetails}>
      <summary style={estiloSummary}>
        <span style={{ fontWeight: 600 }}>{nombre(d.n, lang)}</span>
        <span style={S.sub}>{meta}</span>
        {d.raid ? <span style={{ ...S.chip, borderColor: C.rojo, color: C.rojo }}>{t(lang, 'dungeon.raid')}</span> : null}
        {enRango ? <span style={{ ...S.chip, borderColor: C.verde, color: C.verde }}>{t(lang, 'dungeon.enRango')}</span> : null}
        {soloUtil && d.tipo === 'clasico' ? <span style={S.chip}>{t(lang, 'dungeon.utiles', { n: utilesTotal })}</span> : null}
        <Origen f={d.f} lang={lang} />
      </summary>
      <div style={estiloCuerpo}>
        {d.tipo === 'forever' ? <Hueco lang={lang}>{t(lang, 'dungeon.sinDatosForever')}</Hueco> : null}
        {hs.filter((h) => d.tipo !== 'forever').map((h, i) => (
          <Hueco key={i} lang={lang}>{h.motivo}{h.jefes && h.jefes.length ? ' — ' + h.jefes.join(', ') : ''}</Hueco>
        ))}

        <div style={S.etiqueta}>{t(lang, 'dungeon.jefes')} · {d.jefes.length}</div>
        {d.jefes.map((j, ji) => {
          const botin = j.botin || []
          const muestra = soloUtil ? botinUtil(items, botin, competencias) : botin
          return (
            <div key={ji} data-jefe={ji} style={{ paddingLeft: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{nombre(j.n, lang)}</div>
              {d.tipo === 'forever' ? null : (
                <div style={{ paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {muestra.length ? muestra.map(([iid, prob], bi) => (
                    <div key={bi} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                      <NombreItem id={iid} lang={lang} />
                      <span style={S.sub}>{prob}%</span>
                    </div>
                  )) : (
                    <div style={S.sub}>{botin.length ? t(lang, 'dungeon.sinUtil') : t(lang, 'dungeon.sinBotin')}</div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {misiones.length ? (
          <div style={{ marginTop: 4 }}>
            <div style={S.etiqueta}>{t(lang, 'dungeon.misiones')} · {misiones.length}</div>
            {misiones.map(([id, m]) => (
              <div key={id} data-mision={id} style={{ ...S.fila, borderBottom: 'none', padding: '2px 0', opacity: m.min > perfil.nivel ? 0.6 : 1 }}>
                <span style={{ minWidth: 34, color: C.texto3 }}>{m.nivel}</span>
                <span style={{ flex: 1 }}>{nombre(m.t, lang)}</span>
              </div>
            ))}
          </div>
        ) : null}

        {curados.map(({ d: cd, indice }) => {
          const loot = Array.isArray(cd.loot) ? cd.loot : []
          const conseguidos = loot.filter((l) => gear.has('d' + indice + '|' + l[0])).length
          return (
            <div key={indice} data-curado={indice} style={{ borderTop: `1px dashed ${C.borde}`, paddingTop: 6, marginTop: 4 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{cd.n}</span>
                <span style={S.sub}>{cd.loc} · {cd.r[0]}–{cd.r[1]}</span>
                <span style={S.chip}>{contLabel(cd.cont, lang)}</span>
                {cd.key ? <span style={{ ...S.chip, borderColor: C.amarillo, color: C.amarillo }}>{t(lang, 'dungeon.clave')}</span> : null}
                <span style={{ ...S.sub, marginLeft: 'auto' }}>{conseguidos}/{loot.length}</span>
              </div>
              {cd.note ? <div style={S.sub}>{cd.note}</div> : null}
              <Origen f="curado" lang={lang} />
              {loot.map((l, li) => {
                const gid = 'd' + indice + '|' + l[0]
                return (
                  <label key={li} data-loot={gid} style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 12 }}>
                    <Checkbox checked={gear.has(gid)} onCheckedChange={(v) => onGear(gid, v)} />
                    <span style={{ fontWeight: 600 }}>{l[0]}</span>
                    <span style={S.sub}>— {l[1]}</span>
                  </label>
                )
              })}
            </div>
          )
        })}
      </div>
    </details>
  )
}
