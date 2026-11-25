// Farmeo v2: plan de sesión para maximizar oro (standalone/farm-plan.js), mejores
// campamentos y las sesiones medidas con el addon WoWForeverFarm (predicho vs real
// y estilo calibrado). Todo número es estimación salvo lo medido en tus sesiones.
// Diseño: docs/FARMEO-ORO.md. El motor heredado (market-farm.js) solo queda para
// «Por tu profesión» (nodos de hierbas y minería).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hermes/plugin-sdk'
import { C, S } from '../../estilos.js'
import { D, guiaCurada } from '../../datos.js'
import { t } from '../../i18n.js'
import { Tarjeta } from '../../ui.jsx'
import { Farm, FarmPlan, perfilMotor, hubZonesDe, fechaDe } from '../../mercado-logica.js'
import { metricasSesion, exportAgente } from '../../farm-sesiones.js'
import { exportarAgente, ARCHIVO_AGENTE } from '../../farm-sync.js'
import { construirContextoFarmeo } from '../../davi.js'
import { leerNiveles, nivelDe } from '../../oficios.js'
import { PreguntarDavi } from '../preguntar-davi.jsx'
import { FilaCampamento, NombreCampamento, Supuestos, oro, pct } from './campamento.jsx'

const cp = (lang, es, en) => (lang === 'en' ? en : es)
const DIA0 = Date.UTC(2020, 0, 1)
const fechaSesion = (unix) => fechaDe(Math.floor((unix * 1000 - DIA0) / 86400000)) || '?'
const signo = (x) => (x == null || !Number.isFinite(x) ? '?' : `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`)

