#!/usr/bin/env node
// auditar-curado.mjs — compara las guías curadas (standalone/guide-*.js) con los
// datos generados (data/*.json) y lista lo que no coincide.
//
// Las guías curadas se escriben a mano, y en la 2.0.0 aparecieron guías que
// nombraban ítems, jefes y razas que no existen. Este auditor revisa lo que los
// datos sí pueden demostrar:
//   - razas: que existan en Forever y puedan ser esa clase en esa facción;
//   - lugares de expansiones posteriores (Azuremyst, Exodar, Outland…);
//   - restos de borrador (un «?» sin su «¿», una fuente vacía «— ~»);
//   - ítems: que existan, y en las armas, su tipo, calidad y nivel requerido;
//   - botín de dungeons: que el jefe citado lo suelte y con qué probabilidad;
//   - dungeons: que existan y que el rango de niveles se cruce con el del juego;
//   - hechizos de las macros y la barra: que la clase los aprenda y a qué nivel;
//   - misiones citadas entre comillas: que existan y sean de esa facción;
//   - afirmaciones de «no usable» o «sin 2H» contra las competencias de la clase;
//   - consejos escritos para un personaje concreto (nombre o nivel fijo).
// Lo que los datos no cubren (talentos, sets, habilidades de mascota, reglas de
// Forever) queda para revisión humana en tools/curado-revisado.json, con su motivo.
//
// Uso:
//   node tools/auditar-curado.mjs            # informe de hallazgos sin revisar
//   node tools/auditar-curado.mjs --todo     # también los ya revisados
//   node tools/auditar-curado.mjs --json     # salida JSON

import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const req = createRequire(path.join(ROOT, 'tools', 'auditar-curado.mjs'))

// Guías curadas publicadas: deben coincidir con GUIAS en desktop/src/datos.js.
export const GUIAS_PUBLICADAS = [
  { id: 'hunter', clase: 3, archivo: 'guide-hunter.js', exp: 'GUIDE_HUNTER' },
]
const FACCION = { horde: 'horda', alliance: 'alianza' }

export function cargarDatos(root = ROOT) {
  const leer = (f) => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'))
  return {
    personaje: leer('personaje.json'), clases: leer('clases.json'), items: leer('items.json'),
    misiones: leer('misiones.json'), dungeons: leer('dungeons.json'), profesiones: leer('profesiones.json'),
  }
}

export function cargarGuias(lista = GUIAS_PUBLICADAS, root = ROOT) {
  return lista.map((g) => ({ ...g, G: req(path.join(root, 'standalone', g.archivo))[g.exp] }))
}

export function cargarLegacy(root = ROOT) {
  return req(path.join(root, 'standalone', 'guide-legacy.js')).GUIDE_LEGACY
}

