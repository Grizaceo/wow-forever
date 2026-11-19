// Plan de subida de skill: pasos contiguos con la receta elegida en cada tramo, los
// crafts estimados y el costo según los precios de mercado (vendedor o subasta).
// Siempre se presenta como estimación: la probabilidad de subida usa la fórmula
// aproximada de Classic y los datos de Forever pueden diferir.
// Modo «Maxear a 300»: ruta golosa por coste esperado por punto (rutaMaxeo), que SÍ
// incluye el coste de adquirir las recetas de objeto, amortizado y pagado una sola vez,
// con cobertura, huecos y SIN DATOS declarados. El plan rápido anterior queda intacto.
import { useMemo, useState } from 'react'
import { Button } from '@hermes/plugin-sdk'
import { planDeSubida, rutaMaxeo } from '../../../../src/crafteo.js'
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
  'prof.plan.modo.rapido': 'Plan rápido',
  'prof.plan.modo.maxear': 'Maxear a 300',
  'prof.max.titulo': 'Maxear a 300',
  'prof.max.estimacion': 'Ruta golosa por coste esperado por punto: materiales + adquisición de la receta amortizada sobre los puntos que aporta, pagada una sola vez. Incluye recetas verdes. Estimación con la fórmula aproximada de Classic; no garantiza nada en Forever.',
  'prof.max.avisoEntrenamiento': 'El coste de entrenar los tramos con el trainer no está en los datos (SIN DATOS): no se incluye en el total.',
  'prof.max.cobertura': '{pct}% del tramo cubierto por la ruta con precio.',
  'prof.max.adquisicion': 'Adquisición de recetas',
  'prof.max.adquisicion.nota': 'Se paga una sola vez. Fuente: gratis (entrenador/automática), vendedor de tu facción o subasta.',
  'prof.max.materiales': 'Materiales',
  'prof.max.total': 'Total estimado (materiales + adquisición)',
  'prof.max.huecos': 'Huecos sin ruta con precio',
  'prof.max.sinDato': '{n} recetas sin coste de adquisición conocido (SIN DATOS): quedan fuera de la ruta.',
  'prof.max.sinPrecio': '{n} recetas sin precio de algún reactivo: no entran en la ruta con precio.',
  'prof.max.sinRuta': 'No hay ruta con precio desde tu skill: faltan precios de reactivos o recetas conocidas. Importa más precios en Mercado.',
  'prof.max.gratis': 'gratis',
  'prof.max.vendedor': 'vendedor',
  'prof.max.subasta': 'subasta',
  'prof.max.desde': 'desde {n}',
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
  'prof.plan.modo.rapido': 'Quick plan',
  'prof.plan.modo.maxear': 'Max to 300',
  'prof.max.titulo': 'Max to 300',
  'prof.max.estimacion': 'Greedy route by expected cost per point: materials + recipe acquisition amortized over the points it yields, paid once. Includes green recipes. Estimate with the approximate Classic formula; not guaranteed on Forever.',
  'prof.max.avisoEntrenamiento': 'The cost of training tiers with the trainer is not in the data (NO DATA): it is not included in the total.',
  'prof.max.cobertura': '{pct}% of the range covered by the priced route.',
  'prof.max.adquisicion': 'Recipe acquisition',
  'prof.max.adquisicion.nota': 'Paid once. Source: free (trainer/automatic), a vendor of your faction or the auction house.',
  'prof.max.materiales': 'Materials',
  'prof.max.total': 'Estimated total (materials + acquisition)',
  'prof.max.huecos': 'Gaps without a priced route',
  'prof.max.sinDato': '{n} recipes without a known acquisition cost (NO DATA): left out of the route.',
  'prof.max.sinPrecio': '{n} recipes missing a reagent price: not in the priced route.',
  'prof.max.sinRuta': 'No priced route from your skill: reagent prices or known recipes are missing. Import more prices in Market.',
  'prof.max.gratis': 'free',
  'prof.max.vendedor': 'vendor',
  'prof.max.subasta': 'auction',
  'prof.max.desde': 'from {n}',
})

const num = (v) => (Number.isFinite(v) ? v : 0)
const pct1 = (v) => (Number.isFinite(v) ? String(Math.round(v * 1000) / 10) : '—')

