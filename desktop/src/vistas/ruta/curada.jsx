// Capa curada de la ruta (port de viewRoute de standalone/index.html): bandas por
// continente —Reinos del Este / Kalimdor— escritas a mano en la guía, con la
// banda del nivel actual resaltada. El continente se guarda en estado.build con
// la clave `realm` y los pasos en `steps` ('<nivel>|<indice>'), igual que antes.
import { Checkbox, SegmentedControl } from '@hermes/plugin-sdk'
import { agregarTextos, t } from '../../i18n.js'
import { C, S } from '../../estilos.js'
import { Origen, Tarjeta } from '../../ui.jsx'

agregarTextos({
  'ruta.curada': 'Ruta curada',
  'ruta.curadaSub': 'Bandas escritas a mano en la guía de tu clase. Tilda los pasos que ya hiciste: se guardan solos.',
  'ruta.nivel': 'Nv {min}–{max}',
  'ruta.aqui': 'estás acá',
  'ruta.pasos': 'pasos',
  'ruta.dungeons': 'Dungeons',
  'ruta.locK': 'Kalimdor',
  'ruta.locE': 'Reinos del Este',
}, {
  'ruta.curada': 'Curated route',
  'ruta.curadaSub': 'Bands written by hand in your class guide. Tick the steps you already did: they save themselves.',
  'ruta.nivel': 'Lv {min}–{max}',
  'ruta.aqui': 'you are here',
  'ruta.pasos': 'steps',
  'ruta.dungeons': 'Dungeons',
  'ruta.locK': 'Kalimdor',
  'ruta.locE': 'Eastern Kingdoms',
})

const estiloDetails = {
  border: `1px solid ${C.borde}`, borderRadius: 4, background: C.fondo3,
}
const estiloSummary = {
  cursor: 'pointer', padding: '6px 8px', display: 'flex', gap: 8, alignItems: 'baseline',
  flexWrap: 'wrap', fontSize: 12,
}

export function CuradaRuta({ datos, build, pasos, onPaso, onGuardar, perfil, lang }) {
  const routes = datos.routes || {}
  const claves = Object.keys(routes)
  const realm = claves.includes(build.realm) ? build.realm : claves[0]
  const bandas = [...routes[realm]].sort((a, b) => (a.min ?? 0) - (b.min ?? 0))
  const hitos = datos.milestones || []
  const nivel = perfil.nivel

  let idxActual = bandas.findIndex((b) => nivel >= b.min && nivel <= b.max)
  if (idxActual < 0) {
    for (let i = bandas.length - 1; i >= 0; i--) if (bandas[i].min <= nivel) { idxActual = i; break }
  }
  if (idxActual < 0) idxActual = 0

  const total = hitos.length
  const hechos = hitos.filter((m, i) => pasos.has(m.lvl + '|' + i)).length
  const pct = total ? Math.round((hechos / total) * 1000) / 10 : 0

  const locLabel = (c) => (c === 'K' ? t(lang, 'ruta.locK') : c === 'E' ? t(lang, 'ruta.locE') : c)

  return (
    <Tarjeta titulo={t(lang, 'ruta.curada')}
      extra={<>
        <SegmentedControl
          value={realm}
          onChange={(v) => onGuardar({ realm: v })}
          options={claves.map((k) => ({ id: k, label: k === 'ek' ? t(lang, 'ruta.ek') : k === 'kalimdor' ? t(lang, 'ruta.kalimdor') : k }))}
        />
        <Origen f="curado" lang={lang} />
      </>}>
      <div style={S.sub}>{t(lang, 'ruta.curadaSub')}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.fondo3, overflow: 'hidden' }}>
          <div style={{ width: pct + '%', height: '100%', background: C.acento }} />
        </div>
        <span style={S.sub}>{hechos}/{total} {t(lang, 'ruta.pasos')}</span>
      </div>
      {bandas.map((b, bi) => {
        const ms = hitos.map((m, i) => ({ m, i })).filter((x) => x.m.lvl >= b.min && x.m.lvl <= b.max)
        if (!ms.length) return null
        const actual = nivel >= b.min && nivel <= b.max
        const dn = ms.filter((x) => pasos.has(x.m.lvl + '|' + x.i)).length
        return (
          <details key={bi} open={bi === idxActual} style={estiloDetails} data-banda={bi}>
            <summary style={estiloSummary}>
              <span style={{ fontWeight: 600 }}>{t(lang, 'ruta.nivel', { min: b.min, max: b.max })}</span>
              {actual ? <span style={{ ...S.chip, borderColor: C.verde, color: C.verde }}>{t(lang, 'ruta.aqui')}</span> : null}
              <span style={{ ...S.sub, flex: 1, minWidth: 0 }}>{b.zones}</span>
              <span style={{ ...S.sub, whiteSpace: 'nowrap' }}>{dn}/{ms.length}</span>
            </summary>
            <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {b.notes ? <div style={S.sub}>{b.notes}</div> : null}
              {b.dung ? <div style={S.sub}><b style={{ color: C.naranja }}>{t(lang, 'ruta.dungeons')}:</b> {b.dung}</div> : null}
              {ms.map(({ m, i }) => {
                const id = m.lvl + '|' + i
                const hecho = pasos.has(id)
                return (
                  <label key={id} data-paso={id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12, opacity: hecho ? 0.65 : 1 }}>
                    <Checkbox checked={hecho} onCheckedChange={(v) => onPaso(id, v)} />
                    <span style={{ minWidth: 28, color: C.texto3 }}>{m.lvl}</span>
                    <span style={S.chip}>{m.cat}</span>
                    {m.loc ? <span style={S.chip}>{locLabel(m.loc)}</span> : null}
                    <span style={{ flex: 1 }}>{m.txt}</span>
                  </label>
                )
              })}
            </div>
          </details>
        )
      })}
    </Tarjeta>
  )
}
