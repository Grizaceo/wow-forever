// De dónde sacar cada reactivo de la receta seleccionada: precio de vendedor o de
// subasta cuando existe, y las mejores fuentes de drop-data (mobs, desuello, hurtar
// y objetos con su zona). Lo que no está en los datos se dice, no se inventa.
import { useMemo } from 'react'
import { costoUnidad } from '../../../../src/crafteo.js'
import { D, dinero, nombre } from '../../datos.js'
import { C, S } from '../../estilos.js'
import { agregarTextos, t } from '../../i18n.js'
import { Hueco, NombreItem, Origen, Tarjeta } from '../../ui.jsx'

agregarTextos({
  'prof.detalle': 'De dónde sacar cada reactivo',
  'prof.fuente.vendedor': 'vendedor · {precio}',
  'prof.fuente.subasta': 'subasta ~{precio}',
  'prof.fuente.mob': '{nombre} · {zona} · ~{prob}%',
  'prof.fuente.objeto': '{nombre} ({tipo}) · {zona} · ~{prob}%',
  'prof.fuente.otraFac': 'otra facción',
  'prof.fuente.nada': 'sin fuentes en los datos',
  'prof.fuente.tipomob': 'mobs',
  'prof.fuente.tipodesuello': 'desuello',
  'prof.fuente.tipohurtar': 'hurtar',
  'prof.fuente.tipoobjeto': 'objeto',
}, {
  'prof.detalle': 'Where to get each reagent',
  'prof.fuente.vendedor': 'vendor · {precio}',
  'prof.fuente.subasta': 'auction ~{precio}',
  'prof.fuente.mob': '{nombre} · {zona} · ~{prob}%',
  'prof.fuente.objeto': '{nombre} ({tipo}) · {zona} · ~{prob}%',
  'prof.fuente.otraFac': 'other faction',
  'prof.fuente.nada': 'no sources in the data',
  'prof.fuente.tipomob': 'mobs',
  'prof.fuente.tipodesuello': 'skinning',
  'prof.fuente.tipohurtar': 'pickpocket',
  'prof.fuente.tipoobjeto': 'object',
})

const TIPO_FUENTE = { m: 'tipomob', s: 'tipodesuello', p: 'tipohurtar', o: 'tipoobjeto' }
const LADO = { alianza: 'a', horda: 'h' }
const num = (v) => (Number.isFinite(v) ? v : null)

function zonaDrop(drop, zk) {
  const z = drop && drop.zones ? drop.zones[zk] : null
  return z ? z[0] : null
}

// Mejoras fuentes de un ítem en drop-data: hasta `n` entradas [{tipo, nombre, zona,
// prob, min, max, fac}] ya resueltas. Las fuentes ya vienen ordenadas por el
// generador (chance × spawns); se toman las primeras.
function fuentesDe(itemId, drop, n = 3) {
  const it = drop && drop.items ? drop.items[String(itemId)] : null
  const srcs = it && Array.isArray(it[10]) ? it[10] : []
  const out = []
  for (const s of srcs) {
    if (out.length >= n) break
    const [tipo, id, prob, min, max] = s
    if (tipo === 'o') {
      const o = drop.objects && drop.objects[String(id)]
      if (!o) continue
      out.push({ tipo: 'objeto', subtipo: o[1], nombre: o[0], zona: zonaDrop(drop, o[2]),
        prob: num(prob), min: num(min), max: num(max) })
    } else if (tipo === 'm' || tipo === 's' || tipo === 'p') {
      const m = drop.mobs && drop.mobs[String(id)]
      if (!m) continue
      out.push({ tipo: TIPO_FUENTE[tipo] || 'tipomob', nombre: m[0], zona: zonaDrop(drop, m[4]),
        prob: num(prob), min: num(min), max: num(max), fac: m[7] })
    }
  }
  return out
}

const probTxt = (p) => (p === null ? '—' : String(Math.round(p * 10) / 10))
const rangoTxt = (min, max) => (max !== null && max > 1 ? ` ×${min ?? 1}-${max}` : '')

export function FuentesReceta({ prof, sel, precios, items, faccion, lang }) {
  const receta = useMemo(
    () => (sel != null ? prof.recetas.find((r) => r.spell === sel) : null) ?? null,
    [prof, sel])
  const drop = D.dropData
  const lado = LADO[faccion] || null

  return (
    <Tarjeta titulo={receta ? `${t(lang, 'prof.detalle')} · ${nombre(receta.n, lang)}` : t(lang, 'prof.detalle')}
      extra={<Origen f={['cmangos-1.12', 'cliente-forever']} lang={lang} />}>
      {!receta ? <div style={S.sub}>{t(lang, 'prof.elegirReceta')}</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(receta.reactivos || []).map(([itemId, cant]) => {
            const u = costoUnidad(itemId, precios, items)
            const fuentes = fuentesDe(itemId, drop)
            return (
              <div key={itemId} style={{ ...S.fila, flexWrap: 'wrap' }}>
                <span style={{ minWidth: 170 }}><NombreItem id={itemId} lang={lang} cantidad={cant} /></span>
                <span style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11 }}>
                  {u.fuente === 'vendedor'
                    ? <span style={{ color: C.texto2 }}>{t(lang, 'prof.fuente.vendedor', { precio: dinero(u.cobre) })}</span> : null}
                  {precios instanceof Map && precios.has(itemId)
                    ? <span style={{ color: C.texto2 }}>{t(lang, 'prof.fuente.subasta', { precio: dinero(precios.get(itemId)) })}</span> : null}
                  {fuentes.length ? fuentes.map((f, i) => (
                    <span key={i} style={{ color: C.texto2 }}>
                      {f.tipo === 'objeto'
                        ? t(lang, 'prof.fuente.objeto', { nombre: f.nombre, tipo: f.subtipo, zona: f.zona || '—', prob: probTxt(f.prob) })
                        : `${t(lang, 'prof.fuente.' + f.tipo)}: ` + t(lang, 'prof.fuente.mob', { nombre: f.nombre, zona: f.zona || '—', prob: probTxt(f.prob) })}
                      {rangoTxt(f.min, f.max)}
                      {f.fac && lado && !f.fac.includes(lado)
                        ? <span style={{ color: C.texto3 }}> · {t(lang, 'prof.fuente.otraFac')}</span> : null}
                    </span>
                  )) : <span style={{ color: C.texto3 }}>{t(lang, 'prof.fuente.nada')}</span>}
                </span>
              </div>
            )
          })}
          {!(receta.reactivos || []).length ? <Hueco lang={lang}>{nombre(receta.n, lang)}</Hueco> : null}
        </div>
      )}
    </Tarjeta>
  )
}
