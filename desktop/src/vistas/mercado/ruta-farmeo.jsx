// Explicación compartida por la tabla y el detalle; no recalcula el motor.
import { S } from '../../estilos.js'

export function RutaFarmeo({ fuente: s, fmt, lang }) {
  if (!s?.eligible || !s.travel) return null
  const en = lang === 'en'
  const camps = s.routeCamps || []
  return <div data-farm-route style={{ ...S.etiqueta, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
    {en ? 'Route estimate' : 'Estimación de ruta'}: ~{fmt.gph(s.campGph)}/h {en ? 'at camp' : 'en campamento'}
    {' × '}{fmt.pct(s.routeFactor)} = ~{fmt.gph(s.gph)}/h {en ? 'effective' : 'efectivo'}.
    {' '}{en ? 'Round trip' : 'Viaje ida/vuelta'} ~{s.travel.min} min
    {s.travel.fp ? (en ? ' · flight path in zone (unlock not verified)' : ' · vuelo en zona (desbloqueo no verificado)') : (en ? ' · no faction flight path' : ' · sin vuelo de la facción')}.
    {' '}{en ? 'Risk' : 'Riesgo'} ×{s.risk.mult}; {en ? 'competition' : 'competencia'} {s.comp.comp}.
    {' '}{s.alternativeCamps || 0} {en ? 'alternative camps' : 'campamentos alternativos'}
    {' · '}{s.spawns || 0} spawns {en ? 'at selected camp' : 'del campamento elegido'}
    {s.spawnTotal != null ? ` · ${s.spawnTotal} ${en ? 'across alternatives' : 'entre alternativas'}` : ''}.
    {camps.length > 1 ? ` ${en ? 'Alternatives' : 'Alternativas'}: ${camps.map(c => c.name).join(', ')}.` : ''}
    {' '}{en ? 'One camp at a time; no parallel drops. Travel, risk and competition are uncalibrated assumptions, not measured sales.' : 'Un campamento a la vez; sin drops paralelos. Viaje, riesgo y competencia son supuestos sin calibrar, no ventas medidas.'}
  </div>
}
