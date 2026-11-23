// Clase del personaje: entrenadores de su facción, hechizos por nivel, misiones de clase y
// competencias. Todo generado; los huecos se dicen.
import { useState } from 'react'
import { Button } from '@hermes/plugin-sdk'
import { D, dinero, huecos, nombre, zona } from '../datos.js'
import { C, S } from '../estilos.js'
import { agregarTextos, t } from '../i18n.js'
import { Hueco, Origen } from '../ui.jsx'

agregarTextos({ 'clase.opcional': 'Información de clase (opcional)' }, { 'clase.opcional': 'Class reference (optional)' })

// Native disclosure: keyboard accessible, closed on mount, content mounted only on demand.
function DetalleClase({ titulo, extra, children }) {
  const [abierto, setAbierto] = useState(false)
  return <details data-class-section style={S.tarjeta} onToggle={(e) => setAbierto(e.currentTarget.open)}>
    <summary style={{ cursor: 'pointer', color: C.texto2 }}>{titulo}</summary>
    {abierto ? <div style={{ paddingTop: 10 }}>
      <div style={S.tarjetaTitulo}>{extra}</div>
      {children}
    </div> : null}
  </details>
}

const VENTANA = 10   // niveles por delante que se muestran como "próximos"

export function VistaClase({ perfil, lang }) {
  const [todos, setTodos] = useState(false)
  const cl = D.clases.clases[String(perfil.clase)]
  const entrenadores = cl.entrenadores[perfil.faccion] || []
  const sinEntrenador = huecos('clases', { tema: 'entrenadores', clase: perfil.clase, faccion: perfil.faccion })
  const hechizos = [...cl.hechizos].sort((a, b) => a.nivel - b.nivel || a.spell - b.spell)
  const visibles = todos ? hechizos : hechizos.filter((h) => h.nivel > perfil.nivel - 2 && h.nivel <= perfil.nivel + VENTANA)
  const misiones = (cl.misiones[perfil.faccion] || []).map((id) => [id, D.misiones.misiones[String(id)]]).filter(([, m]) => m)
    .sort((a, b) => a[1].nivel - b[1].nivel)
  const porZona = new Map()
  for (const e of entrenadores) {
    const k = e.zona == null ? '—' : nombre(zona(e.zona)?.n, lang) || String(e.zona)
    porZona.set(k, [...(porZona.get(k) || []), e])
  }

  return (
    <section aria-label={t(lang, 'clase.opcional')}>
      <div style={S.etiqueta}>{t(lang, 'clase.opcional')}</div>
      <DetalleClase titulo={t(lang, 'clase.entrenadores') + ' · ' + nombre(D.personaje.facciones[perfil.faccion].n, lang)}
        extra={<Origen f="cmangos-1.12" lang={lang} />}>
        {sinEntrenador.length ? <Hueco lang={lang}>{t(lang, 'clase.sinEntrenador')}</Hueco> : null}
        {[...porZona.entries()].sort().map(([z, lista]) => (
          <div key={z} style={S.fila}>
            <span style={{ minWidth: 160, color: C.texto2 }}>{z}</span>
            <span>{lista.map((e) => nombre(e.n, lang)).join(', ')}</span>
          </div>
        ))}
      </DetalleClase>

      <DetalleClase titulo={t(lang, 'clase.hechizos')} extra={<>
        <Origen f="cmangos-1.12" lang={lang} />
        <Button variant="ghost" size="xs" onClick={() => setTodos(!todos)}>{todos ? t(lang, 'clase.menos') : t(lang, 'clase.todos')}</Button>
      </>}>
        {!todos ? <div style={S.sub}>{t(lang, 'clase.proximos')} · {t(lang, 'clase.hastaNivel')} {perfil.nivel + VENTANA}</div> : null}
        {visibles.length ? (
          <table style={S.tabla}>
            <thead><tr><th style={S.th}>{t(lang, 'clase.nivel')}</th><th style={S.th}>{t(lang, 'clase.hechizo')}</th><th style={S.th}>{t(lang, 'clase.costo')}</th></tr></thead>
            <tbody>
              {visibles.map((h) => (
                <tr key={h.spell + ':' + h.nivel} style={{ opacity: h.nivel <= perfil.nivel ? 1 : 0.75 }}>
                  <td style={S.td}>{h.nivel}</td>
                  <td style={S.td}>{nombre(h.n, lang)}</td>
                  <td style={S.td}>{dinero(h.costo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div style={S.sub}>{t(lang, 'clase.ninguno')}</div>}
      </DetalleClase>

      <DetalleClase titulo={t(lang, 'clase.misiones')} extra={<Origen f="cmangos-1.12" lang={lang} />}>
        {misiones.length ? misiones.map(([id, m]) => (
          <div key={id} style={{ ...S.fila, opacity: m.min > perfil.nivel ? 0.6 : 1 }}>
            <span style={{ minWidth: 40, color: C.texto3 }}>{m.nivel}</span>
            <span style={{ flex: 1 }}>{nombre(m.t, lang)}</span>
            <span style={S.sub}>{m.zona != null ? nombre(zona(m.zona)?.n, lang) : m.dungeon != null ? nombre(D.dungeons.clasicos[String(m.dungeon)]?.n, lang) : ''}</span>
          </div>
        )) : <Hueco lang={lang}>{t(lang, 'clase.misiones')}</Hueco>}
      </DetalleClase>

      <DetalleClase titulo={t(lang, 'clase.competencias')} extra={<Origen f="cliente-forever" lang={lang} />}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {cl.competencias.map((c) => <span key={c.id} style={S.chip}>{nombre(c.n, lang)}</span>)}
        </div>
      </DetalleClase>
    </section>
  )
}
