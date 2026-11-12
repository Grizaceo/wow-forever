#!/usr/bin/env node
// build-referencias-skill.mjs — referencias Markdown de las guías curadas para la
// skill del agente (skills/wow-forever/references/*.md), generadas desde
// standalone/guide-*.js.
//
// Los guide-*.js son CommonJS (asignan module.exports.GUIDE_*): se cargan con
// createRequire. No dependencias y no se ejecuta ninguna función de las guías:
// solo se copian campos de datos (recExtra, simc.rows, etc. se omiten).
//
// Uso:
//   node tools/build-referencias-skill.mjs [--salida <carpeta>]
//   node tools/build-referencias-skill.mjs --verificar [--salida <carpeta>]

import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STANDALONE = path.join(ROOT, 'standalone')
const SALIDA_DEFECTO = path.join(ROOT, 'skills', 'wow-forever', 'references')
const LIMITE_ARCHIVO = 30 * 1024 // ~30 KB: si un .md lo pasa, las macros van a parte

const CLASES = {
  hunter:  { slug: 'cazador',  nombre: 'Cazador', archivo: 'guide-hunter.js',  exp: 'GUIDE_HUNTER' },
  warrior: { slug: 'guerrero', nombre: 'Guerrero', archivo: 'guide-warrior.js', exp: 'GUIDE_WARRIOR' },
  shaman:  { slug: 'chaman',   nombre: 'Chamán',   archivo: 'guide-shaman.js',  exp: 'GUIDE_SHAMAN'  },
}
const FACCIONES = { horde: 'Horda', alliance: 'Alianza' }
const FACCION_SLUG = { horde: 'horda', alliance: 'alianza' }
const REALMS = { kalimdor: 'Kalimdor', ek: 'Reinos del Este' }
const CONTINENTES = { K: 'Kalimdor', E: 'Reinos del Este' }

// Etiquetas de los árboles de perks de Legacy, con los mismos textos que muestra
// la página (desktop/src/vistas/legacy.jsx, claves guia.leg.tag.*).
const TAG_PERK = {
  gather: 'recolección', skill: 'skill', craft: 'craft', fish: 'pesca',
  vendor: 'vendors', crate: 'crates', xp: 'descanso', talent: 'talentos',
  combat: 'combate', camp: 'camp', heal: 'ventas', pvp: 'pvp',
  travel: 'viaje', party: 'party', dead: 'muerte', death: 'durabilidad',
  reagent: 'reagents', rep: 'rep', food: 'comida',
}
const OFICIOS_RECOLECCION = [['skin', 'Skinning'], ['herb', 'Herbalism'], ['mine', 'Mining']]

const req = createRequire(path.join(ROOT, 'tools', 'build-referencias-skill.mjs'))

export function cargarGuias() {
  return Object.entries(CLASES).map(([id, c]) => ({
    id, slug: c.slug, nombre: c.nombre, archivo: c.archivo,
    G: req(path.join(STANDALONE, c.archivo))[c.exp],
  }))
}

export function cargarLegacy() {
  return req(path.join(STANDALONE, 'guide-legacy.js')).GUIDE_LEGACY
}

// ---------------------------------------------------------------- HTML → Markdown
// Conversión mínima y determinista: <b>/<strong> → **…**, <i>/<em> → *…*,
// <br> → salto de línea, <li> → "- ", el resto de etiquetas se quita conservando
// el texto, y las entidades se decodifican. El texto se copia tal cual.

const ENT = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ',
  middot: '·', mdash: '—', ndash: '–', rarr: '→', larr: '←', hellip: '…', times: '×',
}
function decodificar(s) {
  return String(s).replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (m, e) => {
    const k = e.toLowerCase()
    if (ENT[k] !== undefined) return ENT[k]
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
    }
    return m
  })
}

const NEGRITA = new Set(['b', 'strong'])
const CURSIVA = new Set(['i', 'em'])
const BLOQUE = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'details', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
])
const VACIA = new Set(['br'])
// Tokeniza etiquetas HTML, comentarios/doctype e texto. El texto admite '<' literal
// cuando no abre una etiqueta (p. ej. "Execute (<20%)").
const RE_TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|<!--[\s\S]*?-->|<![^>]*>|<\?[\s\S]*?\?>|((?:[^<]|<(?![a-zA-Z\/!?]))+)/g

