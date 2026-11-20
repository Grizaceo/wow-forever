// Panel «Qué vender ahora»: cruza tus recetas propias con los precios cargados y
// ordena por lo que deja cada plato tras comprar los reactivos y pagar la subasta.
// Límites que declara: los precios son ofertas anunciadas (no ventas observadas) y el
// panel no sabe qué peces puedes pescar con tu nivel: asume que compras los reactivos.
import { useMemo } from 'react'
import { Tarjeta, Dinero } from '../../ui.jsx'
import { C } from '../../estilos.js'
import { agregarTextos, t } from '../../i18n.js'
import { costoReceta, valorCreado } from '../../../../src/crafteo.js'
import { nombre } from '../../datos.js'

const COMISION = 0.05
const TOPE = 5
const NOTA = { fontSize: 11, color: C.texto3, lineHeight: 1.45, margin: '6px 0 0' }

agregarTextos({
  'prof.venta': 'Qué vender ahora',
  'prof.venta.col.receta': 'Receta',
  'prof.venta.col.neto': 'Neto tras comprar reactivos',
  'prof.venta.col.listadas': 'Listadas',
  'prof.venta.nota': 'Neto = plato menos 5% de subasta menos reactivos comprados. Precios de ofertas anunciadas, no de ventas cerradas; tu skill no limita lo que puedes comprar.',
  'prof.venta.vacio': 'Con estos precios ninguna de tus recetas deja margen: conviene vender el material crudo.',
  'prof.venta.sinPropias': 'No marcaste recetas como tuyas: se usan todas las de la profesión.',
}, {
  'prof.venta': 'What to sell now',
  'prof.venta.col.receta': 'Recipe',
  'prof.venta.col.neto': 'Net after buying reagents',
  'prof.venta.col.listadas': 'Listed',
  'prof.venta.nota': 'Net = dish minus 5% auction cut minus purchased reagents. Prices are asking prices, not closed sales; your skill does not limit what you can buy.',
  'prof.venta.vacio': 'At these prices none of your recipes leaves a margin: sell the raw material.',
  'prof.venta.sinPropias': 'You marked no recipes as yours: every recipe in the profession is used.',
})

// Existencias anunciadas del ítem en el snapshot cargado (0 si no aparece).
function listadas(market, itemId) {
  const realm = market?.realms?.[0] || market?.snapshot?.realms?.[0]
  const filas = realm?.items
  if (!Array.isArray(filas)) return 0
  const fila = filas.find((f) => Number(f?.itemId) === Number(itemId))
  const hist = Array.isArray(fila?.history) ? fila.history : []
  const ultima = hist.length ? hist[hist.length - 1] : null
  return Number.isFinite(ultima?.available) ? ultima.available : 0
}

export function PanelVenta({ recetas, propias, precios, items, market, lang }) {
  const tienePrecios = Boolean(precios && (precios instanceof Map ? precios.size : Object.keys(precios).length))
  const mias = propias instanceof Set ? propias : new Set(propias || [])

  const filas = useMemo(() => {
    if (!tienePrecios) return []
    const base = mias.size ? recetas.filter((r) => mias.has(r.spell)) : recetas
    const out = []
    for (const r of base) {
      const valor = valorCreado(r, precios, items)
      const costo = costoReceta(r, precios, items).total
      if (valor == null || costo == null) continue
      const neto = Math.round(valor * (1 - COMISION) - costo)
      if (neto <= 0) continue
      const crea = Array.isArray(r.crea) ? r.crea[0] : r.crea
      out.push({ spell: r.spell, nombre: nombre(r.n, lang), neto, valor, listadas: listadas(market, crea) })
    }
    return out.sort((a, b) => b.neto - a.neto || a.nombre.localeCompare(b.nombre)).slice(0, TOPE)
  }, [recetas, mias, precios, items, market, lang, tienePrecios])

  if (!tienePrecios) return null

  return (
    <Tarjeta titulo={t(lang, 'prof.venta') + (filas.length ? ' · ' + filas.length : '')}>
      {filas.length ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 8, fontSize: 11, color: C.texto3, padding: '0 6px 4px', borderBottom: `1px solid ${C.borde}` }}>
            <span style={{ flex: 1 }}>{t(lang, 'prof.venta.col.receta')}</span>
            <span style={{ width: 110, textAlign: 'right' }}>{t(lang, 'prof.venta.col.neto')}</span>
            <span style={{ width: 64, textAlign: 'right' }}>{t(lang, 'prof.venta.col.listadas')}</span>
          </div>
          {filas.map((f) => (
            <div key={f.spell} data-venta-fila=""
              style={{ display: 'flex', gap: 8, fontSize: 12, padding: '4px 6px', borderBottom: `1px solid ${C.borde2}` }}>
              <span style={{ flex: 1 }}>{f.nombre}</span>
              <span style={{ width: 110, textAlign: 'right', color: C.verde, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                <Dinero cobre={f.neto} />
              </span>
              <span style={{ width: 64, textAlign: 'right', color: C.texto3, fontVariantNumeric: 'tabular-nums' }}>{f.listadas || '—'}</span>
            </div>
          ))}
        </div>
      ) : (
        <p style={NOTA}>{t(lang, 'prof.venta.vacio')}</p>
      )}
      {mias.size ? null : <p style={NOTA}>{t(lang, 'prof.venta.sinPropias')}</p>}
      <p style={NOTA}>{t(lang, 'prof.venta.nota')}</p>
    </Tarjeta>
  )
}