// ------------------------------------------------------------------ utilidades
const norm = (s) => String(s).toLowerCase().replace(/[’`´]/g, "'").replace(/\s+/g, ' ').trim()
const quitarHtml = (s) => String(s).replace(/<[^>]*>/g, '')
const L = '\\p{L}'
const palabra = (alts) => new RegExp(`(?<![${L}])(?:${alts})(?![${L}])`, 'iu')

// Recorre todo valor de texto de la guía (también el código de recExtra, que
// arma tarjetas con texto) y llama a fn(texto, ruta, facción-o-null).
function recorrer(v, fn, ruta = '', fac = null) {
  if (typeof v === 'string') fn(v, ruta, fac)
  else if (typeof v === 'function') fn(v.toString(), ruta + '()', fac)
  else if (Array.isArray(v)) v.forEach((x, i) => recorrer(x, fn, `${ruta}[${i}]`, fac))
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      const f = ruta === '.factions' && FACCION[k] ? FACCION[k] : fac
      recorrer(x, fn, `${ruta}.${k}`, f)
    }
  }
}

// ------------------------------------------------------------------ índices
export function indices(D) {
  const items = new Map()
  for (const [id, f] of Object.entries(D.items.items)) {
    for (const n of new Set([f[1], f[0]])) {
      if (!n) continue
      const k = norm(n)
      if (!items.has(k)) items.set(k, [])
      items.get(k).push({ id: Number(id), q: f[2], nivel: f[3], clase: f[6], sub: f[7], ligado: f[8], vendido: f[10] > 0, dps: (f[11] || 0) / 10 })
    }
  }
  const misiones = new Map()
  for (const [id, q] of Object.entries(D.misiones.misiones)) {
    for (const n of new Set([q.t.en, q.t.es])) {
      const k = norm(n)
      if (!misiones.has(k)) misiones.set(k, [])
      misiones.get(k).push({ id: Number(id), faccion: q.faccion, nivel: q.nivel, recompensas: q.recompensas || [] })
    }
  }
  const dungeons = []
  for (const grupo of ['clasicos', 'forever']) {
    for (const [mapa, d] of Object.entries(D.dungeons[grupo])) dungeons.push({ mapa: Number(mapa), grupo, ...d })
  }
  const crafteados = new Set()
  for (const p of Object.values(D.profesiones.profesiones)) for (const r of p.recetas) if (r.crea) crafteados.add(r.crea[0])
  const sinBotin = new Set()
  for (const h of D.dungeons.huecos || []) for (const j of h.jefes || []) sinBotin.add(`${h.mapa}|${norm(j)}`)
  return { items, misiones, dungeons, sinBotin, crafteados }
}

// Nombres de la guía → dungeon del juego (los nombres de ala o de conjunto
// apuntan al mapa que los contiene).
const ALIAS_DUNGEON = {
  'scarlet monastery — armory': 'scarlet monastery',
  'scarlet monastery — cathedral': 'scarlet monastery',
  'sunken temple (atal\'hakkar)': 'sunken temple',
  'dire maul east / north': 'dire maul',
  'lower/upper blackrock spire': 'blackrock spire',
  lbrs: 'blackrock spire', ubrs: 'blackrock spire',
}
function dungeonPorNombre(I, nombre) {
  const k = norm(nombre)
  const objetivo = ALIAS_DUNGEON[k] || k
  return I.dungeons.find((d) => norm(d.n.en) === objetivo || norm(d.n.es) === objetivo) || null
}

// Tipo de arma de la guía → subclase de ítem (clase 2) del cliente.
const TIPO_ARMA = { axe: [0, 1], mace: [4, 5], dagger: [15], bow: [2], gun: [3], crossbow: [18], sword: [7, 8], staff: [10], fist: [13], polearm: [6], thrown: [16], wand: [19] }
const CALIDAD = { poor: 0, common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }
// Subclase de arma → SkillLine de competencia (clases.json → competencias).
const ARMA_SKILL = { 0: 44, 1: 172, 2: 45, 3: 46, 4: 54, 5: 160, 6: 229, 7: 43, 8: 55, 10: 136, 13: 473, 15: 173, 16: 176, 18: 226, 19: 228 }

// Razas: las 10 del cliente con sus nombres en español e inglés y variantes.
const RAZA_TEXTO = {
  1: 'humanos?|humanas?|human', 2: 'orcos?|orcas?|orcs?', 3: 'enanos?|enanas?|dwarf|dwarves',
  4: 'elfos? de la noche|elfas? de la noche|elfos? nocturnos?|night ?elf|kaldorei',
  5: 'no-muertos?|no muertos?|renegados?|undead|forsaken', 6: 'taurenos?|taurens?',
  7: 'gnomos?|gnomas?|gnomes?', 8: 'trol(?:l|es|ls|s)?|trolls?',
}
const RAZAS_SKYBORNE = 'cielonatos?|skyborne'
// Razas y lugares que no están en Forever (expansiones posteriores).
const NO_EXISTE = [
  ['raza', 'draeneis?|elfos? de sangre|blood ?elf|sin\'dorei|worgen|pandaren'],
  ['lugar', 'azuremyst|bloodmyst|exodar|ammen vale|eversong|ghostlands|silvermoon|sunstrider|outland|terrallende|hellfire|zangarmarsh|shattrath|northrend|rasganorte|hubbardton'],
]

// ------------------------------------------------------------------ auditoría
export function auditar(D, guias, legacy) {
  const I = indices(D)
  const out = []
  const vistos = new Set()
  const hallazgo = (guia, tipo, texto, detalle, donde) => {
    const k = `${guia}|${tipo}|${texto}|${donde}`
    if (!vistos.has(k)) { vistos.add(k); out.push({ guia, tipo, texto, detalle, donde }) }
  }
  const combos = new Set(D.personaje.combinaciones.map(([r, c]) => `${r}|${c}`))
  const razas = D.personaje.razas

  for (const { id, clase, G } of guias) {
    const cls = D.clases.clases[String(clase)]
    const competencias = new Set((cls.competencias || []).map((c) => c.id))
    const hechizos = new Map()
    for (const h of cls.hechizos) {
      const k = norm(h.n.en)
      hechizos.set(k, Math.min(hechizos.get(k) ?? 99, h.nivel))
    }

    // Razas, lugares y restos de borrador, en todo el texto.
    recorrer(G, (txt, donde, fac) => {
      const plano = quitarHtml(txt)
      for (const [tipo, alts] of NO_EXISTE) {
        const m = plano.match(palabra(alts))
        if (m) hallazgo(id, `${tipo}-inexistente`, m[0], `«${m[0]}» no existe en WoW Forever`, donde)
      }
      for (const [rid, alts] of Object.entries({ ...RAZA_TEXTO, sky: RAZAS_SKYBORNE })) {
        const m = plano.match(palabra(alts))
        if (!m) continue
        const ids = rid === 'sky' ? ['95', '96'] : [rid]
        const validas = ids.filter((r) => combos.has(`${r}|${clase}`) && (!fac || razas[r].faccion === fac))
        if (!validas.length) {
          hallazgo(id, 'raza-clase', m[0], `${m[0]} no puede ser ${cls.n.es}${fac ? ` en la ${fac}` : ''} según personaje.json`, donde)
        }
      }
      if (typeof txt === 'string') {
        const abre = (plano.match(/¿/g) || []).length
        const cierra = (plano.match(/\?/g) || []).length
        if (cierra > abre) hallazgo(id, 'borrador', plano.slice(0, 80), 'un «?» sin su «¿»: resto de borrador', donde)
        if (/—\s*~\s*$/.test(plano)) hallazgo(id, 'borrador', plano, 'fuente vacía («— ~»)', donde)
      }
    }, '')

    // Armas: existencia, tipo, calidad y nivel requerido.
    for (const [facKey, GF] of Object.entries(G.factions || {})) {
      for (const w of GF.weapons || []) {
        const cands = I.items.get(norm(w.n))
        if (!cands) { hallazgo(id, 'item-inexistente', w.n, 'ningún ítem con ese nombre en items.json', `factions.${facKey}.weapons`); continue }
        // Con nombres repetidos, el ítem que mejor encaja con lo que dice la guía.
        const armas = cands.filter((c) => c.clase === 2)
        const it = armas.sort((a, b) => Math.abs(a.dps - (w.dps ?? a.dps)) - Math.abs(b.dps - (w.dps ?? b.dps)))[0] || cands[0]
        if (it.clase !== 2) hallazgo(id, 'item-tipo', w.n, `no es un arma (clase ${it.clase}/${it.sub})`, `factions.${facKey}.weapons`)
        else if (TIPO_ARMA[w.t] && !TIPO_ARMA[w.t].includes(it.sub)) hallazgo(id, 'item-tipo', w.n, `la guía dice ${w.t}; el ítem es de subclase ${it.sub}`, `factions.${facKey}.weapons`)
        if (w.q && CALIDAD[w.q] !== undefined && CALIDAD[w.q] !== it.q) hallazgo(id, 'item-calidad', w.n, `la guía dice ${w.q}; calidad ${it.q} en el juego`, `factions.${facKey}.weapons`)
        if (w.lvl != null && it.nivel && w.lvl !== it.nivel) hallazgo(id, 'item-nivel', w.n, `la guía dice nivel ${w.lvl}; requiere ${it.nivel}`, `factions.${facKey}.weapons`)
        if (it.clase === 2 && ARMA_SKILL[it.sub] && !competencias.has(ARMA_SKILL[it.sub])) hallazgo(id, 'item-no-usable', w.n, `${cls.n.es} no tiene la competencia de este tipo de arma`, `factions.${facKey}.weapons`)
        if (w.dps != null && it.dps && Math.abs(w.dps - it.dps) > 0.15) hallazgo(id, 'item-dps', w.n, `la guía dice ${w.dps} DPS; ${it.dps} en Classic 1.12`, `factions.${facKey}.weapons`)
        revisarFuente(I, hallazgo, id, it, w.n, String(w.src || ''), `factions.${facKey}.weapons`)
        const m = String(w.src || '').match(/^(.+?) — (.+?)(?: \(~?(\d+(?:\.\d+)?)%\))?$/)
        if (m && !/^(quest|vendor|boe|world|ingenier|forja|raro)/i.test(m[1])) {
          const dg = dungeonPorNombre(I, m[2].replace(/ \(.*\)$/, ''))
          const jefe = dg && jefeCitado(dg, m[1])
          if (dg) revisarBotin(I, hallazgo, id, dg, it, w.n, jefe ? jefe.n.en : m[1], m[3] && Number(m[3]), `factions.${facKey}.weapons`)
        }
      }
    }

    // Dungeons: existencia, niveles y botín.
    for (const [i, dn] of (G.dungeons || []).entries()) {
      const dg = dungeonPorNombre(I, dn.n)
      const donde = `dungeons[${i}]`
      if (!dg) { hallazgo(id, 'dungeon-desconocido', dn.n, 'sin dungeon con ese nombre en dungeons.json', donde); continue }
      if (dg.niveles && dn.r && (dn.r[0] > dg.niveles.max || dn.r[1] < dg.niveles.min)) {
        hallazgo(id, 'dungeon-niveles', dn.n, `la guía dice ${dn.r[0]}–${dn.r[1]}; el juego ${dg.niveles.min}–${dg.niveles.max}`, donde)
      }
      for (const [nombreItem, desc] of dn.loot || []) {
        const cands = I.items.get(norm(nombreItem))
        if (!cands) { hallazgo(id, 'item-inexistente', nombreItem, `citado en el botín de ${dn.n}`, donde); continue }
        const it = cands[0]
        revisarNoUsable(hallazgo, id, it, nombreItem, desc, competencias, cls, donde)
        if (/quest/i.test(desc)) { revisarFuente(I, hallazgo, id, it, nombreItem, desc, donde); continue }
        const jefe = jefeCitado(dg, desc)
        const pct = (String(desc).match(/~(\d+(?:\.\d+)?)%/) || [])[1]
        revisarBotin(I, hallazgo, id, dg, it, nombreItem, jefe ? jefe.n.en : null, pct && Number(pct), donde)
      }
    }

    // Lista de subasta: los ítems tienen que existir.
    for (const [nombreItem] of G.ahList || []) {
      if (!I.items.has(norm(nombreItem))) hallazgo(id, 'item-inexistente', nombreItem, 'citado en la lista de subasta', 'ahList')
    }

    // Afirmaciones sobre armas de dos manos.
    recorrer(G, (txt, donde) => {
      const plano = quitarHtml(txt)
      const dosManos = [160, 172, 55].some((s) => competencias.has(s))
      const m = plano.match(/sin 2H|no usa 2H|NO usa 2H|solo (?:usa )?armas 1H|NO usable[^)]*2H|no la pod[eé]s equipar/i)
      if (m && dosManos) hallazgo(id, 'afirma-no-usable', m[0], `${cls.n.es} tiene competencia de armas de dos manos en clases.json`, donde)
    }, '')

    // Macros y barra: hechizos de la clase y nivel.
    const macros = new Map((G.macros || []).map((mc) => [mc.n, mc]))
    for (const mc of G.macros || []) {
      for (const s of hechizosDeMacro(mc.code)) {
        if (I.items.has(norm(s.nombre)) && s.uso) continue // /use de un ítem
        if (s.uso && /^\d+$/.test(s.nombre)) continue // /use 13 (ranura)
        revisarHechizo(hallazgo, id, hechizos, s.nombre, mc.lvl, `macros «${mc.n}»`, cls)
      }
      for (const u of usosDeItem(mc.code)) {
        if (!I.items.has(norm(u)) && !hechizos.has(norm(u))) hallazgo(id, 'item-inexistente', u, `/use en la macro «${mc.n}»`, 'macros')
      }
    }
    const bar = G.bar || {}
    for (const k of [...(bar.keys || []), ...(bar.mouse || [])]) {
      for (const o of k.o || []) {
        if (o.m && !macros.has(o.m)) hallazgo(id, 'barra', o.m, 'la tecla apunta a una macro que no existe', `bar ${k.k}`)
        if (o.s) revisarHechizo(hallazgo, id, hechizos, o.s, o.lvl, `bar ${k.k}`, cls)
      }
      if (k.dg && k.dg.m && !macros.has(k.dg.m)) hallazgo(id, 'barra', k.dg.m, 'la tecla de dungeon apunta a una macro que no existe', `bar ${k.k}`)
    }
    for (const n of [...(bar.click || []), ...(bar.alt1 || [])]) {
      if (!macros.has(n)) hallazgo(id, 'barra', n, 'atajo a una macro que no existe', 'bar')
    }

    // Misiones citadas entre comillas simples, y «'Misión' → Ítem».
    recorrer(G, (txt, donde, fac) => {
      const plano = quitarHtml(txt)
      for (const [, q, nombreItem] of plano.matchAll(/'([^'\n]+?(?:'s[^'\n]*?)?)'\s*→\s*([A-Z][A-Za-z' -]+?)(?=\s+(?:o|y|\(|por|si)\b|[,.;()]|$)/g)) {
        const it = (I.items.get(norm(nombreItem)) || [])[0]
        if (it) revisarMision(I, hallazgo, id, q, it, nombreItem, donde)
      }
      for (const t of misionesCitadas(plano)) {
        const cands = I.misiones.get(norm(t))
        if (!cands) { hallazgo(id, 'mision-desconocida', t, 'ninguna misión con ese título en misiones.json', donde); continue }
        const lado = fac === 'horda' ? 'h' : fac === 'alianza' ? 'a' : null
        if (lado && !cands.some((q) => q.faccion === 'ah' || q.faccion === lado)) {
          hallazgo(id, 'mision-faccion', t, `la misión no es de la ${fac}`, donde)
        }
      }
    }, '')
  }

  if (legacy) auditarLegacy(I, legacy, hallazgo)
  return out
}

// Palabras de nombres de jefe que no los distinguen entre sí.
const GENERICOS = new Set(['lord', 'lady', 'princess', 'prince', 'general', 'master', 'shadow', 'hunter', 'high',
  'captain', 'king', 'chief', 'overlord', 'instructor', 'doctor', 'baron', 'baroness', 'devourer', 'the', 'and',
  'commander', 'priest', 'priestess', 'mekgineer', 'tinkerer', 'warchief', 'quartermaster', 'highlord', 'guard',
  'archmage', 'wolf', 'death', 'speaker', 'scarlet', 'inquisitor', 'interrogator', 'magister', 'cursed', 'raging'])

// Jefe del dungeon que nombra el texto: por su nombre completo o por una palabra
// que solo tiene él (la guía escribe «Angerforge» o «Princesa Moira»).
function jefeCitado(dg, texto) {
  const completo = dg.jefes.find((j) => palabra(escapar(j.n.en)).test(texto))
  if (completo) return completo
  const tokens = (j) => norm(j.n.en).split(/[\s,]+/).filter((t) => t.length >= 4 && !GENERICOS.has(t))
  const cuenta = new Map()
  for (const j of dg.jefes) for (const t of tokens(j)) cuenta.set(t, (cuenta.get(t) || 0) + 1)
  return dg.jefes.find((j) => tokens(j).some((t) => cuenta.get(t) === 1 && palabra(escapar(t)).test(texto))) || null
}

function escapar(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function revisarBotin(I, hallazgo, guia, dg, it, nombreItem, jefeTxt, pct, donde) {
  const fuentes = dg.jefes.filter((j) => (j.botin || []).some(([b]) => b === it.id))
  if (!fuentes.length) {
    // Jefes cuyo botín no se pudo vincular (huecos): no se puede afirmar nada.
    const jefe = jefeTxt && dg.jefes.find((j) => norm(j.n.en) === norm(jefeTxt))
    if (jefe && I.sinBotin.has(`${dg.mapa}|${norm(jefe.n.en)}`)) return
    if (dg.grupo === 'forever') return // botín de dungeons nuevos: solo en el servidor
    hallazgo(guia, 'botin-no-cae', nombreItem, `ningún jefe de ${dg.n.en} lo suelta en dungeons.json${jefeTxt ? ` (la guía dice ${jefeTxt})` : ''}`, donde)
    return
  }
  if (jefeTxt) {
    const jefe = fuentes.find((j) => norm(j.n.en) === norm(jefeTxt))
    if (!jefe) {
      hallazgo(guia, 'botin-jefe', nombreItem, `la guía dice ${jefeTxt}; lo suelta ${fuentes.map((j) => j.n.en).join(', ')}`, donde)
      return
    }
    const prob = jefe.botin.find(([b]) => b === it.id)[1]
    if (pct != null && Math.abs(prob - pct) > Math.max(3, prob * 0.25)) {
      hallazgo(guia, 'botin-prob', nombreItem, `la guía dice ~${pct}%; ${jefe.n.en} lo suelta al ${prob}% en Classic 1.12`, donde)
    }
  }
}

// Fuente que la guía le atribuye a un ítem: vendedor, BoE, crafteo o misión.
function revisarFuente(I, hallazgo, guia, it, nombreItem, src, donde) {
  if (/^vendor/i.test(src) && !it.vendido) hallazgo(guia, 'fuente-vendedor', nombreItem, 'la guía dice que lo vende un vendedor; ningún vendedor lo tiene en Classic 1.12', donde)
  if (/\bBoE\b/.test(src) && it.ligado !== 2) hallazgo(guia, 'fuente-boe', nombreItem, `la guía dice BoE; se liga ${it.ligado === 1 ? 'al recogerlo (BoP)' : `con el tipo ${it.ligado}`}`, donde)
  if (/ingenier|forja|blacksmith|crafte/i.test(src) && !I.crafteados.has(it.id)) hallazgo(guia, 'fuente-crafteo', nombreItem, 'la guía dice que se craftea; ninguna receta de profesiones.json lo crea', donde)
  const q = src.match(/quest[^']*'([^'\n]+?(?:'s[^'\n]*?)?)'/i)
  if (q) revisarMision(I, hallazgo, guia, q[1], it, nombreItem, donde)
}

function revisarMision(I, hallazgo, guia, titulo, it, nombreItem, donde) {
  const cands = I.misiones.get(norm(titulo))
  if (!cands) return // la existencia de la misión se revisa aparte
  const ids = new Set((I.items.get(norm(nombreItem)) || [it]).map((c) => c.id))
  if (!cands.some((q) => q.recompensas.some((r) => ids.has(r)))) {
    hallazgo(guia, 'fuente-mision', `${titulo} → ${nombreItem}`, `la misión '${titulo}' no da ${nombreItem} en Classic 1.12`, donde)
  }
}

function revisarNoUsable(hallazgo, guia, it, nombreItem, desc, competencias, cls, donde) {
  if (!/no usable|no la pod[eé]s equipar/i.test(desc) || it.clase !== 2) return
  const sk = ARMA_SKILL[it.sub]
  if (sk && competencias.has(sk)) hallazgo(guia, 'afirma-no-usable', nombreItem, `la guía dice que no es usable; ${cls.n.es} tiene la competencia (SkillLine ${sk})`, donde)
}

function revisarHechizo(hallazgo, guia, hechizos, nombre, lvl, donde, cls) {
  const min = hechizos.get(norm(nombre))
  if (min === undefined) { hallazgo(guia, 'hechizo-desconocido', nombre, `${cls.n.es} no lo aprende de un entrenador en clases.json`, donde); return }
  if (lvl != null && lvl < min) hallazgo(guia, 'hechizo-nivel', nombre, `la guía lo usa desde el nivel ${lvl}; se entrena al ${min}`, donde)
}

// Hechizos de una macro: #showtooltip X, /cast X, /castsequence a, b. Quita
// condiciones [..], «!», «reset=…» y separa opciones con «;».
export function hechizosDeMacro(code) {
  const out = []
  for (const linea of String(code || '').split('\n')) {
    const m = linea.match(/^\s*(#showtooltip|\/castsequence|\/cast|\/use)\s*(.*)$/i)
    if (!m || m[1].toLowerCase() === '/use') continue
    const resto = m[2].replace(/\[[^\]]*\]/g, '').replace(/reset=\S+/g, '')
    for (const parte of resto.split(/[;,]/)) {
      const nombre = parte.trim().replace(/^!/, '').trim()
      if (nombre) out.push({ nombre, uso: false })
    }
  }
  return out
}

function usosDeItem(code) {
  const out = []
  for (const linea of String(code || '').split('\n')) {
    const m = linea.match(/^\s*\/use\s+(.*)$/i)
    if (!m) continue
    for (const parte of m[1].split(';')) {
      const nombre = parte.replace(/\[[^\]]*\]/g, '').trim()
      if (nombre && !/^\d+$/.test(nombre)) out.push(nombre)
    }
  }
  return out
}

// Títulos entre comillas simples que empiezan con mayúscula: 'The Sacred Flame'.
export function misionesCitadas(txt) {
  const out = []
  const re = /(?<![\p{L}])'(\p{Lu}[^'\n]{1,60}?(?:'s[^'\n]*?)?)'(?![\p{L}])/gu
  let m
  while ((m = re.exec(txt))) out.push(m[1])
  return out
}

// Legacy: ítems citados y consejos escritos para un personaje concreto.
function auditarLegacy(I, L, hallazgo) {
  for (const [, nombreItem] of L.progress || []) {
    if (!I.items.has(norm(nombreItem))) hallazgo('legacy', 'item-inexistente', nombreItem, 'recompensa del Progress Track sin ítem en items.json', 'progress')
  }
  for (const s of L.scarce || []) {
    if (!I.items.has(norm(s[0]))) hallazgo('legacy', 'item-inexistente', s[0], 'material escaso sin ítem en items.json', 'scarce')
    if (s[3] && !/directo/.test(s[3]) && !I.items.has(norm(s[3]))) hallazgo('legacy', 'item-inexistente', s[3], 'producto del material escaso sin ítem en items.json', 'scarce')
  }
  recorrer(L, (txt, donde) => {
    const plano = quitarHtml(txt)
    for (const m of plano.matchAll(/\bGrizaceo\b|\btu\s+(?:PJ\s+)?(?:nv|nivel)\s*\d+|\ba nv\s*\d+|Acá estás vos/gi)) {
      hallazgo('legacy', 'personal', m[0], 'consejo escrito para un personaje y nivel concretos', donde)
    }
  }, '')
}

// ------------------------------------------------------------------ revisados
export const ARCHIVO_REVISADOS = path.join(ROOT, 'tools', 'curado-revisado.json')

export const clave = (h) => `${h.guia}|${h.tipo}|${h.texto}`

export function cargarRevisados(archivo = ARCHIVO_REVISADOS) {
  const r = JSON.parse(fs.readFileSync(archivo, 'utf8'))
  return new Map(r.revisados.map((e) => [`${e.guia}|${e.tipo}|${e.texto}`, e]))
}

// ------------------------------------------------------------------ CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const D = cargarDatos()
  const hs = auditar(D, cargarGuias(), cargarLegacy())
  const revisados = fs.existsSync(ARCHIVO_REVISADOS) ? cargarRevisados() : new Map()
  const todo = process.argv.includes('--todo')
  const lista = todo ? hs : hs.filter((h) => !revisados.has(clave(h)))
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(lista, null, 2))
  } else {
    const porGuia = {}
    for (const h of lista) (porGuia[h.guia] ||= []).push(h)
    for (const [g, l] of Object.entries(porGuia)) {
      console.log(`\n## ${g} (${l.length})`)
      for (const h of l) console.log(`- [${h.tipo}] ${h.texto} — ${h.detalle} (${h.donde})${revisados.has(clave(h)) ? ' [revisado]' : ''}`)
    }
    console.log(`\n${lista.length} hallazgos${todo ? '' : ' sin revisar'}; ${hs.length} en total.`)
  }
}