function mdLimpio(s) {
  return s.replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map((l) => l.trim()).join('\n')
    .replace(/^\n+|\n+$/g, '')
}

export function htmlAMd(html) {
  const s = String(html ?? '')
  if (!s.trim()) return ''
  let out = ''
  const pila = []
  for (const m of s.matchAll(RE_TAG)) {
    if (m[4] !== undefined) {
      const t = m[4]
      out += /^\s+$/.test(t) ? ' ' : decodificar(t).replace(/\s+/g, ' ')
      continue
    }
    if (m[2] === undefined) continue // comentario, doctype o <?…?>: se quita
    const tag = m[2].toLowerCase()
    const cierre = m[1] === '/'
    const selfClose = /\/\s*$/.test(m[3] || '')
    if (!cierre) {
      if (VACIA.has(tag)) { if (tag === 'br') out += '\n'; continue }
      if (NEGRITA.has(tag) || CURSIVA.has(tag)) {
        const c = NEGRITA.has(tag) ? '**' : '*'
        pila.push({ tag, cierre: c })
        out += c
        continue
      }
      if (selfClose) continue
      if (tag === 'li') { out += '\n- '; continue }
      if (BLOQUE.has(tag)) { out += '\n\n'; continue }
      continue // span y demás: etiqueta fuera, texto dentro
    }
    if (NEGRITA.has(tag) || CURSIVA.has(tag)) {
      let i = -1
      for (let k = pila.length - 1; k >= 0; k--) if (pila[k].tag === tag) { i = k; break }
      if (i < 0) continue
      while (pila.length > i) out += pila.pop().cierre
      continue
    }
    if (tag === 'li') continue // el siguiente <li>/</ul> ya pone el salto
    if (BLOQUE.has(tag)) { out += '\n\n'; continue }
  }
  return mdLimpio(out)
}

// Texto de la guía en una sola línea (celdas de tabla, viñetas, metadatos).
const plano = (s) => htmlAMd(s).replace(/\n+/g, ' ').replace(/ {2,}/g, ' ').trim()
const celda = (s) => plano(s).replace(/\|/g, '\\|')

// ---------------------------------------------------------------- secciones de clase

function secRutas(GF) {
  const routes = GF.routes || {}
  const llaves = Object.keys(routes)
  if (!llaves.length) return null
  const lineas = []
  for (const rk of llaves) {
    lineas.push(`### ${REALMS[rk] || rk}`, '')
    for (const b of routes[rk] || []) {
      let l = `- **${b.min}–${b.max}** — ${plano(b.zones)}`
      const notas = plano(b.notes)
      if (notas) l += `. ${notas}`
      lineas.push(l)
      const dung = plano(b.dung)
      if (dung) lineas.push(`  - Dungeons: ${dung}`)
    }
    lineas.push('')
  }
  return { id: 'rutas', titulo: 'Ruta de niveles', lineas }
}

function secHitos(GF) {
  const ms = GF.milestones || []
  if (!ms.length) return null
  const lineas = ['| Nivel | Categoría | Ubicación | Hito |', '|---|---|---|---|']
  for (const m of ms) {
    const loc = CONTINENTES[m.loc] || '—'
    lineas.push(`| ${m.lvl} | ${celda(m.cat)} | ${loc} | ${celda(m.txt)} |`)
  }
  return { id: 'hitos', titulo: 'Hitos', lineas }
}

function secArmas(G, GF) {
  const weapons = [...(GF.weapons || [])].sort((a, b) => a.lvl - b.lvl || a.dps - b.dps)
  if (!weapons.length) return null
  const lineas = ['| Arma | Tipo | DPS | Req | Fuente | Nota |', '|---|---|---|---|---|---|']
  for (const w of weapons) {
    const tipo = ((G.types && G.types[w.t]) || w.t || '') + (w.eng ? ' · ingeniería' : '')
    const dps = (Number(w.dps) || 0).toFixed(1) + (w.approx ? '~' : '')
    lineas.push(`| ${celda(w.n)} | ${celda(tipo)} | ${dps} | ${w.lvl} | ${celda(w.src)} | ${celda(w.note)} |`)
  }
  return { id: 'armas', titulo: 'Armas', lineas }
}

