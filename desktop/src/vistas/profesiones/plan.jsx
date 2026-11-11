// Plan de subida de skill: pasos contiguos con la receta elegida en cada tramo, los
// crafts estimados y el costo según los precios de mercado (vendedor o subasta).
// Siempre se presenta como estimación: la probabilidad de subida usa la fórmula
// aproximada de Classic y los datos de Forever pueden diferir.
import { useMemo } from 'react'
import { Button } from '@hermes/plugin-sdk'
import { planDeSubida } from '../../../../src/crafteo.js'
import { nombre } from '../../datos.js'
import { C, S } from '../../estilos.js'
import { agregarTextos, t } from '../../i18n.js'
import { Aviso, Dinero, Origen, Tarjeta } from '../../ui.jsx'

agregarTextos({
  'prof.plan': 'Plan de subida',
  'prof.plan.estimacion': 'Estimación: probabilidad de subida con la fórmula aproximada de Classic; el costo usa precios de vendedor y subasta. No garantiza nada en Forever.',
  'prof.plan.sinPrecios': 'Sin precios de mercado: el plan se ordena por seguridad de subida y no muestra costos.',
  'prof.plan.importar': 'Importar precios en Mercado',
  'prof.plan.vacio': 'No hay tramo que planificar con los datos actuales.',
  'prof.plan.tope': 'Tu skill ya alcanza el tope que enseñan los entrenadores ({hasta}).',
  'prof.plan.total': 'Total estimado',
  'prof.plan.crafts': '{n} crafts',
  'prof.plan.sinReceta': 'sin receta en este tramo',
  'prof.plan.obtenibles': 'Solo recetas de entrenador, automáticas y objetos receta que vende un vendedor de tu facción.',
}, {
  'prof.plan': 'Leveling plan',
  'prof.plan.estimacion': 'Estimate: skill-up chance uses the approximate Classic formula; cost uses vendor and auction prices. Not guaranteed on Forever.',
  'prof.plan.sinPrecios': 'No market prices: the plan is ordered by skill-up safety and shows no costs.',
  'prof.plan.importar': 'Import prices in Market',
  'prof.plan.vacio': 'No range to plan with the current data.',
  'prof.plan.tope': 'Your skill already reaches the cap the trainers teach ({hasta}).',
  'prof.plan.total': 'Estimated total',
  'prof.plan.crafts': '{n} crafts',
  'prof.plan.sinReceta': 'no recipe in this range',
  'prof.plan.obtenibles': 'Only trainer recipes, automatic ones and recipe items a vendor of your faction sells.',
})

const num = (v) => (Number.isFinite(v) ? v : 0)

export function PlanSubida({ prof, skill, trainers, precios, items, lang, irA, faccion }) {
  const hasta = useMemo(() => {
    const deTrainers = trainers.length ? Math.max(...trainers.map((e) => num(e.max))) : 0
    if (deTrainers > 0) return Math.min(300, deTrainers)
    const gris = Math.max(0, ...prof.recetas.map((r) => num(r.rango?.gris)))
    return Math.min(300, gris)
  }, [trainers, prof])

  // Solo recetas que el jugador puede conseguir con seguridad: las del entrenador, las que se
  // aprenden solas y las de objeto receta que vende un vendedor de su facción. Un drop raro o
  // una receta de origen desconocido no entra en el plan.
  const obtenibles = useMemo(() => prof.recetas.filter((r) => r.como === 'entrenador' || r.como === 'automatica' ||
    (r.como === 'receta' && ((r.vendedores && r.vendedores[faccion]) || []).length > 0)), [prof, faccion])
  const plan = useMemo(
    () => (skill < hasta ? planDeSubida(obtenibles, skill, hasta, precios, items) : []),
    [obtenibles, skill, hasta, precios, items])
  const porSpell = useMemo(() => new Map(prof.recetas.map((r) => [r.spell, r])), [prof])
  const hayPrecios = precios instanceof Map ? precios.size > 0 : false
  const totalCrafts = plan.reduce((a, p) => a + p.crafteos, 0)
  const costos = plan.map((p) => p.costo)
  const totalCosto = costos.every((c) => c !== null) && costos.length ? costos.reduce((a, c) => a + c, 0) : null
  const fuentes = useMemo(() => [...new Set(prof.recetas.flatMap((r) => [].concat(r.f || [])))], [prof])

  return (
    <Tarjeta titulo={`${t(lang, 'prof.plan')} · ${skill} → ${hasta}`}
      extra={<Origen f={fuentes.length ? fuentes : 'cmangos-1.12'} lang={lang} />}>
      <div style={S.sub}>{t(lang, 'prof.plan.estimacion')} {t(lang, 'prof.plan.obtenibles')}</div>
      {!hayPrecios ? (
        <Aviso>
          {t(lang, 'prof.plan.sinPrecios')}{' '}
          <Button variant="outline" size="xs" onClick={() => irA('mercado')}>{t(lang, 'prof.plan.importar')}</Button>
        </Aviso>
      ) : null}
      {skill >= hasta ? <div style={S.sub}>{t(lang, 'prof.plan.tope', { hasta })}</div>
        : !plan.length ? <div style={S.sub}>{t(lang, 'prof.plan.vacio')}</div>
        : (
          <>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {plan.map((p, i) => {
                const r = p.spell != null ? porSpell.get(p.spell) : null
                return (
                  <div key={i} style={S.fila}>
                    <span style={{ minWidth: 110, color: C.texto3, fontVariantNumeric: 'tabular-nums' }}>
                      {p.desde}–{p.hasta - 1}
                    </span>
                    <span style={{ flex: 1 }}>
                      {r ? nombre(r.n, lang) : <span style={{ color: C.texto3 }}>{t(lang, 'prof.plan.sinReceta')}</span>}
                    </span>
                    <span style={S.sub}>{t(lang, 'prof.plan.crafts', { n: p.crafteos })}</span>
                    <span style={{ ...S.sub, fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'right' }}>
                      {p.costo === null ? '—' : <Dinero cobre={p.costo} />}
                    </span>
                  </div>
                )
              })}
            </div>
            <div style={{ ...S.fila, borderBottom: 'none', fontWeight: 600 }}>
              <span style={{ flex: 1 }}>{t(lang, 'prof.plan.total')}</span>
              <span style={S.sub}>{t(lang, 'prof.plan.crafts', { n: totalCrafts })}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'right' }}>
                {totalCosto === null ? '—' : <Dinero cobre={totalCosto} />}
              </span>
            </div>
          </>
        )}
    </Tarjeta>
  )
}
