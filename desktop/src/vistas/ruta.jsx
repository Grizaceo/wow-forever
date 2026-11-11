// Ruta de niveles: esqueleto generado por facción (zonas que rodean tu nivel con
// el recuento de misiones de misiones_por_zona, zona inicial de la raza y las
// misiones de la banda nivel−2…+5 agrupadas por zona o dungeon) y, cuando la
// clase tiene guía curada, la capa de bandas escritas a mano por continente
// (ruta/curada.jsx). El progreso de los pasos curados persiste en estado.build
// con la clave `steps`, el mismo formato que standalone/index.html.
import { useMemo, useState } from 'react'
import { D, guiaCurada, nombre, zona } from '../datos.js'
import {
  alternarEnLista, bandaActual, buildCambios, inicioDeRaza, leerBuild,
  listaBuild, misionesDeBanda, zonasDeNivel, zonasSinNiveles,
} from '../ruta-logica.js'
import { agregarTextos, t } from '../i18n.js'
import { C, S } from '../estilos.js'
import { Aviso, Hueco, Origen, Tarjeta } from '../ui.jsx'
import { CuradaRuta } from './ruta/curada.jsx'

agregarTextos({
  'ruta.zonas': 'Zonas a tu nivel',
  'ruta.zonasSub': 'Zonas de tu facción (o disputadas) cuyo rango de niveles te incluye, ordenadas por nivel. El número es cuántas misiones de tu facción hay en cada una.',
  'ruta.niveles': 'Nv {min}–{max}',
  'ruta.misionesDe': '{n} misiones',
  'ruta.ambos': 'Ambos bandos',
  'ruta.kalimdor': 'Kalimdor',
  'ruta.ek': 'Reinos del Este',
  'ruta.inicio': 'Zona inicial de tu raza',
  'ruta.sinInicio': 'Los datos no tienen zona de inicio para tu raza (hueco declarado en personaje.json).',
  'ruta.sinNiveles': 'Zonas sin rango de niveles en los datos (las nuevas de Forever y Moonglade):',
  'ruta.sinZonas': 'Ninguna zona con niveles de tu facción rodea tu nivel.',
  'ruta.misiones': 'Misiones de tu banda',
  'ruta.sinMisiones': 'No hay misiones de tu facción en esta banda.',
  'ruta.otras': 'Otras misiones',
}, {
  'ruta.zonas': 'Zones at your level',
  'ruta.zonasSub': 'Zones of your faction (or contested) whose level range includes you, sorted by level. The number is how many of your faction’s quests each has.',
  'ruta.niveles': 'Lv {min}–{max}',
  'ruta.misionesDe': '{n} quests',
  'ruta.ambos': 'Both factions',
  'ruta.kalimdor': 'Kalimdor',
  'ruta.ek': 'Eastern Kingdoms',
  'ruta.inicio': 'Your race’s starting zone',
  'ruta.sinInicio': 'The data has no starting zone for your race (declared gap in personaje.json).',
  'ruta.sinNiveles': 'Zones with no level range in the data (the new Forever ones and Moonglade):',
  'ruta.sinZonas': 'No zone with your faction’s level ranges surrounds your level.',
  'ruta.misiones': 'Quests in your band',
  'ruta.sinMisiones': 'No quests of your faction in this band.',
  'ruta.otras': 'Other quests',
})

const nombreDeZona = (id, lang) => {
  const z = zona(id)
  return z ? nombre(z.n, lang) || '#' + id : '#' + id
}
const nombreDeDungeon = (id, lang) => {
  const d = D.dungeons.clasicos[String(id)] || D.dungeons.forever[String(id)]
  return d ? nombre(d.n, lang) || '#' + id : '#' + id
}
const continenteDe = (c, lang) => (c === 'kalimdor' ? t(lang, 'ruta.kalimdor') : c === 'ek' ? t(lang, 'ruta.ek') : null)

// Las cadenas repiten el título en varias misiones (pasos o variantes por facción): se
// muestran una vez, con el rango de niveles y cuántas son.
function porTitulo(items, lang) {
  const grupos = new Map()
  for (const [id, m] of items) {
    const k = nombre(m.t, lang)
    const g = grupos.get(k)
    if (g) { g.ids.push(id); g.min = Math.min(g.min, m.nivel); g.max = Math.max(g.max, m.nivel) }
    else grupos.set(k, { id, m, ids: [id], min: m.nivel, max: m.nivel })
  }
  return [...grupos.values()].map((g) => ({ ...g, niveles: g.min === g.max ? String(g.min) : g.min + '–' + g.max }))
}