function secDungeons(G) {
  const ds = G.dungeons || []
  if (!ds.length) return null
  const lineas = []
  for (const d of ds) {
    const meta = [d.loc, CONTINENTES[d.cont] || d.cont, `niveles ${d.r[0]}–${d.r[1]}`, d.key ? '**clave**' : '']
      .filter(Boolean).join(' · ')
    lineas.push(`### ${plano(d.n)}`, '', meta, '')
    const nota = htmlAMd(d.note)
    if (nota) lineas.push(nota, '')
    for (const l of d.loot || []) lineas.push(`- ${plano(l[0])} — ${plano(l[1])}`)
    lineas.push('')
  }
  return { id: 'dungeons', titulo: 'Dungeons', lineas }
}

function secAh(G) {
  const ah = G.ahList || []
  if (!ah.length) return null
  const titulo = (G.extras && G.extras.ahTitle) || 'Lista de subasta'
  const lineas = ['| Ítem | Qué es | Nota |', '|---|---|---|']
  for (const a of ah) lineas.push(`| **${celda(a[0])}** | ${celda(a[1])} | ${celda(a[2])} |`)
  return { id: 'ah', titulo, lineas }
}

function secMacros(G) {
  const partes = []
  const bn = G.barNotes || {}
  const bnLineas = []
  for (const k of ['intro', 'dungeon', 'altNote', 'before']) {
    const t = htmlAMd(bn[k])
    if (t) bnLineas.push(t, '')
  }
  if (bnLineas.length) partes.push(['### Notas de la barra recomendada', '', ...bnLineas])
  const reglas = htmlAMd(G.macroRules)
  if (reglas) {
    const items = reglas.split(/\n\n+/).map((p) => `- ${p.replace(/\n+/g, ' ')}`).join('\n')
    partes.push(['### Reglas de Forever que cambian macros', '', items])
  }
  for (const m of G.macros || []) {
    const meta = [`\`${m.cat}\``, `nivel ${m.lvl}`]
    if (m.tal) meta.push(`talento ${String(m.tal).toUpperCase()}`)
    const l = [`### ${plano(m.n)}`, '', meta.join(' · ')]
    const desc = htmlAMd(m.desc)
    if (desc) l.push('', desc)
    l.push('', '```', String(m.code || '').replace(/^\n+|\n+$/g, ''), '```', '')
    partes.push(l)
  }
  if (!partes.length) return null
  const lineas = []
  for (const p of partes) lineas.push(...p, '')
  return { id: 'macros', titulo: 'Macros', lineas }
}

function secTips(G) {
  const X = G.extras || {}
  const tips = X.tips || []
  if (!tips.length) return null
  return {
    id: 'tips', titulo: X.tipsTitle || 'Consejos',
    lineas: tips.map((t) => `- **${plano(t[0])}** ${plano(t[1])}`.trim()),
  }
}

function secWarn(G) {
  const w = htmlAMd((G.extras || {}).warn)
  if (!w) return null
  return { id: 'warn', titulo: 'Sobre el servidor "Forever"', lineas: [w] }
}

function secSpecs(G) {
  const specs = G.specs || {}
  const ids = Object.keys(specs)
  const prefs = G.prefs || []
  if (!ids.length && !prefs.length) return null
  const lineas = []
  if (ids.length) {
    lineas.push('### Talentos', '')
    for (const id of ids) {
      lineas.push(`- **${plano(specs[id])}** (\`${id}\`)${id === G.defaultSpec ? ' — por defecto' : ''}`)
    }
    lineas.push('')
    const sn = plano(G.specNote)
    if (sn) lineas.push(sn, '')
  }
  if (prefs.length) {
    lineas.push('### Arma preferida', '')
    for (const p of prefs) {
      lineas.push(`- **${plano(p[1])}** (\`${p[0]}\`)${p[0] === G.defaultPref ? ' — por defecto' : ''}`)
    }
    lineas.push('')
    const pn = plano(G.prefNote)
    if (pn) lineas.push(pn, '')
  }
  if (G.useEng) {
    lineas.push('La guía tiene en cuenta **Ingeniería**: las armas que la requieren están marcadas en la tabla de armas.')
  }
  return { id: 'specs', titulo: 'Especializaciones', lineas }
}

// ---------------------------------------------------------------- armado de documentos

function cerrarDoc(s) {
  return s.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n').replace(/\s+$/g, '') + '\n'
}

