// Tabla de recetas de una profesión: filtros (aprendibles ahora / todas / nuevas de
// Forever), búsqueda por nombre y columnas de dificultad, qué crea, reactivos, cómo
// se aprende, costo, valor, margen y origen. Click en una fila la selecciona para el
// panel de reactivos.
import { useEffect, useMemo, useState } from 'react'
import { SearchField, SegmentedControl } from '@hermes/plugin-sdk'
import { costoReceta, dificultad, margen, valorCreado } from '../../../../src/crafteo.js'
import { dinero, nombre } from '../../datos.js'
import { C, DIFICULTAD, S } from '../../estilos.js'
import { agregarTextos, t } from '../../i18n.js'
import { Dinero, NombreItem, Origen, Tarjeta } from '../../ui.jsx'

agregarTextos({
  'prof.recetas': 'Recetas',
  'prof.filtro.ahora': 'Aprendibles ahora',
  'prof.filtro.todas': 'Todas',
  'prof.filtro.forever': 'Nuevas de Forever',
  'prof.buscar': 'Buscar receta o ítem…',
  'prof.col.dificultad': 'Dificultad',
  'prof.col.crea': 'Crea',
  'prof.col.reactivos': 'Reactivos',
  'prof.col.como': 'Se aprende',
  'prof.col.costo': 'Costo',
  'prof.col.valor': 'Valor',
  'prof.col.margen': 'Margen',
  'prof.diff.no': 'no',
  'prof.diff.naranja': 'naranja',
  'prof.diff.amarillo': 'amarillo',
  'prof.diff.verde': 'verde',
  'prof.diff.gris': 'gris',
  'prof.diff.desconocida': '?',
  'prof.como.entrenador': 'Entrenador',
  'prof.como.automatica': 'Automática',
  'prof.como.desconocido': 'Desconocido',
  'prof.como.receta': 'Objeto receta',
  'prof.recetaItem': 'se aprende con',
  'prof.encantamiento': 'encantamiento',
  'prof.recetas.vacio': 'Ninguna receta coincide con estos filtros.',
}, {
  'prof.recetas': 'Recipes',
  'prof.filtro.ahora': 'Learnable now',
  'prof.filtro.todas': 'All',
  'prof.filtro.forever': 'New in Forever',
  'prof.buscar': 'Search recipe or item…',
  'prof.col.dificultad': 'Difficulty',
  'prof.col.crea': 'Creates',
  'prof.col.reactivos': 'Reagents',
  'prof.col.como': 'Learned from',
  'prof.col.costo': 'Cost',
  'prof.col.valor': 'Value',
  'prof.col.margen': 'Margin',
  'prof.diff.no': 'no',
  'prof.diff.naranja': 'orange',
  'prof.diff.amarillo': 'yellow',
  'prof.diff.verde': 'green',
  'prof.diff.gris': 'gray',
  'prof.diff.desconocida': '?',
  'prof.como.entrenador': 'Trainer',
  'prof.como.automatica': 'Automatic',
  'prof.como.desconocido': 'Unknown',
  'prof.como.receta': 'Recipe item',
  'prof.recetaItem': 'learned from',
  'prof.encantamiento': 'enchant',
  'prof.recetas.vacio': 'No recipe matches these filters.',
})

const APRENDIBLES = new Set(['naranja', 'amarillo', 'verde', 'gris'])

// dinero() no maneja negativos; el margen puede serlo. Mismo formato con signo.
function DineroSigno({ cobre }) {
  if (cobre == null || !Number.isFinite(cobre)) return <Dinero cobre={null} />
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{cobre < 0 ? '-' + dinero(-cobre) : dinero(cobre)}</span>
}
const num = (v) => (Number.isFinite(v) ? v : null)
const nivelDe = (r) => num(r.rango?.aprende) ?? num(r.rango?.amarillo) ?? num(r.rango?.verde) ?? num(r.rango?.gris) ?? 9999

function textoDe(r, items) {
  const partes = [r.n?.es, r.n?.en]
  if (r.crea) {
    const it = items[String(r.crea[0])]
    if (it) partes.push(it[0], it[1])
  }
  for (const [i] of r.reactivos || []) {
    const it = items[String(i)]
    if (it) partes.push(it[0], it[1])
  }
  return partes.filter(Boolean).join(' ').toLowerCase()
}

function ComoAprende({ r, faccion, lang }) {
  if (r.como === 'entrenador') return <span>{t(lang, 'prof.como.entrenador')}</span>
  if (r.como === 'automatica') return <span>{t(lang, 'prof.como.automatica')}</span>
  if (r.como === 'desconocido') return <span style={{ color: C.texto3 }}>{t(lang, 'prof.como.desconocido')}</span>
  const vendedores = (r.vendedores?.[faccion] || [])
  return (
    <span>
      {t(lang, 'prof.como.receta')}
      {r.receta_item != null ? <> · <NombreItem id={r.receta_item} lang={lang} /></> : null}
      {vendedores.length ? <span style={{ color: C.texto3 }}> · {vendedores.map((v) => nombre(v.n, lang)).join(', ')}</span> : null}
    </span>
  )
}

