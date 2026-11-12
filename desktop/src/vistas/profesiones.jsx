// Profesiones: elige una (las del perfil primero), mira sus entrenadores de tu
// facción, el plan de subida estimado y la tabla de recetas con costo, valor y
// margen según tus precios de mercado. El skill se guarda en ctx.storage ('skill-<id>').
import { useMemo, useState } from 'react'
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hermes/plugin-sdk'
import { preciosDelMercado } from '../../../src/crafteo.js'
import { D, PRINCIPALES, SECUNDARIAS, nombre, zona } from '../datos.js'
import { C, S } from '../estilos.js'
import { agregarTextos, t } from '../i18n.js'
import { Hueco, Origen, Tarjeta } from '../ui.jsx'
import { TablaRecetas } from './profesiones/tabla.jsx'
import { PlanSubida } from './profesiones/plan.jsx'
import { FuentesReceta } from './profesiones/fuentes.jsx'

agregarTextos({
  'prof.skill': 'Skill',
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

export function VistaProfesiones({ ctx, estado, perfil, lang, irA }) {
  const datos = D.profesiones.profesiones
  // Primero las profesiones del perfil (principales y luego secundarias), luego las demás.
  const orden = useMemo(() => {
    const elegidas = [...(perfil.profesiones || []), ...(perfil.secundarias || [])].filter((id) => datos[String(id)])
    const set = new Set(elegidas)
    return [...elegidas, ...ORDEN_BASE.filter((id) => !set.has(id))]
  }, [perfil, datos])
  const [pid, setPid] = useState(() => orden[0])
  const [skills, setSkills] = useState({})
  const [sel, setSel] = useState(null)
  const pidReal = datos[String(pid)] ? pid : orden[0]
  const prof = datos[String(pidReal)]

  const skillDe = (id) => {
    if (Object.prototype.hasOwnProperty.call(skills, id)) return skills[id]
    const v = ctx.storage.get('skill-' + id, 0)
    return Number.isInteger(v) && v >= 0 && v <= 300 ? v : 0
  }
  const skill = prof ? skillDe(pidReal) : 0
  const cambiarSkill = async (v) => {
    const n = Math.floor(Number(v))
    if (!Number.isFinite(n)) return
    const c = Math.max(0, Math.min(300, n))
    setSkills((s) => ({ ...s, [pidReal]: c }))
    try { await ctx.storage.set('skill-' + pidReal, c) } catch { /* queda solo en pantalla */ }
  }

  const [todosEntr, setTodosEntr] = useState(false)
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

  if (!prof) return <Tarjeta titulo={t(lang, 'tab.profesiones')}><Hueco lang={lang}>{t(lang, 'prof.huecoEntrenadores')}</Hueco></Tarjeta>

  return (
    <>
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
                <span style={S.sub}>{pct(e.x)}%, {pct(e.y)}%</span>
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
        faccion={perfil.faccion} lang={lang} sel={sel} onSel={setSel} />

      <FuentesReceta prof={prof} sel={sel} precios={precios} items={D.items.items}
        faccion={perfil.faccion} lang={lang} />
    </>
  )
}