function cabeceraClase(nombre, fac, archivo) {
  return [
    `# Guía curada: ${nombre} de la ${fac} (WoW Forever)`, '',
    `Origen: **curado** (escrito a mano en el repo wow-forever, \`standalone/${archivo}\`).`,
    'Basada en datos de Classic 1.12; Forever puede diferir. Macros, rutas y armas no se probaron',
    'en el juego salvo que el texto lo diga.',
  ]
}

function cuerpo(secciones) {
  const out = []
  for (const s of secciones) out.push(`## ${s.titulo}`, '', ...s.lineas, '')
  return out.join('\n')
}

function docClase(clase, facKey) {
  const G = clase.G
  const GF = (G.factions || {})[facKey]
  const fac = FACCIONES[facKey] || facKey
  const secciones = [
    secRutas(GF), secHitos(GF), secArmas(G, GF), secDungeons(G),
    secAh(G), secMacros(G), secTips(G), secWarn(G), secSpecs(G),
  ].filter(Boolean)
  const base = `curado-${clase.slug}-${FACCION_SLUG[facKey] || facKey}.md`
  const cab = cabeceraClase(clase.nombre, fac, clase.archivo)
  const items = []

  const completo = cerrarDoc(cab.join('\n') + '\n\n' + cuerpo(secciones))
  const nombres = secciones.map((s) => s.titulo)
  const iMac = secciones.findIndex((s) => s.id === 'macros')
  if (Buffer.byteLength(completo, 'utf8') <= LIMITE_ARCHIVO || iMac < 0) {
    items.push({
      nombre: base, contenido: completo,
      cubre: `${clase.nombre} · ${fac}`, secciones: nombres,
    })
    return items
  }

  // Divide: el resto queda en el archivo principal y las macros (con macroRules
  // y barNotes) pasan a <base>-macros.md.
  const macros = secciones[iMac]
  const resto = secciones.filter((s) => s.id !== 'macros')
  const macBase = base.slice(0, -'.md'.length)
  const puntero = {
    id: 'macros', titulo: 'Macros',
    lineas: [`Las macros, las reglas de Forever y las notas de la barra están en \`${macBase}-macros.md\`.`],
  }
  items.push({
    nombre: base,
    contenido: cerrarDoc(cab.join('\n') + '\n\n' + cuerpo([...resto, puntero])),
    cubre: `${clase.nombre} · ${fac}`, secciones: [...resto.map((s) => s.titulo), 'Macros'],
  })
  items.push({
    nombre: `${macBase}-macros.md`,
    contenido: cerrarDoc(
      cabeceraClase(`${clase.nombre} de la ${fac} — Macros`, fac, clase.archivo).join('\n')
      + '\n\n' + macros.lineas.join('\n')),
    cubre: `${clase.nombre} · ${fac} — macros`, secciones: ['Macros'],
  })
  return items
}

// ---------------------------------------------------------------- Legacy

// Fuentes y notas de curación del comentario de cabecera de guide-legacy.js.
function fuentesLegacy() {
  const vacio = { intro: '', fuentes: [], correcciones: [], sinConfirmar: [] }
  const txt = fs.readFileSync(path.join(STANDALONE, 'guide-legacy.js'), 'utf8')
  const m = txt.match(/\/\*([\s\S]*?)\*\//)
  if (!m) return vacio
  const crudas = m[1].split('\n')
  const idx = {}
  crudas.forEach((l, i) => {
    const t = l.trim()
    if (idx.fuentes == null && t.startsWith('FUENTES')) idx.fuentes = i
    else if (idx.correc == null && t.startsWith('CORRECCIONES')) idx.correc = i
    else if (idx.sinconf == null && t.startsWith('AÚN SIN CONFIRMAR')) idx.sinconf = i
  })
  const intro = crudas.slice(0, idx.fuentes ?? crudas.length)
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('='))
    .join(' ').replace(/\s+/g, ' ').trim()
  const itemsDe = (desde, hasta) => {
    const out = []
    for (const l of crudas.slice(desde, hasta)) {
      const t = l.trim()
      if (!t) continue
      if (t.startsWith('- ')) out.push(t.slice(2).trim())
      else if (out.length) out[out.length - 1] = (out[out.length - 1] + ' ' + t).replace(/\s+/g, ' ')
    }
    return out
  }
  return {
    fuentes: idx.fuentes != null ? itemsDe(idx.fuentes + 1, idx.correc ?? crudas.length) : [],
    correcciones: idx.correc != null ? itemsDe(idx.correc + 1, idx.sinconf ?? crudas.length) : [],
    sinConfirmar: idx.sinconf != null ? itemsDe(idx.sinconf + 1, crudas.length) : [],
    intro,
  }
}