export function TablaRecetas({ prof, skill, precios, items, faccion, lang, sel, onSel }) {
  const [filtro, setFiltro] = useState('ahora')
  const [q, setQ] = useState('')

  const conteos = useMemo(() => ({
    ahora: prof.recetas.filter((r) => APRENDIBLES.has(dificultad(r.rango, skill))).length,
    todas: prof.recetas.length,
    forever: prof.recetas.filter((r) => r.f === 'cliente-forever').length,
  }), [prof, skill])

  const filas = useMemo(() => {
    const buscado = q.trim().toLowerCase()
    let rs = prof.recetas.filter((r) => {
      if (filtro === 'ahora' && !APRENDIBLES.has(dificultad(r.rango, skill))) return false
      if (filtro === 'forever' && r.f !== 'cliente-forever') return false
      return !buscado || textoDe(r, items).includes(buscado)
    })
    return [...rs].sort((a, b) => nivelDe(a) - nivelDe(b) || a.spell - b.spell)
  }, [prof, skill, filtro, q, items])

  // Si no hay selección (o cambió de profesión), propone la primera fila visible.
  useEffect(() => {
    if (sel == null && filas.length) onSel(filas[0].spell)
  }, [filas, sel, onSel])

  const info = useMemo(() => {
    const m = new Map()
    for (const r of filas) {
      const d = dificultad(r.rango, skill)
      m.set(r.spell, {
        d,
        costo: costoReceta(r, precios, items).total,
        valor: valorCreado(r, precios, items),
        margen: margen(r, precios, items),
      })
    }
    return m
  }, [filas, skill, precios, items])

  return (
    <Tarjeta titulo={t(lang, 'prof.recetas') + ' · ' + prof.recetas.length}
      extra={<Origen f={prof.f || 'cmangos-1.12'} lang={lang} />}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <SegmentedControl value={filtro} onChange={setFiltro} options={[
          { id: 'ahora', label: `${t(lang, 'prof.filtro.ahora')} (${conteos.ahora})` },
          { id: 'todas', label: `${t(lang, 'prof.filtro.todas')} (${conteos.todas})` },
          { id: 'forever', label: `${t(lang, 'prof.filtro.forever')} (${conteos.forever})` },
        ]} />
        <SearchField placeholder={t(lang, 'prof.buscar')} value={q} onChange={setQ} />
      </div>
      {filas.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={S.tabla}>
            <thead>
              <tr>
                <th style={S.th}>{t(lang, 'prof.col.dificultad')}</th>
                <th style={S.th}>{t(lang, 'prof.col.crea')}</th>
                <th style={S.th}>{t(lang, 'prof.col.reactivos')}</th>
                <th style={S.th}>{t(lang, 'prof.col.como')}</th>
                <th style={S.th}>{t(lang, 'prof.col.costo')}</th>
                <th style={S.th}>{t(lang, 'prof.col.valor')}</th>
                <th style={S.th}>{t(lang, 'prof.col.margen')}</th>
                <th style={S.th} />
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => {
                const i = info.get(r.spell)
                const activa = sel === r.spell
                return (
                  <tr key={r.spell} onClick={() => onSel(r.spell)}
                    style={{ cursor: 'pointer', background: activa ? C.fondo3 : undefined }}>
                    <td style={{ ...S.td, color: DIFICULTAD[i.d] || C.texto3, whiteSpace: 'nowrap' }}>
                      {t(lang, 'prof.diff.' + i.d)}
                    </td>
                    <td style={S.td}>
                      {r.crea
                        ? <><NombreItem id={r.crea[0]} lang={lang} cantidad={r.crea[1]} /></>
                        : <>{nombre(r.n, lang)} <span style={{ color: C.texto3 }}>· {t(lang, 'prof.encantamiento')}</span></>}
                    </td>
                    <td style={{ ...S.td, fontSize: 11, color: C.texto2 }}>
                      {(r.reactivos || []).map(([it, cant]) => (
                        <div key={it}><NombreItem id={it} lang={lang} cantidad={cant} /></div>
                      ))}
                    </td>
                    <td style={{ ...S.td, fontSize: 11 }}><ComoAprende r={r} faccion={faccion} lang={lang} /></td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}><Dinero cobre={i.costo} /></td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}><Dinero cobre={i.valor} /></td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap', color: i.margen == null ? C.texto3 : i.margen >= 0 ? C.verde : C.rojo }}>
                      <DineroSigno cobre={i.margen} />
                    </td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}><Origen f={r.f} lang={lang} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <div style={S.sub}>{t(lang, 'prof.recetas.vacio')}</div>}
    </Tarjeta>
  )
}
