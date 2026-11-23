// Profesiones: elige una (las del perfil primero), mira sus entrenadores de tu
// facción, el plan de subida estimado y la tabla de recetas con costo, valor y
// margen según tus precios de mercado. El skill se guarda en ctx.storage ('skill-<id>');
// las recetas que ya tienes, en ('recetas-propias') vía recetas-propias.js.
import { useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hermes/plugin-sdk'
import { preciosDelMercado } from '../../../src/crafteo.js'
import { perfilParaAgente } from '../../../src/perfil.js'
import { D, PRINCIPALES, SECUNDARIAS, nombre, zona } from '../datos.js'
import { C, S } from '../estilos.js'
import { agregarTextos, t } from '../i18n.js'
import { Hueco, Origen, Tarjeta } from '../ui.jsx'
import { construirContextoProfesion } from '../davi.js'
import { catalogoMercado } from '../mercado-logica.js'
import { SEMILLA, alternar, guardarPropias, leerPropias, normalizarLista, resumenRecetario } from '../recetas-propias.js'
import { SEMILLA as SEMILLA_NIVELES, leerNiveles as leerNivelesOficio, nivelDe } from '../oficios.js'
import { TablaRecetas } from './profesiones/tabla.jsx'
import { PanelVenta } from './profesiones/venta.jsx'
import { PlanSubida } from './profesiones/plan.jsx'
import { FuentesReceta } from './profesiones/fuentes.jsx'
import { PreguntarDavi } from './preguntar-davi.jsx'

agregarTextos({
  'prof.skill': 'Skill',
  'prof.skill.declarado': 'Declarado a mano (no lo leyó el juego)',
  'prof.tipo.principal': 'Principal',
  'prof.tipo.secundaria': 'Secundaria',
  'prof.recoleccion': 'Recolección',
  'prof.enPerfil': 'En tu perfil',
  'prof.entrenadores': 'Entrenadores',
  'prof.entr.siguiente': 'Los que enseñan tu siguiente tramo (hasta {max}).',
  'prof.entr.todos': 'Ver los {n} entrenadores',
  'prof.entr.menos': 'Ver solo el siguiente tramo',
  'prof.hasta': 'hasta {max}',
  'prof.huecoEntrenadores': 'Sin entrenadores de esta profesión en tu facción en los datos (CMaNGOS 1.12).',
  'prof.elegirReceta': 'Elige una receta de la tabla para ver de dónde sacar sus reactivos.',
}, {
  'prof.skill': 'Skill',
  'prof.skill.declarado': 'Hand-declared (the game did not read it)',
  'prof.tipo.principal': 'Primary',
  'prof.tipo.secundaria': 'Secondary',
  'prof.recoleccion': 'Gathering',
  'prof.enPerfil': 'In your profile',
  'prof.entrenadores': 'Trainers',
  'prof.entr.siguiente': 'Trainers who teach your next tier (up to {max}).',
  'prof.entr.todos': 'Show all {n} trainers',
  'prof.entr.menos': 'Show only the next tier',
  'prof.hasta': 'up to {max}',
  'prof.huecoEntrenadores': 'No trainers for this profession in your faction in the data (CMaNGOS 1.12).',
  'prof.elegirReceta': 'Pick a recipe from the table to see where to get its reagents.',
})

const ORDEN_BASE = [...PRINCIPALES, ...SECUNDARIAS]
const num = (v) => (Number.isFinite(v) ? v : 0)
const pct = (v) => (Number.isFinite(v) ? String(Math.round(v * 10) / 10) : '—')
const NOMBRES_PROF = Object.fromEntries(
  Object.entries(D.profesiones.profesiones).map(([id, p]) => [id, p.n]),
)
// De dónde sale el contexto de «Preguntar a DAVI» en Profesiones.
const PROCEDENCIA_PROF = [
  'data/profesiones.json',
  'data/items.json',
  'builds: cliente-forever ' + (D.profesiones.meta?.builds?.['cliente-forever'] || '?')
    + ' / cmangos-1.12 ' + (D.profesiones.meta?.builds?.['cmangos-1.12'] || '?'),
]

export function VistaProfesiones({ ctx, estado, perfil, lang, irA, guardarPerfil }) {
  const toggle = (lista, id, max) => lista.includes(id) ? lista.filter((x) => x !== id) : lista.length < max ? [...lista, id] : lista
  const [errorPerfil, setErrorPerfil] = useState('')
  const cambiarProfesiones = async (parcial) => {
    try {
      const r = await guardarPerfil({ ...perfil, ...parcial })
      setErrorPerfil(r.ok ? '' : t(lang, 'perfil.incompleto'))
    } catch (e) { setErrorPerfil(e.message || String(e)) }
  }
  const datos = D.profesiones.profesiones
  // Primero las profesiones del perfil (principales y luego secundarias), luego las demás.
  const orden = useMemo(() => {
    const elegidas = [...(perfil.profesiones || []), ...(perfil.secundarias || [])].filter((id) => datos[String(id)])
    const set = new Set(elegidas)
    return [...elegidas, ...ORDEN_BASE.filter((id) => !set.has(id))]
  }, [perfil, datos])
  const [pid, setPid] = useState(() => orden[0])
  const [skills, setSkills] = useState({})
  // Niveles de oficio declarados a mano (oficios.js, p. ej. Pesca 93): solo siembran
  // cuando el jugador no escribió un nivel propio en `skill-<id>`.
  const [niveles, setNiveles] = useState(() => ({ ...SEMILLA_NIVELES }))
  useEffect(() => {
    let vivo = true
    leerNivelesOficio(ctx)
      .then((r) => { if (vivo) setNiveles(r.niveles) })
      .catch(() => { /* sin storage queda la semilla en pantalla */ })
    return () => { vivo = false }
  }, [ctx])
  const [sel, setSel] = useState(null)
  const pidReal = datos[String(pid)] ? pid : orden[0]
  const prof = datos[String(pidReal)]

  // {v, origen}: el nivel escrito a mano manda; si no hay, el declarado; si no, 0.
  const skillDe = (id) => {
    if (Object.prototype.hasOwnProperty.call(skills, id)) return { v: skills[id], origen: 'manual' }
    const guardado = ctx.storage.get('skill-' + id, null)
    if (Number.isInteger(guardado) && guardado >= 0 && guardado <= 300) return { v: guardado, origen: 'manual' }
    const declarado = nivelDe(niveles, id, null)
    return declarado === null ? { v: 0, origen: 'vacio' } : { v: declarado, origen: 'declarado' }
  }
  const skillInfo = prof ? skillDe(pidReal) : { v: 0, origen: 'vacio' }
  const skill = skillInfo.v
  const skillDeclarado = skillInfo.origen === 'declarado'
  const cambiarSkill = async (v) => {
    const n = Math.floor(Number(v))
    if (!Number.isFinite(n)) return
    const c = Math.max(0, Math.min(300, n))
    setSkills((s) => ({ ...s, [pidReal]: c }))
    try { await ctx.storage.set('skill-' + pidReal, c) } catch { /* queda solo en pantalla */ }
  }

  const [todosEntr, setTodosEntr] = useState(false)
  // Recetas propias (declaradas por el jugador): la semilla pinta la primera vez y lo
  // guardado la reemplaza en cuanto llega; cada marca se persiste y se relee.
  const [propias, setPropias] = useState(() => normalizarLista(SEMILLA))
  useEffect(() => {
    let vivo = true
    leerPropias(ctx)
      .then((r) => { if (vivo) setPropias(r.spells) })
      .catch(() => { /* sin storage queda la semilla en pantalla */ })
    return () => { vivo = false }
  }, [ctx])
  const conjuntoPropias = useMemo(() => new Set(propias), [propias])
  const alternarPropia = async (spell) => {
    const nueva = alternar(propias, spell)
    setPropias(nueva)
    try { await guardarPropias(ctx, nueva) } catch { /* queda solo en pantalla */ }
  }
  const precios = useMemo(() => preciosDelMercado(estado.market, perfil.reino), [estado.market, perfil.reino])
  const trainers = prof && prof.entrenadores ? prof.entrenadores[perfil.faccion] || [] : []
  // Plegada: solo los que enseñan el siguiente tramo por encima de tu skill.
  const siguiente = Math.min(Infinity, ...trainers.map((e) => num(e.max)).filter((m) => m > skill))
  const delTramo = Number.isFinite(siguiente) ? trainers.filter((e) => num(e.max) === siguiente) : []
  const plegada = !todosEntr && delTramo.length > 0 && delTramo.length < trainers.length
  const visibles = plegada ? delTramo : trainers
  const porZona = new Map()
  for (const e of visibles) {
    const z = e.zona == null ? '—' : nombre(zona(e.zona)?.n, lang) || String(e.zona)
    if (!porZona.has(z)) porZona.set(z, [])
    porZona.get(z).push(e)
  }
  const enPerfil = new Set([...(perfil.profesiones || []), ...(perfil.secundarias || [])])
  const catalogo = useMemo(() => catalogoMercado(D.items, D.dungeons), [])
  const resumenPerfil = useMemo(() => perfilParaAgente(perfil, D.personaje, NOMBRES_PROF, lang), [perfil, lang])
  // Receta seleccionada (su spell); si no hay ninguna, solo se adjunta la profesión y el skill.
  const recetaSel = useMemo(
    () => (prof && sel == null ? null : prof ? prof.recetas.find((r) => r.spell === sel) || null : null),
    [prof, sel],
  )
  const recetario = useMemo(() => resumenRecetario(prof?.recetas, propias), [prof, propias])
  const snapshotDavi = useMemo(() => (!prof ? null : construirContextoProfesion({
    id: pidReal, nombre: prof.n, skill, receta: recetaSel, itemsJson: D.items, catalogo,
    precios, lang, resumenPerfil, procedencia: PROCEDENCIA_PROF, market: estado.market, reino: perfil.reino,
    recetario, skillDeclarado,
  })), [prof, pidReal, skill, recetaSel, catalogo, precios, lang, resumenPerfil, estado.market, perfil.reino, recetario, skillDeclarado])

  if (!prof) return <Tarjeta titulo={t(lang, 'tab.profesiones')}><Hueco lang={lang}>{t(lang, 'prof.huecoEntrenadores')}</Hueco></Tarjeta>

  return (
    <>
      <Tarjeta titulo={t(lang, 'perfil.profesiones')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {PRINCIPALES.map((id) => (
            <label key={id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Checkbox checked={perfil.profesiones.includes(id)}
                onCheckedChange={() => cambiarProfesiones({ profesiones: toggle(perfil.profesiones, id, 2) })} />
              {nombre(D.profesiones.profesiones[id].n, lang)}
            </label>
          ))}
        </div>
        <span style={S.etiqueta}>{t(lang, 'perfil.secundarias')}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {SECUNDARIAS.map((id) => (
            <label key={id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Checkbox checked={perfil.secundarias.includes(id)}
                onCheckedChange={() => cambiarProfesiones({ secundarias: toggle(perfil.secundarias, id, 3) })} />
              {nombre(D.profesiones.profesiones[id].n, lang)}
            </label>
          ))}
        </div>
      </Tarjeta>
      {errorPerfil ? <div role="alert" style={S.sub}>{errorPerfil}</div> : null}
      <Tarjeta titulo={t(lang, 'tab.profesiones')} extra={<Origen f={prof.f || 'cmangos-1.12'} lang={lang} />}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label style={S.campo} htmlFor="wf-profesion">
            <span style={S.etiqueta}>{t(lang, 'tab.profesiones')}</span>
            <Select value={String(pidReal)} onValueChange={(v) => { setPid(Number(v)); setSel(null) }}>
              <SelectTrigger id="wf-profesion" aria-label={t(lang, 'tab.profesiones')}><SelectValue /></SelectTrigger>
              <SelectContent>
                {orden.map((id) => (
                  <SelectItem key={id} value={String(id)}>
                    {nombre(datos[String(id)].n, lang)}{enPerfil.has(id) ? ' ★' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label style={S.campo} htmlFor={'wf-skill-' + pidReal}>
            <span style={S.etiqueta}>{t(lang, 'prof.skill')}</span>
            <Input id={'wf-skill-' + pidReal} type="number" min={0} max={300} value={skill}
              onChange={(e) => cambiarSkill(e.target.value)} style={{ width: 90 }} />
          </label>
          <span style={S.chip}>{t(lang, prof.tipo === 'secundaria' ? 'prof.tipo.secundaria' : 'prof.tipo.principal')}</span>
          {prof.recoleccion ? <span style={S.chip}>{t(lang, 'prof.recoleccion')}</span> : null}
          {skillDeclarado ? <span style={S.chip}>{t(lang, 'prof.skill.declarado')}</span> : null}
          {enPerfil.has(pidReal) ? <span style={S.chip}>{t(lang, 'prof.enPerfil')}</span> : null}
        </div>
      </Tarjeta>

      <Tarjeta titulo={t(lang, 'prof.entrenadores') + ' · ' + nombre(D.personaje.facciones[perfil.faccion].n, lang)}
        extra={<Origen f="cmangos-1.12" lang={lang} />}>
        {plegada ? <div style={S.sub}>{t(lang, 'prof.entr.siguiente', { max: siguiente })}</div> : null}
        {porZona.size ? [...porZona.entries()].sort().map(([z, lista]) => (
          <div key={z} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ ...S.fila, borderBottom: 'none', paddingBottom: 0 }}>
              <span style={{ color: C.texto2 }}>{z}</span>
            </div>
            {lista.map((e) => (
              <div key={e.npc} style={S.fila}>
                <span style={{ flex: 1 }}>{nombre(e.n, lang)}</span>
                <span style={S.sub} title={lang === 'en' ? 'Map coordinates (X, Y)' : 'Coordenadas en el mapa (X, Y)'}>X {pct(e.x)}% · Y {pct(e.y)}%</span>
                <span style={S.sub}>{t(lang, 'prof.hasta', { max: num(e.max) })}</span>
              </div>
            ))}
          </div>
        )) : <Hueco lang={lang}>{t(lang, 'prof.huecoEntrenadores')}</Hueco>}
        {delTramo.length > 0 && delTramo.length < trainers.length ? (
          <div>
            <Button size="xs" variant="outline" onClick={() => setTodosEntr(!todosEntr)}>
              {todosEntr ? t(lang, 'prof.entr.menos') : t(lang, 'prof.entr.todos', { n: trainers.length })}
            </Button>
          </div>
        ) : null}
      </Tarjeta>

      <PlanSubida prof={prof} skill={skill} trainers={trainers} precios={precios}
        items={D.items.items} lang={lang} irA={irA} faccion={perfil.faccion} />

      <TablaRecetas prof={prof} skill={skill} precios={precios} items={D.items.items}
        faccion={perfil.faccion} lang={lang} sel={sel} onSel={setSel}
        propias={conjuntoPropias} onPropia={alternarPropia} />

      <PanelVenta recetas={prof.recetas} propias={conjuntoPropias} precios={precios}
        items={D.items.items} market={estado.market} lang={lang} />

      <FuentesReceta prof={prof} sel={sel} precios={precios} items={D.items.items}
        faccion={perfil.faccion} lang={lang} />

      <Tarjeta titulo={t(lang, 'davi.boton')}>
        <PreguntarDavi ctx={ctx} lang={lang} seccion={t(lang, 'tab.profesiones')} snapshot={snapshotDavi}
          preguntaInicial={t(lang, 'davi.profesiones')} />
      </Tarjeta>
    </>
  )
}