function docLegacy() {
  const L = cargarLegacy() || {}
  const { intro, fuentes, correcciones, sinConfirmar } = fuentesLegacy()
  const secciones = []
  const push = (id, titulo, lineas) => { if (lineas && lineas.length) secciones.push({ id, titulo, lineas }) }

  push('fuentes', 'Fuentes', fuentes.map((f) => `- ${plano(f)}`))
  push('correcciones', 'Correcciones respecto a los datos beta', correcciones.map((f) => `- ${plano(f)}`))
  push('sinConfirmar', 'Aún sin confirmar', sinConfirmar.map((f) => `- ${plano(f)}`))

  push('sistema', 'Puntos de cuenta', (L.sys || []).map((s) => `- ${plano(s)}`))

  const prog = L.progress || []
  if (prog.length) {
    const l = ['| Puntos | Recompensa | Qué es |', '|---|---|---|',
      ...prog.map((p) => `| ${p[0]} | ${celda(p[1])} | ${celda(p[2])} |`)]
    const pn = plano(L.progressNote)
    if (pn) l.push('', pn)
    push('progress', 'Progress Track', l)
  }

  const ch = L.challenges || []
  {
    const l = []
    const cn = plano(L.challengesNote)
    if (cn) l.push(cn, '')
    for (const c of ch) {
      l.push(`### ${plano(c.name)}`, '', `**~${c.pts} pts** · ${plano(c.desc)}`, '')
      for (const r of c.rows || []) l.push(`- **${plano(r[0])}** — ${plano(r[1])}`)
      const nt = plano(c.note)
      if (nt) l.push('', nt)
      l.push('')
    }
    push('challenges', 'Legacy Challenges', l)
  }

  const pkEntries = Object.entries(L.perks || {})
  if (pkEntries.length) {
    const l = []
    for (const [, Pk] of pkEntries) {
      const total = (Pk.perks || []).reduce((a, x) => a + (x.r || 0), 0)
      l.push(`### ${plano(Pk.name)}`, '', `${plano(Pk.sub)} · ${total} ranks`, '')
      for (const p of Pk.perks || []) {
        const tag = TAG_PERK[p.tag] || p.tag || ''
        const pre = p.pre ? ` · req: ${plano(p.pre)}` : ''
        l.push(`- **${plano(p.n)}** — ${tag} · ${p.r} ranks${pre} — ${plano(p.fx)}`)
      }
      l.push('')
    }
    const pn = plano(L.perksNote)
    if (pn) l.push(pn)
    push('perks', 'Árboles de perks', l)
  }

  const sc = L.scarce || []
  if (sc.length) {
    const l = []
    for (const s of sc) {
      l.push(`- **${plano(s[0])}** — ${plano(s[1])} · ilvl ${s[2]}`)
      l.push(`  → ${plano(s[3])} · ${plano(s[4])}`)
      const nota = plano(s[5])
      if (nota) l.push(`  ${nota}`)
    }
    const sn = plano(L.scarceNote)
    if (sn) l.push('', sn)
    push('scarce', 'Materiales escasos', l)
  }

  const g = L.gather || {}
  {
    const l = []
    for (const [k, nombre] of OFICIOS_RECOLECCION) {
      const rows = g[k] || []
      if (!rows.length) continue
      l.push(`### ${nombre}`, '')
      for (const e of rows) {
        const fac = e.fac === 'h' ? 'Horda' : e.fac === 'a' ? 'Alianza' : e.fac === 'both' ? 'ambas facciones' : ''
        l.push(`- **${plano(e.what)}** — nv ${e.lvl[0]}–${e.lvl[1]}${fac ? ` · ${fac}` : ''}`)
        const zones = plano(e.zones)
        if (zones) l.push(`  ${zones}`)
        const nota = plano(e.note)
        if (nota) l.push(`  ${nota}`)
      }
      l.push('')
    }
    const gn = plano(L.gatherNote)
    if (gn) l.push(gn)
    push('gather', 'Dónde farmear por oficio', l)
  }

  const now = plano(L.now && L.now.locked)
  if (now) push('now', 'Desbloqueo del panel', [now])

  const cab = [
    '# Guía curada: Legacy — puntos de cuenta y perks (WoW Forever)', '',
    'Origen: **curado** (escrito a mano en el repo wow-forever, `standalone/guide-legacy.js`).',
  ]
  if (intro) cab.push('', intro)
  const contenido = cerrarDoc(cab.join('\n') + '\n\n' + cuerpo(secciones))
  return {
    nombre: 'curado-legacy.md', contenido,
    cubre: 'Legacy — todos los personajes', secciones: secciones.map((s) => s.titulo),
  }
}

