// Piezas de interfaz compartidas por las vistas.
import { Fragment } from 'react'
import { C, CALIDAD, CLASES_RICAS, S } from './estilos.js'
import { dinero, item, nombre } from './datos.js'
import { t } from './i18n.js'

export function Tarjeta({ titulo, extra, children, estilo }) {
  return (
    <section style={{ ...S.tarjeta, ...estilo }}>
      {titulo ? <div style={S.tarjetaTitulo}><span>{titulo}</span>{extra}</div> : null}
      {children}
    </section>
  )
}

// De dónde sale un dato: generado de CMaNGOS 1.12 (aproximado para Forever), del cliente
// de Forever, o curado a mano.
const ORIGEN = {
  'cmangos-1.12': { k: 'origen.cmangos', c: C.naranja },
  'cliente-forever': { k: 'origen.cliente', c: C.verde },
  curado: { k: 'origen.curado', c: C.azul },
}
export function Origen({ f, lang }) {
  const lista = Array.isArray(f) ? f : f ? [f] : []
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      {lista.filter((x) => ORIGEN[x]).map((x) => (
        <span key={x} title={t(lang, ORIGEN[x].k + '.ayuda')} style={{ ...S.chip, borderColor: ORIGEN[x].c, color: ORIGEN[x].c }}>
          {t(lang, ORIGEN[x].k)}
        </span>
      ))}
    </span>
  )
}

// Un dato que falta, dicho explícitamente.
export function Hueco({ children, lang }) {
  return <div role="note" style={S.hueco}><b>{t(lang, 'sinDatos')}</b> {children}</div>
}

export function Aviso({ children }) {
  return <div role="note" style={S.aviso}>{children}</div>
}

export function NombreItem({ id, lang, cantidad }) {
  const it = item(id)
  if (!it) return <span style={{ color: C.texto3 }}>#{id}</span>
  const otro = nombre(it.n, lang === 'en' ? 'es' : 'en')
  return (
    <span title={otro !== nombre(it.n, lang) ? otro : undefined} style={{ color: CALIDAD[it.calidad] || C.texto }}>
      {nombre(it.n, lang) || '#' + id}{cantidad > 1 ? ' ×' + cantidad : ''}
    </span>
  )
}

export function Dinero({ cobre }) {
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{dinero(cobre)}</span>
}

export function Fila({ children, estilo }) {
  return <div style={{ ...S.fila, ...estilo }}>{children}</div>
}

// ---------------------------------------------------------------- texto curado
// Las guías curadas guardan texto con un subconjunto pequeño de HTML (<b>, <div class="card">,
// <h3>…). Se convierte a elementos React con una lista blanca: nunca innerHTML; una etiqueta o
// atributo desconocido se ignora y su texto se muestra como texto.
const PERMITIDAS = new Set(['b', 'strong', 'i', 'em', 'br', 'div', 'p', 'h3', 'h4', 'span', 'ul', 'ol', 'li', 'small', 'code'])
const VACIAS = new Set(['br'])
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ', middot: '·', mdash: '—', ndash: '–', rarr: '→', larr: '←', hellip: '…', times: '×' }
const decodificar = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (m, e) => {
  if (ENT[e.toLowerCase()] !== undefined) return ENT[e.toLowerCase()]
  if (e[0] === '#') {
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
  }
  return m
})
const ESTILO_ETIQUETA = { h3: { fontSize: 13, fontWeight: 600, margin: 0 }, h4: { fontSize: 12, fontWeight: 600, margin: 0 },
  p: { margin: 0 }, ul: { margin: 0, paddingLeft: 18 }, ol: { margin: 0, paddingLeft: 18 },
  code: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12 } }

export function arbolRico(html) {
  const raiz = { tag: null, hijos: [] }
  const pila = [raiz]
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)|(<)/g
  let m
  while ((m = re.exec(String(html ?? ''))) !== null) {
    const cima = pila[pila.length - 1]
    if (m[4] !== undefined || m[5] !== undefined) { cima.hijos.push(decodificar(m[4] ?? '<')); continue }
    const cierre = m[1] === '/', tag = m[2].toLowerCase()
    if (!PERMITIDAS.has(tag)) continue
    if (cierre) {
      for (let k = pila.length - 1; k > 0; k--) if (pila[k].tag === tag) { pila.length = k; break }
      continue
    }
    const clase = /\bclass\s*=\s*"([^"]*)"/.exec(m[3] || '')
    const nodo = { tag, clases: clase ? clase[1].split(/\s+/).filter(Boolean) : [], hijos: [] }
    cima.hijos.push(nodo)
    if (!VACIAS.has(tag) && !/\/\s*$/.test(m[3] || '')) pila.push(nodo)
  }
  return raiz.hijos
}

function aReact(nodos, ruta) {
  return nodos.map((n, i) => {
    const key = ruta + '.' + i
    if (typeof n === 'string') return <Fragment key={key}>{n}</Fragment>
    if (n.tag === 'br') return <br key={key} />
    const estilo = Object.assign({}, ESTILO_ETIQUETA[n.tag], ...n.clases.map((c) => CLASES_RICAS[c] || {}))
    const Tag = n.tag
    return <Tag key={key} style={estilo}>{aReact(n.hijos, key)}</Tag>
  })
}

export function TextoRico({ html }) {
  return <>{aReact(arbolRico(html), 'r')}</>
}