function Opcion({ etiqueta, value, onChange, opciones }) {
  return (
    <label style={S.campo}>
      <span style={S.etiqueta}>{etiqueta}</span>
      <Select value={String(value)} onValueChange={onChange}>
        <SelectTrigger aria-label={etiqueta}><SelectValue /></SelectTrigger>
        <SelectContent>{opciones.map(([v, txt]) => <SelectItem key={v} value={String(v)}>{txt}</SelectItem>)}</SelectContent>
      </Select>
    </label>
  )
}
function CampoOro({ etiqueta, value, onChange, id }) {
  return (
    <label style={S.campo} htmlFor={id}>
      <span style={S.etiqueta}>{etiqueta}</span>
      <Input id={id} type="number" min={0} max={1000000} step={1} value={value ? String(value) : ''} placeholder="0"
        style={{ width: 90 }} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
const horasTxt = (h) => (h == null ? '?' : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${(Math.round(h * 10) / 10).toLocaleString('es')} h`)
function MetaOro({ meta, lang }) {
  if (!meta) return null
  if (meta.falta === 0) return <div data-testid="farm-plan-meta" style={S.etiqueta}>{cp(lang, 'Meta', 'Goal')} {oro(meta.target)}: {cp(lang, 'ya la tienes', 'already reached')}</div>
  return (
    <div data-testid="farm-plan-meta" style={{ fontSize: 12 }}>
      {cp(lang, 'Meta', 'Goal')} {oro(meta.target)}: {cp(lang, 'faltan', 'missing')} {oro(meta.falta)} → <b>~{horasTxt(meta.horas)}</b>
      {' '}<span style={S.etiqueta}>({horasTxt(meta.horasMin)}–{horasTxt(meta.horasMax)}) {cp(lang, 'con este plan, sin contar lo que gastes', 'with this plan, not counting what you spend')}</span>
    </div>
  )
}
function Marca({ checked, onChange, children, disabled = false }) {
  return <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
    <Checkbox checked={!!checked} disabled={disabled} onCheckedChange={(v) => onChange(!!v)} />{children}
  </label>
}

function PlanSesion({ plan, planCtx, meta, lang }) {
  if (!plan?.best) return <p style={S.sub} data-testid="farm-plan-vacio">{cp(lang, 'Sin plan: falta un escaneo de mercado o no hay campamentos elegibles para tu nivel y facción.', 'No plan: a market scan is missing or no camp is eligible for your level and faction.')}</p>
  const b = plan.best
  return (
    <div data-testid="farm-plan" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div data-testid="farm-plan-total" style={{ fontSize: 14 }}>
        <b>~{oro(b.gph)}/h</b> <span style={S.etiqueta}>({cp(lang, 'rango', 'range')} {oro(b.low)}–{oro(b.high)})</span>
        {' · '}{b.zones.map((z) => z.name).join(' + ')} · {b.hours} h
        {' · '}{cp(lang, 'viaje', 'travel')} {Math.round(b.travelMin)} min
        {b.bagTrips ? ` · ${b.bagTrips} ${cp(lang, 'viaje(s) por bolsas llenas', 'trip(s) for full bags')}` : ''}
      </div>
      <MetaOro meta={meta} lang={lang} />
      <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12 }}>
        {b.legs.map((l, i) => (
          <li key={i} data-testid="farm-plan-tramo" style={{ overflowWrap: 'anywhere' }}>
            {l.minutes} min · <NombreCampamento f={l.farm} lang={lang} /> · ~{oro(l.gold)}
          </li>
        ))}
      </ol>
      <div style={S.etiqueta}>
        {cp(lang, 'Aportan', 'Main income')}: {b.top.slice(0, 5).map((x) => `${x.name} ${oro(x.gold)}${x.capBasis === 'ventas-propias' ? ` (${cp(lang, 'tope: tus ventas', 'cap: your sales')})` : x.capBasis === 'mercado-delgado' ? ` (${cp(lang, 'mercado delgado: vendedor', 'thin market: vendor')})` : ''}`).join(' · ')}
      </div>
      <div style={S.etiqueta}>
        {cp(lang, 'Monedas', 'Coins')} {oro(b.coins)} · {cp(lang, 'subasta', 'auction')} {oro(b.ahGold)} · {cp(lang, 'vendedor', 'vendor')} {oro(b.vendorGold)}
        {b.ammo > 0 ? ` · ${cp(lang, 'munición', 'ammo')} −${oro(b.ammo)}` : ''} · ~{Math.round(b.kills)} {cp(lang, 'muertes', 'kills')}
      </div>
      {plan.alternatives?.length > 0 && (
        <div style={S.etiqueta} data-testid="farm-plan-alternativas">
          {cp(lang, 'Alternativas dentro del rango', 'Alternatives within the range')}: {plan.alternatives.map((a) => `${a.zones.map((z) => z.name).join(' + ')} ~${oro(a.gph)}/h`).join(' · ')}
        </div>
      )}
      <Supuestos style={planCtx.style} kappa={planCtx.kappa} lang={lang} />
    </div>
  )
}

function MisSesiones({ metricas, abierta, lectura, onLeer, estilo, exportado, lang }) {
  return (
    <div data-testid="farm-sesiones" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="xs" variant="outline" onClick={onLeer} data-testid="farm-leer-sesiones">{cp(lang, 'Leer sesiones', 'Read sessions')}</Button>
        <span style={S.sub} data-testid="farm-sesiones-estado">
          {lectura?.status === 'ok' ? cp(lang, `${metricas.length} sesiones leídas de WoWForeverFarm.lua.`, `${metricas.length} sessions read from WoWForeverFarm.lua.`)
            : lectura?.message || (lectura?.status === 'no-folder' ? cp(lang, 'Concede la carpeta SavedVariables en Mercado → Leer Auctionator.lua.', 'Grant the SavedVariables folder in Market → Read Auctionator.lua.') : '')}
          {abierta ? ` ${cp(lang, 'Hay una sesión abierta en el juego (aparece al cerrarla con /wff stop y hacer /reload).', 'A session is open in game (it appears after /wff stop and /reload).')}` : ''}
        </span>
      </div>
      {!metricas.length ? (
        <p style={S.sub}>{cp(lang,
          'Instala el addon WoWForeverFarm (carpeta addon/WoWForeverFarm del plugin), escribe /wff start al salir a farmear (el reloj arranca en tu primera pelea) y /wff stop al terminar; después /reload. Cada sesión mide tiempo, combate, saqueo, muertes, monedas y el botín que entró a tus bolsas, y el plan aprende de tu forma de jugar.',
          'Install the WoWForeverFarm addon (the plugin\'s addon/WoWForeverFarm folder), type /wff start when you head out (the clock starts at your first fight) and /wff stop when done, then /reload. Each session measures time, combat, looting, kills, coins and the loot that reached your bags, and the plan learns from how you play.')}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ ...S.tabla, fontSize: 12 }}>
            <thead><tr>
              {[cp(lang, 'Fecha', 'Date'), 'Min', cp(lang, 'Zona', 'Zone'), cp(lang, 'Muertes/h', 'Kills/h'), cp(lang, 'Pelea', 'Fight'),
                cp(lang, 'Combate · saqueo · resto', 'Combat · loot · rest'), cp(lang, 'Oro/h', 'Gold/h'), cp(lang, 'Predicho', 'Predicted'), cp(lang, 'Ritmo · botín', 'Pace · loot')]
                .map((h) => <th key={h} style={S.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {[...metricas].reverse().slice(0, 12).map((m) => (
                <tr key={m.id} data-testid="farm-sesion-fila">
                  <td style={S.td}>{fechaSesion(m.start)}</td>
                  <td style={S.td}>{Math.round(m.activo / 60)}{m.viajeS >= 60 ? <div style={S.etiqueta}>+{Math.round(m.viajeS / 60)} {cp(lang, 'viaje', 'travel')}</div> : null}</td>
                  <td style={S.td}>{m.zona ? FarmPlan.zoneName(m.zona) : '?'}</td>
                  <td style={S.td}>{m.tipo === 'pesca'
                    ? <span data-testid="farm-sesion-pesca">{Math.round(m.pescasH)} <span style={S.etiqueta}>{cp(lang, 'capturas', 'catches')}</span></span>
                    : <>{Math.round(m.muertesH)}{m.metodoMuertes === 'solo-saqueo' ? '*' : ''}{m.muertesSinMob > 0.1 * m.muertes ? '†' : ''}</>}</td>
                  <td style={S.td}>{m.peleaS == null ? '?' : `${Math.round(m.peleaS)} s`}</td>
                  <td style={S.td}>{pct(m.combatePct)} · {pct(m.saqueoPct)} · {pct(m.restoPct)}</td>
                  <td style={S.td}><b>{oro(m.oroHSubasta)}</b><div style={S.etiqueta}>{cp(lang, 'vend.', 'vend.')} {oro(m.oroHVendedor)}</div></td>
                  <td style={S.td}>{m.prediccion ? oro(m.prediccion.oroH) : '—'}</td>
                  <td style={S.td}>{m.prediccion ? `${signo(m.prediccion.errorRitmo)} · ${signo(m.prediccion.errorBotin)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {metricas.some((m) => m.metodoMuertes === 'solo-saqueo') && <p style={S.sub}>{cp(lang, '* Muertes contadas solo por saqueo: los mobs sin botín no cuentan.', '* Kills counted from looting only: mobs without loot are missed.')}</p>}
          {metricas.some((m) => m.muertesSinMob > 0.1 * m.muertes) && <p style={S.sub}>{cp(lang, '† El juego ocultó de qué mob era parte de las muertes: cuentan en el ritmo, pero esa sesión no ajusta los drops por mob.', '† The game hid which mob some kills were: they count toward pace, but that session does not adjust per-mob drops.')}</p>}
        </div>
      )}
      <p style={S.sub} data-testid="farm-estilo">
        {estilo?.source === 'sesiones'
          ? cp(lang, `Tu estilo (${estilo.muertes} muertes en ${estilo.sesiones} sesiones): DPS efectivo ${estilo.dpsK.toFixed(1)}×nivel, saqueo ${estilo.lootSec.toFixed(1)} s, pausas ${pct(estilo.downtime)}.`,
            `Your style (${estilo.muertes} kills in ${estilo.sesiones} sessions): effective DPS ${estilo.dpsK.toFixed(1)}×level, looting ${estilo.lootSec.toFixed(1)} s, downtime ${pct(estilo.downtime)}.`)
          : cp(lang, `Tu estilo: faltan muertes medidas (${estilo?.muertes || 0} de 30) para calibrar; el plan usa supuestos por defecto.`, `Your style: not enough measured kills (${estilo?.muertes || 0} of 30) to calibrate; the plan uses default assumptions.`)}
        {' '}{cp(lang, '«Ritmo» y «botín» comparan lo real con lo predicho para los mismos mobs.', '"Pace" and "loot" compare the real result with the prediction for the same mobs.')}
      </p>
      <p style={S.sub} data-testid="farm-export">
        {exportado ? cp(lang, `Contexto para tu agente: ${ARCHIVO_AGENTE} (actualizado ${exportado}). Pídele «revisa mis sesiones de farmeo».`, `Context for your agent: ${ARCHIVO_AGENTE} (updated ${exportado}). Ask it to "review my farming sessions".`)
          : cp(lang, 'El contexto para tu agente se escribe en la carpeta de datos del plugin al leer sesiones.', 'The context for your agent is written to the plugin data folder when sessions are read.')}
      </p>
    </div>
  )
}