export function VistaRuta({ almacen, estado, recargar, perfil, lang }) {
  const [aviso, setAviso] = useState('')
  const build = useMemo(() => leerBuild(estado && estado.build), [estado && estado.build])
  const nivel = perfil.nivel
  const banda = bandaActual(nivel)
  const listaZonas = useMemo(() => zonasDeNivel(D.zonas, perfil.faccion, nivel), [perfil.faccion, nivel])
  const sinNiveles = useMemo(() => zonasSinNiveles(D.zonas), [])
  const grupos = useMemo(() => misionesDeBanda(D.misiones.misiones, perfil, D.dungeons), [perfil])
  const inicio = inicioDeRaza(D.personaje, perfil.raza)
  const { datos } = guiaCurada(perfil) || {}
  const pasos = useMemo(() => new Set(listaBuild(build, 'steps')), [build])

  const guardar = async (cambios) => {
    try {
      await buildCambios(almacen, cambios)
      setAviso('')
      recargar()
    } catch (e) {
      setAviso(e && e.message ? e.message : String(e))
    }
  }
  const alternarPaso = (id, puesto) => guardar({ steps: alternarEnLista(listaBuild(build, 'steps'), id, puesto) })

  const tituloGrupo = (g) => g.tipo === 'zona' ? nombreDeZona(g.id, lang)
    : g.tipo === 'dungeon' ? nombreDeDungeon(g.id, lang)
    : t(lang, 'ruta.otras')

  return (
    <>
      {aviso ? <Aviso>{aviso}</Aviso> : null}

      <Tarjeta titulo={t(lang, 'ruta.zonas')} estilo={{ gap: 4 }}
        extra={<Origen f={['cliente-forever', 'curado', 'cmangos-1.12']} lang={lang} />}>
        <div style={S.sub}>{t(lang, 'ruta.zonasSub')}</div>
        {inicio ? (nivel <= 10 ? (
          <div style={S.fila} data-inicio={inicio.zona}>
            <span style={{ flex: 1 }}>{t(lang, 'ruta.inicio')}</span>
            <span>{nombreDeZona(inicio.zona, lang)}</span>
          </div>
        ) : null) : (
          <Hueco lang={lang}>{t(lang, 'ruta.sinInicio')}</Hueco>
        )}
        {listaZonas.length ? listaZonas.map((z) => {
          const cont = continenteDe(z.continente, lang)
          return (
            <div key={z.id} data-zona={z.id} style={S.fila}>
              <span style={{ flex: 1, minWidth: 0 }}>{nombre(z.n, lang)}</span>
              <span style={{ ...S.sub, whiteSpace: 'nowrap' }}>{t(lang, 'ruta.niveles', { min: z.niveles.min, max: z.niveles.max })}</span>
              <span style={{ ...S.sub, whiteSpace: 'nowrap' }}>{z.misiones != null ? t(lang, 'ruta.misionesDe', { n: z.misiones }) : '—'}</span>
              {cont ? <span style={S.chip}>{cont}</span> : null}
              {z.faccion === 'disputada' ? <span style={S.chip}>{t(lang, 'ruta.ambos')}</span> : null}
            </div>
          )
        }) : <div style={S.sub}>{t(lang, 'ruta.sinZonas')}</div>}
        {sinNiveles.length ? (
          <Hueco lang={lang}>{t(lang, 'ruta.sinNiveles')} {sinNiveles.map((z) => nombre(z.n, lang)).filter(Boolean).join(', ')}</Hueco>
        ) : null}
      </Tarjeta>

      <Tarjeta titulo={t(lang, 'ruta.misiones') + ' · ' + t(lang, 'ruta.niveles', { min: banda.min, max: banda.max })}
        extra={<Origen f="cmangos-1.12" lang={lang} />}>
        {grupos.length ? grupos.map((g) => (
          <div key={g.tipo + ':' + (g.id ?? '')} data-grupo={g.tipo + ':' + (g.id ?? '')}>
            <div style={{ ...S.etiqueta, marginTop: 6 }}>{tituloGrupo(g)} · {g.items.length}</div>
            {porTitulo(g.items, lang).map(({ id, m, ids, niveles }) => (
              <div key={id} data-mision={id} data-misiones={ids.join(',')} style={{ ...S.fila, borderBottom: 'none', padding: '2px 0' }}>
                <span style={{ minWidth: 34, color: C.texto3 }}>{niveles}</span>
                <span style={{ flex: 1 }}>{nombre(m.t, lang)}{ids.length > 1 ? <span style={{ color: C.texto3 }}> ×{ids.length}</span> : null}</span>
              </div>
            ))}
          </div>
        )) : <div style={S.sub}>{t(lang, 'ruta.sinMisiones')}</div>}
      </Tarjeta>

      {datos && datos.routes ? (
        <CuradaRuta datos={datos} build={build} pasos={pasos} onPaso={alternarPaso} onGuardar={guardar} perfil={perfil} lang={lang} />
      ) : null}
    </>
  )
}