export function PlanSubida({ prof, skill, trainers, precios, items, lang, irA, faccion }) {
  const [maxear, setMaxear] = useState(false)
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
  // rutaMaxeo filtra por adquisición conocida internamente: se le pasan TODAS las recetas.
  const ruta = useMemo(
    () => (maxear && hayPrecios ? rutaMaxeo(prof.recetas, skill, 300, precios, items, { faccion }) : null),
    [maxear, hayPrecios, prof, skill, precios, items, faccion])
  const totalCrafts = plan.reduce((a, p) => a + p.crafteos, 0)
  const costos = plan.map((p) => p.costo)
  const totalCosto = costos.every((c) => c !== null) && costos.length ? costos.reduce((a, c) => a + c, 0) : null
  const fuentes = useMemo(() => [...new Set(prof.recetas.flatMap((r) => [].concat(r.f || [])))], [prof])

  const toggle = (
    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
      <Button size="xs" variant={maxear ? 'outline' : 'secondary'} onClick={() => setMaxear(false)}>
        {t(lang, 'prof.plan.modo.rapido')}
      </Button>
      <Button size="xs" variant={maxear ? 'secondary' : 'outline'} onClick={() => setMaxear(true)}>
        {t(lang, 'prof.plan.modo.maxear')}
      </Button>
    </div>
  )
  const importar = (
    <Aviso>
      {t(lang, 'prof.plan.sinPrecios')}{' '}
      <Button variant="outline" size="xs" onClick={() => irA('mercado')}>{t(lang, 'prof.plan.importar')}</Button>
    </Aviso>
  )
  const origen = <Origen f={fuentes.length ? fuentes : 'cmangos-1.12'} lang={lang} />

  // ---- Modo «Maxear a 300» ----
  if (maxear) {
    const pasos = ruta ? ruta.pasos : []
    const acqs = ruta ? ruta.adquisiciones : []
    return (
      <Tarjeta titulo={`${t(lang, 'prof.max.titulo')} · ${skill} → 300`} extra={origen}>
        {toggle}
        <div style={S.sub}>{t(lang, 'prof.max.estimacion')}</div>
        <div style={S.sub}>{t(lang, 'prof.max.avisoEntrenamiento')}</div>
        {!hayPrecios ? importar
          : !ruta || !pasos.length ? (
            <>
              <div style={S.sub}>{t(lang, 'prof.max.sinRuta')}</div>
              {ruta && ruta.huecos.length ? (
                <div style={{ marginTop: 6 }}>
                  <div style={{ ...S.sub, fontWeight: 600 }}>{t(lang, 'prof.max.huecos')}</div>
                  {ruta.huecos.map((h, i) => (
                    <div key={i} style={S.fila}>
                      <span style={{ minWidth: 110, color: C.texto3, fontVariantNumeric: 'tabular-nums' }}>{h.desde}–{h.hasta - 1}</span>
                      <span style={{ flex: 1, ...S.sub }}>{h.motivo}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div style={{ ...S.sub, marginTop: 6 }}>{t(lang, 'prof.max.cobertura', { pct: pct1(ruta.cobertura) })}</div>
              <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 6 }}>
                {pasos.map((p, i) => {
                  const r = porSpell.get(p.spell)
                  return (
                    <div key={i} style={S.fila}>
                      <span style={{ minWidth: 110, color: C.texto3, fontVariantNumeric: 'tabular-nums' }}>{p.desde}–{p.hasta - 1}</span>
                      <span style={{ flex: 1 }}>{r ? nombre(r.n, lang) : <span style={{ color: C.texto3 }}>{t(lang, 'prof.plan.sinReceta')}</span>}</span>
                      <span style={S.sub}>{t(lang, 'prof.plan.crafts', { n: p.crafteos })}</span>
                      <span style={{ ...S.sub, fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'right' }}>
                        {p.costo === null ? '—' : <Dinero cobre={p.costo} />}
                      </span>
                    </div>
                  )
                })}
              </div>
              {acqs.length ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ ...S.sub, fontWeight: 600 }}>{t(lang, 'prof.max.adquisicion')}</div>
                  <div style={S.sub}>{t(lang, 'prof.max.adquisicion.nota')}</div>
                  {acqs.map((a, i) => {
                    const r = porSpell.get(a.spell)
                    return (
                      <div key={i} style={S.fila}>
                        <span style={{ flex: 1 }}>{r ? nombre(r.n, lang) : (a.item != null ? nombre(items[String(a.item)]?.[0], lang) : '—')}</span>
                        <span style={S.sub}>{t(lang, 'prof.max.' + a.fuente)}</span>
                        <span style={S.sub}>{t(lang, 'prof.max.desde', { n: a.desde })}</span>
                        <span style={{ ...S.sub, fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'right' }}>
                          {a.cobre === 0 ? t(lang, 'prof.max.gratis') : <Dinero cobre={a.cobre} />}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : null}
              <div style={{ ...S.fila, borderBottom: 'none', fontWeight: 600, marginTop: 6 }}>
                <span style={{ flex: 1 }}>{t(lang, 'prof.max.materiales')}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'right' }}>
                  {ruta.totalMateriales === null ? '—' : <Dinero cobre={ruta.totalMateriales} />}
                </span>
              </div>
              <div style={{ ...S.fila, borderBottom: 'none' }}>
                <span style={{ flex: 1 }}>{t(lang, 'prof.max.adquisicion')}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'right' }}><Dinero cobre={ruta.totalAdquisicion} /></span>
              </div>
              <div style={{ ...S.fila, borderBottom: 'none', fontWeight: 600 }}>
                <span style={{ flex: 1 }}>{t(lang, 'prof.max.total')}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'right' }}>
                  {ruta.total === null ? '—' : <Dinero cobre={ruta.total} />}
                </span>
              </div>
              {ruta.huecos.length ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ ...S.sub, fontWeight: 600 }}>{t(lang, 'prof.max.huecos')}</div>
                  {ruta.huecos.map((h, i) => (
                    <div key={i} style={S.fila}>
                      <span style={{ minWidth: 110, color: C.texto3, fontVariantNumeric: 'tabular-nums' }}>{h.desde}–{h.hasta - 1}</span>
                      <span style={{ flex: 1, ...S.sub }}>{h.motivo}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {ruta.adquisicionesSinDato.length ? <div style={S.sub}>{t(lang, 'prof.max.sinDato', { n: ruta.adquisicionesSinDato.length })}</div> : null}
              {ruta.sinPrecio.length ? <div style={S.sub}>{t(lang, 'prof.max.sinPrecio', { n: ruta.sinPrecio.length })}</div> : null}
            </>
          )}
      </Tarjeta>
    )
  }

  // ---- Plan rápido (comportamiento anterior, intacto) ----
  return (
    <Tarjeta titulo={`${t(lang, 'prof.plan')} · ${skill} → ${hasta}`} extra={origen}>
      {toggle}
      <div style={S.sub}>{t(lang, 'prof.plan.estimacion')} {t(lang, 'prof.plan.obtenibles')}</div>
      {!hayPrecios ? importar : null}
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