// Componente controlado: la vista (mercado.jsx) calcula el contexto del motor y
// carga las sesiones, porque la columna de Mercado usa el mismo contexto.
export function Farmeo({ ctx, items, perfil, settings, onSettings, lang, planCtx, sesiones = [], abierta = null, lectura = null, onLeer, estilo = null, resumenPerfil = null }) {
  const cambiar = (parcial) => onSettings({ ...settings, ...parcial })
  const cambiarProf = (k, v) => cambiar({ prof: { ...settings.prof, [k]: v } })

  const plan = useMemo(() => {
    if (!items?.length || !planCtx) return null
    try { return FarmPlan.plan(planCtx, { hours: settings.horas }) } catch { return null }
  }, [items, planCtx, settings.horas])
  const ranking = useMemo(() => {
    if (!items?.length || !planCtx) return []
    try { return FarmPlan.ranking(planCtx, 8) } catch { return [] }
  }, [items, planCtx])
  // Meta de oro del jugador (oro entero en ajustes; el motor trabaja en cobre).
  const meta = useMemo(() => (plan?.best && settings.meta > 0
    ? FarmPlan.goal(plan.best, settings.meta * 10000, (settings.tengo || 0) * 10000) : null), [plan, settings.meta, settings.tengo])
  // Evaluación completa para el agente (ranking + cada mob elegible + precios usados).
  const evaluacion = useMemo(() => {
    if (!items?.length || !planCtx) return null
    try { return FarmPlan.evaluate(planCtx) } catch { return null }
  }, [items, planCtx])
  const metricas = useMemo(() => {
    try { return (sesiones || []).map((s) => metricasSesion(s, items?.length ? planCtx : null, D.dropData)) } catch { return [] }
  }, [sesiones, planCtx, items])

  // Skill de Herboristería (182) y Minería (186): lo que el jugador escribió en
  // Profesiones (`skill-<id>`) o, si no, lo declarado en `niveles-oficio`.
  const [skillOficio, setSkillOficio] = useState({ herb: null, mine: null })
  useEffect(() => {
    let vivo = true
    ;(async () => {
      let niveles = null
      try { niveles = (await leerNiveles(ctx)).niveles } catch { niveles = null }
      const r = {}
      for (const [k, id] of [['herb', 182], ['mine', 186]]) {
        let v = null
        try { v = await ctx?.storage?.get?.('skill-' + id, null) } catch { v = null }
        r[k] = Number.isInteger(v) && v >= 0 && v <= 300 ? v : nivelDe(niveles, id, null)
      }
      if (vivo) setSkillOficio(r)
    })()
    return () => { vivo = false }
  }, [ctx])

  // Motor heredado solo para recolección (nodos de hierbas/minería).
  const guia = useMemo(() => guiaCurada(perfil), [perfil])
  const perfilViejo = useMemo(() => perfilMotor(perfil, hubZonesDe(perfil?.nivel || 12, guia?.datos?.routes, D.zonas, perfil?.faccion)), [perfil, guia])
  const profs = useMemo(() => {
    if (!items?.length || !(settings.prof?.herb || settings.prof?.mine)) return []
    try { return Farm.profRecommendations(items, perfilViejo, { ...settings, prof: { ...settings.prof, skin: false }, skill: skillOficio }) } catch { return [] }
  }, [items, perfilViejo, settings, skillOficio])

  // Contexto del agente: se reescribe cuando cambian sesiones, estilo o plan.
  const [exportado, setExportado] = useState(null)
  const ultimo = useRef('')
  useEffect(() => {
    if (!ctx?.files?.writeText || (!metricas.length && !plan)) return
    const payload = exportAgente({ sesiones, metricas, estilo, plan, perfil, evaluacion, meta })
    const firma = JSON.stringify({ ...payload, generado: null })
    if (firma === ultimo.current) return
    const h = setTimeout(async () => {
      if (await exportarAgente(ctx, payload)) { ultimo.current = firma; setExportado(new Date().toLocaleTimeString(lang === 'en' ? 'en' : 'es')) }
    }, 1500)
    return () => clearTimeout(h)
  }, [ctx, sesiones, metricas, estilo, plan, perfil, evaluacion, meta, lang])

  const snapshotDavi = useMemo(() => construirContextoFarmeo({ plan, estilo, metricas, resumenPerfil, lang,
    procedencia: ['WoWForeverFarm.lua (sesiones medidas)', 'CMaNGOS classic-db 1.12 (drops)', 'Auctionator / puente (precios)'] }), [plan, estilo, metricas, resumenPerfil, lang])

  return (
    <Tarjeta titulo={cp(lang, 'Farmeo · oro por sesión', 'Farming · gold per session')}
      extra={<span style={S.etiqueta}>{cp(lang, 'estimación + tus sesiones', 'estimate + your sessions')}</span>}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Opcion etiqueta={cp(lang, 'Sesión', 'Session')} value={settings.horas} onChange={(v) => cambiar({ horas: +v })}
          opciones={[[1, '1 h'], [2, '2 h'], [3, '3 h'], [4, '4 h']]} />
        <Opcion etiqueta={cp(lang, 'Tope de venta', 'Sell cap')} value={settings.tope} onChange={(v) => cambiar({ tope: v })}
          opciones={[['k2', cp(lang, '2 % de lo publicado', '2% of listings')], ['k5', cp(lang, '5 % de lo publicado', '5% of listings')],
            ['k10', cp(lang, '10 % de lo publicado', '10% of listings')], ['libre', cp(lang, 'sin tope (optimista)', 'no cap (optimistic)')]]} />
        <CampoOro id="wf-farm-meta" etiqueta={cp(lang, 'Meta (oro)', 'Goal (gold)')} value={settings.meta} onChange={(v) => cambiar({ meta: v })} />
        <CampoOro id="wf-farm-tengo" etiqueta={cp(lang, 'Tengo (oro)', 'I have (gold)')} value={settings.tengo} onChange={(v) => cambiar({ tengo: v })} />
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Marca checked={settings.prof?.skin} onChange={(v) => cambiarProf('skin', v)}>{t(lang, 'mercado.farm.prof.skin')}</Marca>
        <Marca checked={settings.prof?.herb} onChange={(v) => cambiarProf('herb', v)}>{t(lang, 'mercado.farm.prof.herb')}</Marca>
        <Marca checked={settings.prof?.mine} onChange={(v) => cambiarProf('mine', v)}>{t(lang, 'mercado.farm.prof.mine')}</Marca>
        <Marca checked={settings.montura} onChange={(v) => cambiar({ montura: v })}>{cp(lang, 'Montura', 'Mount')}</Marca>
        <Marca checked={settings.group} onChange={(v) => cambiar({ group: v })}>{t(lang, 'mercado.farm.grupo')}</Marca>
        <Marca checked={settings.pvp !== false} onChange={(v) => cambiar({ pvp: v })}>{t(lang, 'mercado.farm.pvp')}</Marca>
        <Marca checked={settings.miEstilo !== false} onChange={(v) => cambiar({ miEstilo: v })}>{cp(lang, 'Usar mis métricas', 'Use my metrics')}</Marca>
      </div>

      {!items?.length ? <p style={S.sub}>{t(lang, 'mercado.farm.sinScan')}</p> : (
        <>
          <h4 style={{ ...S.titulo, fontSize: 13, margin: '6px 0 0' }}>{cp(lang, 'Plan de sesión', 'Session plan')}</h4>
          <PlanSesion plan={plan} planCtx={planCtx} meta={meta} lang={lang} />
          <p style={S.sub} data-testid="farm-pesca-nota">{cp(lang,
            'Pesca: el plugin no la estima. La base de Classic que usa no trae los bancos de peces ni los restos de naufragio (donde salen los cofres), y la pesca en agua abierta casi no deja oro. Mídela tú: /wff start, pesca (la primera captura arranca el reloj), /wff stop y /reload; tu oro/h real aparece en Mis sesiones.',
            'Fishing: the plugin does not estimate it. Its Classic database lacks fish pools and floating wreckage (where chests come from), and open-water fishing yields almost no gold. Measure it yourself: /wff start, fish (the first catch starts the clock), /wff stop and /reload; your real gold/h shows up in My sessions.')}</p>

          {ranking.length > 0 && (
            <div>
              <h4 style={{ ...S.titulo, fontSize: 13, margin: '6px 0 2px' }}>{cp(lang, 'Mejores campamentos (1 h, cada uno solo)', 'Best camps (1 h, each on its own)')}</h4>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                {ranking.map((f) => <FilaCampamento key={f.id} f={f} lang={lang} />)}
              </ul>
            </div>
          )}
        </>
      )}

      <h4 style={{ ...S.titulo, fontSize: 13, margin: '6px 0 0' }}>{cp(lang, 'Mis sesiones (WoWForeverFarm)', 'My sessions (WoWForeverFarm)')}</h4>
      <MisSesiones metricas={metricas} abierta={abierta} lectura={lectura} onLeer={onLeer} estilo={estilo} exportado={exportado} lang={lang} />
      <div data-testid="farm-davi"><PreguntarDavi ctx={ctx} lang={lang} seccion={cp(lang, 'Farmeo', 'Farming')} snapshot={snapshotDavi}
        preguntaInicial={cp(lang, '¿Cómo mejoro mi oro por hora farmeando?', 'How do I improve my gold per hour farming?')} /></div>

      {profs.length > 0 && (
        <div>
          <div style={S.etiqueta}>{t(lang, 'mercado.farm.porProfesion')}</div>
          {profs.map((p) => (
            <div key={p.kind} style={{ marginTop: 6 }}>
              <b style={{ fontSize: 12 }}>{p.name}</b>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                {p.zones.map((z) => (
                  <li key={z.zoneKey}>{z.name} · ~{Farm.fmt?.gph ? Farm.fmt.gph(z.gph) : z.gph}/h {t(lang, 'mercado.farm.enMateriales')}{z.items?.length ? ` · ${z.items.join(' · ')}` : ''}</li>
                ))}
              </ul>
            </div>
          ))}
          <p style={S.sub} data-testid="farm-prof-skill">{['herb', 'mine'].filter((k) => settings.prof?.[k]).map((k) => {
            const nom = k === 'herb' ? cp(lang, 'Herboristería', 'Herbalism') : cp(lang, 'Minería', 'Mining')
            return skillOficio[k] == null
              ? cp(lang, `${nom}: sin tu skill (escríbelo en Profesiones); se asume que recolectas los nodos de tu nivel.`, `${nom}: no skill set (enter it in Professions); nodes of your level are assumed.`)
              : cp(lang, `${nom} ${skillOficio[k]}: solo nodos que puedes recolectar.`, `${nom} ${skillOficio[k]}: only nodes you can gather.`)
          }).join(' ')}</p>
          <p style={S.sub}>{t(lang, 'mercado.farm.porProfesionNota')}</p>
        </div>
      )}
      <p style={{ ...S.sub, color: C.texto2 }}>{cp(lang,
        'Cómo se calcula: campamentos reales (spawns a ≤60 yd), muertes/h según la vida del mob, tu DPS, saqueo, desuello y caminata entre spawns; valor completo de cada muerte (monedas, botín directo, basura compartida, desuello); lo que pasa del tope de venta se valora a vendedor. Precio = mediana de mínimos diarios (14 días). Ningún número es una venta garantizada.',
        'How it works: real camps (spawns ≤60 yd apart), kills/h from mob health, your DPS, looting, skinning and walking between spawns; full value of each kill (coins, direct loot, shared junk, skinning); anything above the sell cap is valued at vendor price. Price = median of daily minimums (14 days). No number is a guaranteed sale.')}</p>
    </Tarjeta>
  )
}
