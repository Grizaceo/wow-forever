// Clase del personaje: entrenadores de su facción, hechizos por nivel, misiones de clase y
// competencias. Todo generado; los huecos se dicen con el motivo declarado.
//
// Se muestra dentro de Perfil como información opcional: cuatro desplegables nativos,
// cerrados al montar, cuyo contenido se monta solo al abrirlos (no hay pestaña Clase).
//
// Alcance de cada bloque (docs/MODELO-DATOS.md §clases.json):
//   · hechizos    → de CLASE: la misma lista para las dos facciones (aproximación 1.12).
//   · misiones    → de FACCIÓN: se filtran por la facción del perfil.
//   · entrenadores→ de clase y facción: hay lista de entrenadores por facción.
//   · competencias → del cliente de Forever (tabla del cliente).
import { useState } from 'react'
import { Button } from '@hermes/plugin-sdk'
import { D, dinero, nombre } from '../datos.js'
import { C, S } from '../estilos.js'
import { agregarTextos, t } from '../i18n.js'
import { Hueco, Origen } from '../ui.jsx'

agregarTextos({ 'clase.opcional': 'Información de clase (opcional)' }, { 'clase.opcional': 'Class reference (optional)' })

// Native disclosure: keyboard accessible, closed on mount, content mounted only on demand.
// `tarjeta` conserva el contrato `data-tarjeta` de P0 para localizar cada bloque.
function DetalleClase({ tarjeta, titulo, extra, children }) {
  const [abierto, setAbierto] = useState(false)
  return <details data-class-section data-tarjeta={tarjeta} style={S.tarjeta} onToggle={(e) => setAbierto(e.currentTarget.open)}>
    <summary style={{ cursor: 'pointer', color: C.texto2 }}>{titulo}</summary>
    {abierto ? <div style={{ paddingTop: 10 }}>
      <div style={S.tarjetaTitulo}>{extra}</div>
      {children}
    </div> : null}
  </details>
}

// Contenedor común: rótulo de información opcional.
function SeccionClase({ lang, tarjeta, children }) {
  return <section aria-label={t(lang, 'clase.opcional')} data-tarjeta={tarjeta}>
    <div style={S.etiqueta}>{t(lang, 'clase.opcional')}</div>
    {children}
  </section>
}

const VENTANA = 10   // niveles por delante que se muestran como "próximos"

// Fuentes de cada bloque de la vista (MODELO-DATOS.md §clases.json).
const FUENTE = { hechizos: 'cmangos-1.12', misiones: 'cmangos-1.12', entrenadores: 'cmangos-1.12', competencias: 'cliente-forever' }

