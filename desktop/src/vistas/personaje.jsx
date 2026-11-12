// Selector de personaje: facción → raza → clase, nivel, profesiones y reino.
import { useState } from 'react'
import { Button, Checkbox, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hermes/plugin-sdk'
import { perfilParaAgente, razasPara } from '../../../src/perfil.js'
import { D, FACCIONES, PRINCIPALES, SECUNDARIAS, nombre } from '../datos.js'
import { C, S } from '../estilos.js'
import { agregarTextos, t } from '../i18n.js'
import { Aviso, Origen, Tarjeta } from '../ui.jsx'

agregarTextos({
  'perfil.copiar': 'Copiar perfil para el agente',
  'perfil.copiar.ayuda': 'Pégalo en el chat de Hermes: la skill wow-forever lo usa para responder sobre tu personaje.',
  'perfil.copiado': 'Copiado. Pégalo en el chat de Hermes.',
  'perfil.noCopiado': 'No se pudo copiar. Selecciona el texto y cópialo a mano:',
}, {
  'perfil.copiar': 'Copy profile for the agent',
  'perfil.copiar.ayuda': 'Paste it into the Hermes chat: the wow-forever skill uses it to answer about your character.',
  'perfil.copiado': 'Copied. Paste it into the Hermes chat.',
  'perfil.noCopiado': 'Could not copy. Select the text and copy it by hand:',
})

const NOMBRES_PROF = Object.fromEntries(Object.entries(D.profesiones.profesiones).map(([id, p]) => [id, p.n]))
const CLASES = Object.keys(D.personaje.clases).map(Number).sort((a, b) => a - b)
const esNueva = (raza, clase) => D.personaje.combinaciones.some(([r, c, n]) => r === raza && c === clase && n)

function Selector({ etiqueta, valor, opciones, onChange, id }) {
  return (
    <label style={S.campo} htmlFor={id}>
      <span style={S.etiqueta}>{etiqueta}</span>
      <Select value={valor == null ? '' : String(valor)} onValueChange={(v) => onChange(v)}>
        <SelectTrigger id={id} aria-label={etiqueta}><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          {opciones.map(([v, texto]) => <SelectItem key={v} value={String(v)}>{texto}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  )
}

export function VistaPersonaje({ ctx, perfil, guardarPerfil, razaSupuesta, lang, irA }) {
  const [borrador, setBorrador] = useState(perfil)
  const [estado, setEstado] = useState('')
  const [copia, setCopia] = useState(null)
  const p = borrador

  const cambiar = async (parcial) => {
    const nuevo = { ...p, ...parcial }
    // Al cambiar facción o clase, la raza solo se conserva si sigue siendo válida.
    if (nuevo.faccion && nuevo.clase && !razasPara(D.personaje, nuevo.faccion, nuevo.clase).includes(nuevo.raza)) {
      const rs = razasPara(D.personaje, nuevo.faccion, nuevo.clase)
      nuevo.raza = rs.length === 1 ? rs[0] : null
    }
    setBorrador(nuevo)
    setEstado(t(lang, 'perfil.guardando'))
    try {
      const r = await guardarPerfil(nuevo)
      setEstado(r.ok ? t(lang, 'perfil.guardado') : t(lang, 'perfil.incompleto'))
    } catch (e) { setEstado(e.message || String(e)) }
  }

  const resumen = perfilParaAgente(p, D.personaje, NOMBRES_PROF)
  const copiar = async () => {
    let ok = false
    try { ok = (await ctx.os.writeClipboard(resumen)) === true } catch { ok = false }
    setCopia({ ok, texto: resumen })
  }

  const razas = p.faccion && p.clase ? razasPara(D.personaje, p.faccion, p.clase) : []
  const clasesFac = p.faccion ? CLASES.filter((c) => razasPara(D.personaje, p.faccion, c).length) : CLASES
  const toggle = (lista, id, max) => lista.includes(id) ? lista.filter((x) => x !== id) : lista.length < max ? [...lista, id] : lista

  return (
    <>
      <Tarjeta titulo={t(lang, 'tab.personaje')} extra={<Origen f="cliente-forever" lang={lang} />}>
        {razaSupuesta ? <Aviso>{t(lang, 'perfil.supuesta')}</Aviso> : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Selector id="wf-faccion" etiqueta={t(lang, 'perfil.faccion')} valor={p.faccion}
            opciones={FACCIONES.map((f) => [f, nombre(D.personaje.facciones[f].n, lang)])}
            onChange={(v) => cambiar({ faccion: v })} />
          <Selector id="wf-clase" etiqueta={t(lang, 'perfil.clase')} valor={p.clase}
            opciones={clasesFac.map((c) => [c, nombre(D.personaje.clases[c].n, lang)])}
            onChange={(v) => cambiar({ clase: Number(v) })} />
          <Selector id="wf-raza" etiqueta={t(lang, 'perfil.raza')} valor={p.raza}
            opciones={razas.map((r) => [r, nombre(D.personaje.razas[r].n, lang) + (esNueva(r, p.clase) ? ' ★' : '')])}
            onChange={(v) => cambiar({ raza: Number(v) })} />
          <label style={S.campo} htmlFor="wf-nivel">
            <span style={S.etiqueta}>{t(lang, 'perfil.nivel')}</span>
            <Input id="wf-nivel" type="number" min={1} max={60} value={p.nivel}
              onChange={(e) => cambiar({ nivel: Number(e.target.value) })} />
          </label>
          <label style={S.campo} htmlFor="wf-reino">
            <span style={S.etiqueta}>{t(lang, 'perfil.reino')}</span>
            <Input id="wf-reino" value={p.reino} maxLength={64} onChange={(e) => cambiar({ reino: e.target.value })} />
          </label>
        </div>
        {p.raza && p.clase && esNueva(p.raza, p.clase)
          ? <div style={{ ...S.sub, color: C.verde }}>★ {t(lang, 'perfil.nueva')}</div> : null}
        <div style={S.sub} role="status">{estado}</div>
      </Tarjeta>
      <Tarjeta titulo={t(lang, 'perfil.profesiones')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {PRINCIPALES.map((id) => (
            <label key={id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Checkbox checked={p.profesiones.includes(id)}
                onCheckedChange={() => cambiar({ profesiones: toggle(p.profesiones, id, 2) })} />
              {nombre(D.profesiones.profesiones[id].n, lang)}
            </label>
          ))}
        </div>
        <span style={S.etiqueta}>{t(lang, 'perfil.secundarias')}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {SECUNDARIAS.map((id) => (
            <label key={id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Checkbox checked={p.secundarias.includes(id)}
                onCheckedChange={() => cambiar({ secundarias: toggle(p.secundarias, id, 3) })} />
              {nombre(D.profesiones.profesiones[id].n, lang)}
            </label>
          ))}
        </div>
        {p.faccion && p.raza && p.clase
          ? <div><Button size="xs" onClick={() => irA('clase')}>{t(lang, 'tab.clase')} →</Button></div> : null}
      </Tarjeta>
      <Tarjeta titulo={t(lang, 'perfil.copiar')}>
        <div style={S.sub}>{t(lang, 'perfil.copiar.ayuda')}</div>
        <div>
          <Button size="xs" variant="outline" disabled={!resumen} onClick={copiar}>{t(lang, 'perfil.copiar')}</Button>
        </div>
        {copia ? <div style={S.sub} role="status">{t(lang, copia.ok ? 'perfil.copiado' : 'perfil.noCopiado')}</div> : null}
        {copia && !copia.ok ? <pre style={{ ...S.sub, whiteSpace: 'pre-wrap', userSelect: 'text' }}>{copia.texto}</pre> : null}
      </Tarjeta>
    </>
  )
}