// ---------------------------------------------------------------- índice y generación

function generarIndice(items) {
  const filas = items.map((it) => {
    const tam = (Buffer.byteLength(it.contenido, 'utf8') / 1024).toFixed(1)
    return `| \`${it.nombre}\` | ${it.cubre} | ${it.secciones.join(', ')} | ~${tam} KB |`
  })
  return cerrarDoc([
    '# Índice — referencias de las guías curadas', '',
    'Origen: **curado** — generado por `tools/build-referencias-skill.mjs` desde `standalone/guide-*.js`.',
    'No editar a mano: regenerar con `node tools/build-referencias-skill.mjs`.', '',
    '| Archivo | Cubre | Secciones | Tamaño |', '|---|---|---|---|',
    ...filas, '',
  ].join('\n'))
}

export function generarTodo() {
  const items = []
  for (const clase of cargarGuias()) {
    for (const facKey of Object.keys(clase.G.factions || {})) {
      items.push(...docClase(clase, facKey))
    }
  }
  items.push(docLegacy())
  items.push({
    nombre: 'INDICE.md', contenido: generarIndice(items),
    cubre: 'índice', secciones: ['índice'],
  })
  return items
}

// ---------------------------------------------------------------- CLI

function uso() {
  console.log(`Uso: node tools/build-referencias-skill.mjs [--salida <carpeta>] [--verificar]

Genera las referencias Markdown de la skill desde standalone/guide-*.js.
  --salida <carpeta>  carpeta de salida (defecto: skills/wow-forever/references)
  --verificar         regenera en una carpeta temporal y compara bytes con la
                      salida; sale con código 1 si algún archivo difiere`)
}

function verificar(items, destino) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'referencias-skill-'))
  for (const it of items) fs.writeFileSync(path.join(tmp, it.nombre), it.contenido, 'utf8')
  const esperados = new Map(items.map((it) => [it.nombre, fs.readFileSync(path.join(tmp, it.nombre))]))
  const enDestino = new Set(
    fs.existsSync(destino)
      ? fs.readdirSync(destino, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name)
      : [])
  let ok = true
  for (const [nombre, buf] of esperados) {
    const p = path.join(destino, nombre)
    if (!enDestino.has(nombre)) { console.error(`falta: ${nombre}`); ok = false; continue }
    if (!fs.readFileSync(p).equals(buf)) { console.error(`difiere: ${nombre}`); ok = false }
  }
  for (const f of enDestino) if (!esperados.has(f)) { console.error(`sobra: ${f}`); ok = false }
  fs.rmSync(tmp, { recursive: true, force: true })
  if (ok) console.log('referencias al día')
  else console.error('las referencias no coinciden: regenera con node tools/build-referencias-skill.mjs')
  process.exit(ok ? 0 : 1)
}

function principal() {
  const args = process.argv.slice(2)
  let salida = SALIDA_DEFECTO
  let esVerificar = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--salida') {
      salida = args[++i]
      if (!salida) { uso(); process.exit(2) }
    } else if (a === '--verificar') esVerificar = true
    else if (a === '--ayuda' || a === '-h') { uso(); return }
    else { console.error(`argumento desconocido: ${a}`); uso(); process.exit(2) }
  }
  const items = generarTodo()
  const destino = path.isAbsolute(salida) ? salida : path.resolve(ROOT, salida)
  if (esVerificar) verificar(items, destino)
  fs.mkdirSync(destino, { recursive: true })
  for (const it of items) {
    const p = path.join(destino, it.nombre)
    fs.writeFileSync(p, it.contenido, 'utf8')
    console.log(`${path.relative(ROOT, p)} — ${Buffer.byteLength(it.contenido, 'utf8')} bytes`)
  }
}

const ES_MAIN = !!process.argv[1]
  && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
if (ES_MAIN) principal()