export function VistaClase({ perfil, lang, datos = D }) {
  const [todos, setTodos] = useState(false)
  const clases = (datos.clases && datos.clases.clases) || {}
  const cl = clases[String(perfil && perfil.clase)]
  const faccion = perfil && perfil.faccion

  // Perfil incompleto: se dice qué falta, no se rompe la vista ni se inventa una facción.
  if (!perfil || !perfil.clase || !cl) {
    return (
      <SeccionClase lang={lang} tarjeta="clase-sin-datos">
        <Hueco lang={lang}>{t(lang, 'clase.sinPerfil')}</Hueco>
      </SeccionClase>
    )
  }
  if (!faccion || !(datos.personaje.facciones || {})[faccion]) {
    return (
      <SeccionClase lang={lang} tarjeta="clase-sin-datos">
        <Hueco lang={lang}>{t(lang, 'clase.sinFaccion')}</Hueco>
      </SeccionClase>
    )
  }

  const nombreFaccion = nombre((datos.personaje.facciones[faccion] || {}).n, lang)
  // Huecos declarados en la fuente: con su motivo literal, no con una explicación inventada.
  const sinEntrenador = ((datos.clases.huecos) || [])
    .filter((h) => h.tema === 'entrenadores' && h.clase === perfil.clase && h.faccion === faccion)
  const entrenadores = (cl.entrenadores && cl.entrenadores[faccion]) || []
  const hechizos = [...(cl.hechizos || [])].sort((a, b) => a.nivel - b.nivel || a.spell - b.spell)
  const visibles = todos ? hechizos : hechizos.filter((h) => h.nivel > perfil.nivel - 2 && h.nivel <= perfil.nivel + VENTANA)
  const misiones = ((cl.misiones && cl.misiones[faccion]) || [])
    .map((id) => [id, ((datos.misiones.misiones) || {})[String(id)]])
    .filter(([, m]) => m)
    .sort((a, b) => a[1].nivel - b[1].nivel)
  const porZona = new Map()
  for (const e of entrenadores) {
    const z = e.zona == null ? null : (((datos.zonas.zonas) || {})[String(e.zona)] || null)
    const k = e.zona == null ? '—' : nombre(z && z.n, lang) || String(e.zona)
    porZona.set(k, [...(porZona.get(k) || []), e])
  }
  return (
    <SeccionClase lang={lang}>
      <div data-tarjeta="clase-ficha" style={{ ...S.sub, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <span>{t(lang, 'clase.fuentesFicha')}</span>
        <div data-fuentes="clase"><Origen f={cl.f} lang={lang} fallback /></div>
      </div>

      <DetalleClase tarjeta="clase-entrenadores" titulo={t(lang, 'clase.entrenadores') + ' · ' + nombreFaccion}
        extra={<Origen f={FUENTE.entrenadores} lang={lang} />}>
        <div style={S.sub}>{t(lang, 'clase.entrenadoresNota')}</div>
        {sinEntrenador.length ? <Hueco lang={lang}>{t(lang, 'clase.sinEntrenador')} {t(lang, 'clase.motivo')} {sinEntrenador.map((h) => h.motivo).join(' ')}</Hueco> : null}
        {[...porZona.entries()].sort().map(([z, lista]) => (
          <div key={z} style={S.fila}>
            <span style={{ minWidth: 160, color: C.texto2 }}>{z}</span>
            <span>{lista.map((e) => nombre(e.n, lang)).join(', ')}</span>
          </div>
        ))}
      </DetalleClase>

      <DetalleClase tarjeta="clase-hechizos" titulo={t(lang, 'clase.hechizos')} extra={<>
        <Origen f={FUENTE.hechizos} lang={lang} />
        <Button variant="ghost" size="xs" onClick={() => setTodos(!todos)}>{todos ? t(lang, 'clase.menos') : t(lang, 'clase.todos')}</Button>
      </>}>
        <div style={S.sub}>{t(lang, 'clase.hechizosNota')}</div>
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

      <DetalleClase tarjeta="clase-misiones" titulo={t(lang, 'clase.misiones') + ' · ' + nombreFaccion}
        extra={<Origen f={FUENTE.misiones} lang={lang} />}>
        <div style={S.sub}>{t(lang, 'clase.misionesNota')}</div>
        {misiones.length ? misiones.map(([id, m]) => (
          <div key={id} data-mision={id} style={{ ...S.fila, opacity: m.min > perfil.nivel ? 0.6 : 1 }}>
            <span style={{ minWidth: 40, color: C.texto3 }}>{m.nivel}</span>
            <span style={{ flex: 1 }}>{nombre(m.t, lang)}</span>
            <span style={S.sub}>{m.zona != null ? nombre((((datos.zonas.zonas) || {})[String(m.zona)] || {}).n, lang) : m.dungeon != null ? nombre((((datos.dungeons.clasicos) || {})[String(m.dungeon)] || {}).n, lang) : ''}</span>
          </div>
        )) : <Hueco lang={lang}>{t(lang, 'clase.misionesSinDatos')}</Hueco>}
      </DetalleClase>

      <DetalleClase tarjeta="clase-competencias" titulo={t(lang, 'clase.competencias')}
        extra={<Origen f={FUENTE.competencias} lang={lang} />}>
        <div style={S.sub}>{t(lang, 'clase.competenciasNota')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(cl.competencias || []).map((c) => <span key={c.id} style={S.chip}>{nombre(c.n, lang)}</span>)}
        </div>
      </DetalleClase>
    </SeccionClase>
  )
}
