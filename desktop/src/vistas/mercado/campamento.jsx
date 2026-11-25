// Presentación compartida de un campamento del motor v2 (farm-plan.js): la
// usan el plan de sesión, el ranking, la columna de Mercado y el detalle.
// No recalcula nada: solo pinta lo que devuelve el motor.
import { C, S } from '../../estilos.js'
import { FarmPlan } from '../../mercado-logica.js'
import { dinero } from '../../datos.js'

const cp = (lang, es, en) => (lang === 'en' ? en : es)
// Mismo formato de dinero que el resto del plugin (o/p/c en español, g/s/c en inglés).
export const oro = (c) => (Number.isFinite(c) ? (c < 0 ? '-' + dinero(-c) : dinero(c)) : '?')
export const pct = (x) => `${Math.round((x || 0) * 100)}%`
const coords = (f) => (f.mapX != null && f.mapY != null ? `${f.mapX.toFixed(1)}, ${f.mapY.toFixed(1)}` : null)

export function tipoCampamento(f, lang) {
  return f.kind === 'clear' ? cp(lang, 'limpiar', 'clear') : cp(lang, 'solo', 'only')
}

// Una línea: «limpiar Rock Elemental, Ridge Huntress · Badlands (52.3, 41.0)».
export function NombreCampamento({ f, lang }) {
  const c = coords(f)
  return <span>
    <b>{tipoCampamento(f, lang)}</b> {f.names.join(', ')}
    <span style={S.etiqueta}> · {f.zone}{c ? ` (${c})` : ''}</span>
  </span>
}

// Composición del oro: monedas, subasta y vendedor.
export function Composicion({ f, lang }) {
  return <span style={S.etiqueta}>
    {cp(lang, 'monedas', 'coins')} {pct(f.coinsShare)} · {cp(lang, 'subasta', 'auction')} {pct(f.ahShare)} · {cp(lang, 'vendedor', 'vendor')} {pct(f.vendorShare)}
  </span>
}

// Tarjeta compacta de un campamento (ranking y detalle).
export function FilaCampamento({ f, lang, itemShare = null, itemPerHour = null, testid = 'farm-campamento' }) {
  return (
    <li data-testid={testid} style={{ marginBottom: 4, overflowWrap: 'anywhere' }}>
      <b>~{oro(f.gph)}/h</b> · <NombreCampamento f={f} lang={lang} />
      <div style={S.etiqueta}>
        {Math.round(f.rate)} {cp(lang, 'muertes/h', 'kills/h')} · {cp(lang, 'pelea', 'fight')} {Math.round(f.fightSec)} s
        {f.nnYards ? ` · ${Math.round(f.nnYards)} yd ${cp(lang, 'entre spawns', 'between spawns')}` : ''}
        {' · '}<Composicion f={f} lang={lang} />
        {itemShare != null ? ` · ${pct(itemShare)} ${cp(lang, 'es este ítem', 'is this item')}` : ''}
        {itemPerHour != null ? ` · ~${itemPerHour.toFixed(1)}/h` : ''}
        {f.top?.length ? ` · ${f.top.slice(0, 3).map((t) => `${t.name} ${pct(t.share)}`).join(', ')}` : ''}
        {f.riskLevel && f.riskLevel !== 'baja' ? <span style={{ color: f.riskLevel === 'alta' ? C.rojo : C.amarillo }}> · {cp(lang, 'riesgo', 'risk')} {f.riskLevel}</span> : null}
      </div>
    </li>
  )
}

// Supuestos visibles del motor (estilo y tope de venta).
export function Supuestos({ style, kappa, lang }) {
  const def = style?.source !== 'sesiones'
  return <p style={S.sub} data-testid="farm-supuestos">
    {def
      ? cp(lang, 'Supuestos por defecto', 'Default assumptions')
      : cp(lang, `Calibrado con tus sesiones (${style.muertes} muertes)`, `Calibrated from your sessions (${style.muertes} kills)`)}
    {': '}DPS {(style?.dpsK ?? FarmPlan.STYLE_DEFAULT.dpsK).toFixed(1)}×{cp(lang, 'nivel', 'level')} · {cp(lang, 'saqueo', 'loot')} {(style?.lootSec ?? 2).toFixed(1)} s
    {' · '}{cp(lang, 'pausas', 'downtime')} {pct(style?.downtime)} · {style?.speed ?? 9} yd/s
    {' · '}{kappa >= 1e8 ? cp(lang, 'sin tope de venta', 'no sell cap') : cp(lang, `tope de venta ${Math.round(kappa * 100)} % de lo publicado por sesión (tus ventas TSM mandan)`, `sell cap ${Math.round(kappa * 100)}% of listings per session (your TSM sales take priority)`)}
    {'. '}{cp(lang, 'Drops de Classic 1.12 (CMaNGOS) salvo lo observado en tus sesiones.', 'Classic 1.12 drops (CMaNGOS) except what your sessions observed.')}
  </p>
}
