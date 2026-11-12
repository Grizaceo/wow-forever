// Gráfico de precio mínimo diario en SVG React. La geometría viene de
// geometriaGrafico() (misma que standalone/market-chart.js); los colores son
// variables del tema C.* — nunca colores fijos.
import { useMemo } from 'react'
import { C, S } from '../../estilos.js'
import { t } from '../../i18n.js'
import { geometriaGrafico } from '../../mercado-logica.js'

const ROLES = {
  area: { fill: C.amarillo, fillOpacity: 0.1 },
  linea: { stroke: C.amarillo, strokeWidth: 1.6, fill: 'none', strokeLinejoin: 'round', strokeLinecap: 'round' },
  mediana: { stroke: C.texto3, strokeWidth: 1, strokeDasharray: '4 3' },
  punto: { fill: C.naranja },
  eje: { stroke: C.borde2, strokeWidth: 1 },
  tick: { stroke: C.borde2, strokeWidth: 1 },
  texto: { fill: C.texto3, fontSize: 9.5 },
}

export function GraficoPrecios({ history, actual, lang, titulo }) {
  const g = useMemo(() => geometriaGrafico(history, { current: actual }), [history, actual])
  if (!g) return <p style={S.sub}>{t(lang, 'mercado.sinHistorial')}</p>
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={titulo || t(lang, 'mercado.grafico')} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {g.mediana != null && <line x1={g.x0} y1={g.mediana} x2={g.x1} y2={g.mediana} style={ROLES.mediana} />}
      <path d={g.area} style={ROLES.area} />
      <path d={g.linea} style={ROLES.linea} />
      {g.actual && <circle cx={g.actual.x} cy={g.actual.y} r={3} style={ROLES.punto} />}
      <circle cx={g.fin.x} cy={g.fin.y} r={3} style={ROLES.punto} />
      {g.ticksY?.map((tk) => (
        <g key={'y' + tk.v}>
          <line x1={g.x0 - 4} y1={tk.y} x2={g.x0} y2={tk.y} style={ROLES.tick} />
          <text x={g.x0 - 7} y={tk.y + 3} textAnchor="end" style={ROLES.texto}>{tk.label}</text>
        </g>
      ))}
      {g.ticksX?.map((tk) => (
        <g key={'x' + tk.x + tk.label}>
          <line x1={tk.x} y1={g.y1} x2={tk.x} y2={g.y1 + 4} style={ROLES.eje} />
          <text x={tk.x} y={g.y1 + 15} textAnchor="middle" style={ROLES.texto}>{tk.label}</text>
        </g>
      ))}
      <line x1={g.x0} y1={g.y0} x2={g.x0} y2={g.y1} style={ROLES.eje} />
      <line x1={g.x0} y1={g.y1} x2={g.x1} y2={g.y1} style={ROLES.eje} />
    </svg>
  )
}

// Sparkline sin ejes para las tarjetas de farmeo (misma geometría, sin ticks).
export function Sparkline({ history }) {
  const g = useMemo(() => geometriaGrafico(history, {
    w: 150, h: 34, pad: { l: 4, r: 4, t: 5, b: 5 }, axes: false, current: null,
  }), [history])
  if (!g) return null
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label="sparkline" style={{ width: 150, height: 34, display: 'block', flexShrink: 0 }}>
      <path d={g.area} style={ROLES.area} />
      <path d={g.linea} style={ROLES.linea} />
      <circle cx={g.fin.x} cy={g.fin.y} r={2.5} style={ROLES.punto} />
    </svg>
  )
}
