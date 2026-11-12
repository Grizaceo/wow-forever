// Lógica pura de la guía curada (Cazador, Guerrero, Chamán) y del progreso que
// index.html guardaba en localStorage. Sin DOM: los mismos cálculos que
// standalone/index.html, parametrizados por la guía activa.
//
// `estado.build` es un string JSON con las mismas claves que usaba index.html
// (spec, pref, eng, realm, cur, owned, gear, steps, simc, farm…). Nivel, clase y
// facción NO viven ahí: salen del perfil del jugador. Las claves que esta guía
// no conoce se conservan tal cual al leer y escribir.

// ------------------------------------------------------------------ build
export const validLevel = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(60, Math.max(1, Math.trunc(n))) : 12
}

// state.farm de index.html (blank + normalizeFarm): lo usa la vista de mercado.
export function normalizeFarm(f) {
  const d = { comp: 'auto', zoneComp: {}, gph: 5, prof: { skin: false, herb: false, mine: false }, group: false, pvp: true, n: 5, session: 2 }
  const o = f && typeof f === 'object' && !Array.isArray(f) ? f : {}
  const zc = {}
  if (o.zoneComp && typeof o.zoneComp === 'object' && !Array.isArray(o.zoneComp))
    for (const k of Object.keys(o.zoneComp)) if (typeof k === 'string' && k && ['low', 'med', 'high'].includes(o.zoneComp[k])) zc[k] = o.zoneComp[k]
  const p = o.prof && typeof o.prof === 'object' ? o.prof : {}
  const n = Number(o.n)
  return {
    comp: ['auto', 'low', 'med', 'high'].includes(o.comp) ? o.comp : d.comp, zoneComp: zc,
    gph: Number.isFinite(+o.gph) && +o.gph > 0 ? Math.min(1000, +o.gph) : d.gph,
    prof: { skin: !!p.skin, herb: !!p.herb, mine: !!p.mine }, group: !!o.group, pvp: o.pvp !== false,
    n: Number.isInteger(n) && n >= 3 && n <= 8 ? n : d.n,
    session: [1, 2, 4].includes(+o.session) ? +o.session : d.session,
  }
}

const listaUnica = (x) => (Array.isArray(x) ? [...new Set(x.filter((i) => typeof i === 'string'))] : [])

// gid de loot de dungeon: "d<índice>|<nombre del ítem>" — igual que index.html.
export function weaponForLoot(gid, weapons) {
  const s = String(gid || '')
  const name = s.slice(s.indexOf('|') + 1).toLowerCase()
  return (weapons || []).find((w) => String(w.n).toLowerCase() === name) || null
}

// Marca/desmarca un arma y sincroniza el loot de dungeons que la nombra
// ("unificar las dos vistas de inventario" de index.html).
export function setWeaponOwnedEstado(state, id, obtained, { weapons, dungeons }) {
  const w = (weapons || []).find((x) => x.id === id)
  if (!w) return { owned: state.owned, gear: state.gear }
  const os = new Set(state.owned), gs = new Set(state.gear)
  if (obtained) os.add(id); else os.delete(id)
  ;(dungeons || []).forEach((d, i) => (d.loot || []).forEach((l) => {
    if (String(l[0]).toLowerCase() === String(w.n).toLowerCase()) {
      const gid = 'd' + i + '|' + l[0]
      if (obtained) gs.add(gid); else gs.delete(gid)
    }
  }))
  return { owned: [...os], gear: [...gs] }
}

// normalizeState de index.html, sobre el objeto ya parseado. ctx:
// { G: guía completa, GF: datos de la facción (puede ser null), facKey, perfil }.
// Devuelve {...v, ...conocidas}: las claves desconocidas se conservan.
export function normalizarGuia(v, ctx) {
  const { G, GF, perfil } = ctx || {}
  const s = { ...(v && typeof v === 'object' && !Array.isArray(v) ? v : {}) }
  s.customDps = Number.isFinite(+s.customDps) ? Math.max(0, +s.customDps) : 0
  s.weaponDps = Number.isFinite(+s.weaponDps) && +s.weaponDps > 0 ? +s.weaponDps : null
  s.owned = listaUnica(s.owned)
  s.gear = listaUnica(s.gear)
  s.steps = listaUnica(s.steps)
  s.lvl = perfil && Number.isFinite(+perfil.nivel)
    ? Math.min(60, Math.max(1, Math.trunc(+perfil.nivel)))
    : validLevel(s.lvl)
  if (!G) return s
  s.cls = G.id || s.cls
  if (!Object.hasOwn(G.specs || {}, s.spec)) s.spec = G.defaultSpec
  if (!(G.prefs || []).some((p) => p[0] === s.pref)) s.pref = G.defaultPref
  if (!(G.typeFilters || []).some((f) => f[0] === s.wf)) s.wf = 'all'
  s.eng = G.useEng ? !!s.eng : false
  s.name = typeof s.name === 'string' ? s.name.slice(0, 20) : ''
  s.farm = normalizeFarm(s.farm)
  s.avatar = typeof s.avatar === 'string' && s.avatar.startsWith('data:image/') && s.avatar.length <= 98304 ? s.avatar : null
  if (typeof s.mf !== 'string') s.mf = 'all'
  s.mdg = !!s.mdg
  s.who = !!s.who
  if (!GF) return s   // guía sin datos para la facción del perfil: no tocar lo de armas/ruta
  s.fac = ctx.facKey || s.fac
  const weapons = GF.weapons || []
  const ids = new Set(weapons.map((w) => w.id))
  s.owned = s.owned.filter((id) => ids.has(id))
  if (!['', 'other', ...weapons.map((w) => w.id)].includes(s.cur)) s.cur = ''
  const routes = GF.routes || {}
  if (!['kalimdor', 'ek'].includes(s.realm) || !routes[s.realm]) s.realm = Object.keys(routes)[0] || 'kalimdor'
  // Migración de index.html: un gid de loot que nombra un arma la marca como tenida
  // (y setWeaponOwned re-sincroniza ambos lados). Se aplica en cada lectura.
  const mig = new Set(s.owned)
  s.gear.forEach((gid) => { const w = weaponForLoot(gid, weapons); if (w) mig.add(w.id) })
  for (const id of mig) {
    const r = setWeaponOwnedEstado(s, id, true, { weapons, dungeons: G.dungeons || [] })
    s.owned = r.owned
    s.gear = r.gear
  }
  return s
}

// Lee estado.build (string JSON o null) y lo normaliza. Conserva claves desconocidas.
export function leerBuild(texto, ctx) {
  let v = null
  try { v = JSON.parse(texto) } catch { v = null }
  return normalizarGuia(v, ctx)
}

// ------------------------------------------------------------------ armas
export const wfOf = (w) => w.f || w.t
export const fmtDps = (w) => (w.dps || 0).toFixed(1) + (w.approx ? '~' : '')
export const wById = (weapons, id) => (weapons || []).find((w) => w.id === id)

export function curDps(state, weapons) {
  if (state.cur === 'other') return state.customDps || 0
  const w = wById(weapons, state.cur)
  if (!w) return 0
  const sw = state.simc && state.simc.weapon
  if (sw && sw.match && sw.match.id === state.cur && sw.dps) return sw.dps
  if (state.weaponDps) return state.weaponDps
  return w.dps
}

export const curName = (state, weapons) =>
  state.cur === 'other' ? 'arma custom (' + (state.customDps || 0) + ' dps)' : (wById(weapons, state.cur) || { n: 'sin definir' }).n

// Candidatas del recomendador: mejores que el arma actual, por nivel y luego DPS.
export function proximasArmas(weapons, { lvl, pref, eng, os, cur, dps }) {
  return (weapons || []).filter((w) => {
    if (os.has(w.id) || w.id === cur) return false
    if (pref !== 'any' && wfOf(w) !== pref) return false
    if (w.eng && !eng) return false
    if (w.dps <= dps * 1.02) return false
    return w.lvl <= lvl + 12
  }).sort((a, b) => a.lvl - b.lvl || b.dps - a.dps)
}

// "Tenés un arma mejor sin equipar": poseída, de tu nivel, que supere al DPS actual.
export function mejorObtenida(weapons, { lvl, eng, os, cur, dps }) {
  return (weapons || []).filter((w) => os.has(w.id) && w.id !== cur && w.lvl <= lvl && (!w.eng || eng) && w.dps > dps)
    .sort((a, b) => b.dps - a.dps)[0] || null
}

// Bandas de leveling del continente elegido.
export const bands = (GF, realm) => {
  const routes = (GF && GF.routes) || {}
  return routes[realm] || routes[Object.keys(routes)[0]] || []
}
export const bandOf = (lista, lvl) => (lista || []).find((b) => lvl >= b.min && lvl <= b.max)

// Dungeons del recomendador: las que tocan tu rango (+/-5), primero las disponibles.
export function dungeonsEnRango(dungeons, lvl, rc) {
  return (dungeons || []).filter((d) => lvl >= d.r[0] - 5 && lvl <= d.r[1] + 5)
    .sort((a, b) => (lvl >= a.r[0] ? 0 : 1) - (lvl >= b.r[0] ? 0 : 1) || (a.cont === rc ? 0 : 1) - (b.cont === rc ? 0 : 1) || a.r[0] - b.r[0])
}

// Hitos del recomendador: los cercanos al nivel actual.
export function hitosCercanos(milestones, lvl) {
  return (milestones || []).filter((m) => m.lvl >= lvl - 2 && m.lvl <= lvl + 10).sort((a, b) => a.lvl - b.lvl)
}

// ------------------------------------------------------------------ macros y barra
export const macroLen = (code) => new TextEncoder().encode(String(code ?? '')).length
export const mByName = (macros, n) => (macros || []).find((m) => m.n === n)
export const macroCats = (macros) => [...new Set((macros || []).map((m) => m.cat))]
export const curMf = (mf, cats) => (cats || []).includes(mf) ? mf : 'all'
export const macroMods = (code) =>
  [['shift', '⇧'], ['ctrl', 'Ctrl'], ['alt', 'Alt']].filter((x) => String(code || '').includes('mod:' + x[0])).map((x) => x[1])
export const usableFor = (m, lvl, spec) => m.lvl <= lvl && (!m.tal || m.tal === spec)

// Qué va hoy en una tecla: la primera opción disponible; si ninguna, la que llega antes.
export function slotFor(b, { mdg, spec, lvl, macros }) {
  if (b.move) return { move: true }
  const opts = (mdg && b.dg) ? [b.dg, ...(b.o || [])] : (b.o || [])
  let next = null
  for (const o of opts) {
    const m = o.m ? mByName(macros, o.m) : null
    if (o.m && !m) continue
    if (m && m.tal && m.tal !== spec) continue
    const need = m ? m.lvl : o.lvl
    if (need <= lvl) return { o, m, ready: true }
    if (!next || need < next.need) next = { o, m, need }
  }
  return next ? Object.assign(next, { ready: false }) : null
}

export function slotView(b, ctx) {
  const s = slotFor(b, ctx)
  if (!s) return { cls: 'free', sub: 'libre', t: '', mods: [], mi: -1, tip: 'Libre con tu spec actual' }
  if (s.move) return { cls: 'move', sub: 'mover', t: '', mods: [], mi: -1, tip: 'Movimiento' }
  const full = s.m ? s.m.n : (s.o.s || s.o.t)
  return {
    cls: s.ready ? (s.m ? 'ready' : 'spell') : 'soon',
    sub: s.ready ? (s.m ? 'macro' : 'spell') : `lvl ${s.need}`,
    t: s.o.t, mods: s.m ? macroMods(s.m.code) : [], mi: s.m ? ctx.macros.indexOf(s.m) : -1,
    tip: s.ready
      ? (s.m ? `${full} — clic para ver la macro` : `${full}: arrastralo desde el libro de hechizos hasta que llegue la macro`)
      : `${full} — llega al ${s.need}`,
  }
}

// Mapa macro → tecla de la barra recomendada (para la etiqueta "tecla X" de cada macro).
export function macroKeyMap(bar) {
  const out = {}
  ;[...(bar.keys || []), ...(bar.mouse || [])].forEach((b) => {
    ;(b.o || []).forEach((o) => { if (o.m) out[o.m] = b.k })
    if (b.dg && b.dg.m) out[b.dg.m] = b.k + ' · dungeon'
  })
  return out
}

// Mapa nombre normalizado → arma, para casar el arma importada de /simc con la tabla.
export const normItemName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
export function weaponLookup(weapons) {
  const out = {}
  ;(weapons || []).forEach((w) => { out[normItemName(w.n)] = w })
  return out
}

// ------------------------------------------------------------------ /simc
const SIMC_CLASSES = new Set(['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid', 'deathknight', 'monk', 'demonhunter', 'evoker'])
const SIMC_STAT_KEYS = new Set(['character_stats', 'character_stats_base', 'character_stats_bonus', 'character_stats_gear', 'attack_power', 'spell_stats', 'spell_power', 'regen', 'crit', 'hit', 'haste', 'combat_modifiers', 'combat_ratings', 'defense', 'weapon_damage', 'pet_info', 'pet_stats', 'pet_attack_power', 'pet_defense', 'pet_weapon_damage', 'pet_modifiers', 'skills', 'buffs'])

// "a:1:2/b:3" → {a:["1","2"], b:["3"]}  (el nombre es el primer campo, el resto son valores)
export function parseFields(str) {
  const out = {}
  String(str || '').split('/').forEach((e) => {
    const i = e.indexOf(':')
    if (i < 0) return
    out[e.slice(0, i)] = e.slice(i + 1).split(':')
  })
  return out
}

export const fval = (sec, k, i) => {
  const f = sec && sec[k]
  if (!f) return null
  const v = parseFloat(f[i == null ? 0 : i])
  return Number.isFinite(v) ? v : null
}

// Parser del perfil que exporta /simc en el juego. Mismo resultado que
// parseSimcProfile de index.html (pickSimcWeapon va aparte porque necesita la
// tabla de armas de la guía activa).
export function parseSimcProfile(text) {
  const d = { level: null, name: null, className: null, race: null, server: null, eng: null, weapon: null, pet: {}, stats: {} }
  let pendingName = null
  const clean = String(text || '').replace(/\|\|/g, '|')
  for (const raw of clean.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line[0] === '#') {
      // "# Nombre del item (ilvl)" precede a cada línea de slot — solo si no tiene '='
      const m = line.match(/^#\s*(.+?)\s*\((\d+)\)\s*$/)
      if (m && line.indexOf('=') < 0) { pendingName = m[1]; continue }
      const body = line.replace(/^#\s*/, ''), eq = body.indexOf('=')
      if (eq > 0) {
        const k = body.slice(0, eq)
        if (SIMC_STAT_KEYS.has(k)) d.stats[k] = parseFields(body.slice(eq + 1))
      }
      continue
    }
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const k = line.slice(0, eq), v = line.slice(eq + 1)
    if (SIMC_CLASSES.has(k)) { d.className = k; d.name = v.replace(/^"|"$/g, ''); pendingName = null; continue }
    switch (k) {
      case 'level': { const n = parseInt(v, 10); d.level = (n >= 1 && n <= 60) ? n : null; break }
      case 'race': d.race = v; break
      case 'server': d.server = v; break
      case 'region': d.region = v; break
      case 'role': d.role = v; break
      case 'talents': d.talents = v; break
      case 'professions':
        d.eng = v.split('/').some((p) => /^engineering=/i.test(p))
        d.professions = v.split('/').map((p) => {
          const i = p.indexOf('=')
          return i < 0 ? [p.trim(), null] : [p.slice(0, i).trim(), +p.slice(i + 1) || null]
        }).filter((p) => p[0])
        break
      case 'ranged': case 'main_hand': case 'off_hand':
        (d.wslots = d.wslots || {})[k] = { name: pendingName, id: (v.match(/(?:^|,)id=(\d+)/) || [])[1] || null, dps: null, range: null, match: null, slot: k }
        break
      case 'pet_family': case 'pet_level': case 'pet_happiness': case 'pet_abilities': case 'pet_creature_id':
        d.pet[k] = v
        break
      default: break
    }
    if (k !== 'ranged' && k !== 'main_hand' && k !== 'off_hand') pendingName = null
  }
  // DPS real por slot desde weapon_damage: slot:min:max:speed (+buffs aparte)
  // Ojo: weapon_damage usa "mainhand"/"offhand" sin underscore.
  const wd = d.stats.weapon_damage, WD = { main_hand: 'mainhand', off_hand: 'offhand', ranged: 'ranged' }
  if (d.wslots && wd) {
    for (const sl in d.wslots) {
      const w = d.wslots[sl], key = wd[sl] ? sl : (wd[WD[sl]] ? WD[sl] : null)
      if (key) {
        const mn = fval(wd, key, 0), mx = fval(wd, key, 1), sp = fval(wd, key, 2)
        if (mn != null && mx != null && sp > 0) { w.dps = ((mn + mx) / 2) / sp; w.range = { min: mn, mx: mx, spd: sp } }
      }
    }
  }
  return d
}

// El arma que importa depende de la guía activa (hunter=ranged, melee=main_hand).
// lookup: weaponLookup(weapons de la facción).
export function pickSimcWeapon(d, slot, lookup) {
  if (!d.wslots) { d.weapon = null; return }
  d.weapon = d.wslots[slot] || d.wslots.ranged || d.wslots.main_hand || null
  if (d.weapon && !d.weapon.match && d.weapon.name) d.weapon.match = lookup[normItemName(d.weapon.name)] || null
}

const PET_HAPPY = { 1: 'Infeliz · 75%', 2: 'Contento · 100%', 3: 'Feliz · 125%' }
export const petHappyText = (v) => {
  const n = parseInt(v, 10)
  return PET_HAPPY[n] || v || '—'
}

// Helpers que index.html armaba dentro de simcCard: filas de stats del export.
export function simcHelpers(stats) {
  const st = stats || {}
  const num = (sec, k, i) => { const v = fval(st[sec], k, i); return v == null ? null : Math.round(v) }
  const dec = (sec, k, i) => { const v = fval(st[sec], k, i); return v == null ? null : v.toFixed(1) }
  const pct = (sec, k, i) => { const v = fval(st[sec], k, i); return v == null ? null : v.toFixed(1) + '%' }
  const ap = (kind) => {
    const a = st.attack_power && st.attack_power[kind]
    if (!a) return null
    const v = (+a[0] || 0) + (+a[1] || 0) - (+a[2] || 0)
    return v ? String(Math.round(v)) : null
  }
  return { st, num, dec, pct, ap, fval }
}

// Stats reales del personaje desde el SimC importado (character_stats).
export function simcVitals(stats) {
  if (!stats) return null
  const cs = stats.character_stats || {}
  const gv = (k) => { const v = fval(cs, k); return v == null ? null : Math.round(v) }
  const attrs = [['Fuerza', 'strength'], ['Agilidad', 'agility'], ['Aguante', 'stamina'], ['Intelecto', 'intellect'], ['Espíritu', 'spirit']]
    .map(([l, k]) => [l, gv(k)]).filter((p) => p[1] != null)
  const powers = [['Maná', 'mana'], ['Rage', 'rage'], ['Focus', 'focus'], ['Energy', 'energy']]
    .map(([l, k]) => [l, gv(k)]).filter((p) => p[1] > 0)
  const hp = gv('health'), dpsChar = fval(stats.character_stats_gear, 'damage_per_second')
  if (hp == null && !powers.length && !attrs.length && dpsChar == null) return null
  return { hp, powers, attrs, dpsChar }
}

// applySimcProfile de index.html → nuevo estado de build + notas + nivel.
// El nivel lo aplica la vista sobre el PERFIL (guardarPerfil); acá se devuelve
// aparte para que la vista decida. ctx: { G, weapons, dungeons }.
export function aplicarSimc(state, d, ctx) {
  const { G, weapons, dungeons } = ctx || {}
  const out = { ...state }
  const notes = []
  out.weaponDps = null
  if (d.level) { out.lvl = d.level; notes.push(`nivel ${d.level}`) }
  if (d.name) out.name = String(d.name).slice(0, 20)
  const rp = G && G.simc && G.simc.racePref
  if (rp && rp[d.race]) { out.pref = rp[d.race]; notes.push(`${d.race} → pref ${rp[d.race]}`) }
  if (G && G.useEng) {
    if (d.eng === true) { out.eng = true; notes.push('ingeniería') }
    else if (d.eng === false) { out.eng = false }
  }
  if (d.weapon) {
    if (d.weapon.match) {
      out.cur = d.weapon.match.id
      const r = setWeaponOwnedEstado(out, out.cur, true, { weapons, dungeons })
      out.owned = r.owned
      out.gear = r.gear
      notes.push(`arma ${d.weapon.match.n}`)
    } else if (d.weapon.dps) {
      out.cur = 'other'
      out.customDps = Math.round(d.weapon.dps * 10) / 10
      notes.push(`arma "${d.weapon.name || '?'}" ${out.customDps} dps`)
    }
  }
  out.simc = {
    ts: Date.now(), level: d.level, name: d.name, race: d.race, server: d.server,
    region: d.region || null, role: d.role || null, talents: d.talents || null,
    professions: d.professions || null, eng: d.eng, weapon: d.weapon, slots: d.wslots || null,
    pet: d.pet, stats: d.stats,
  }
  // Las profesiones del personaje alimentan los checks de farmeo (Piel/Hierbas/Minería).
  if (d.professions && d.professions.length) {
    const names = d.professions.map((p) => String(p[0] || '').toLowerCase())
    const has = (n) => names.some((x) => x.includes(n))
    const farm = normalizeFarm(out.farm)
    farm.prof = { skin: has('skinning'), herb: has('herbalism'), mine: has('mining') }
    out.farm = farm
    if (farm.prof.skin || farm.prof.herb || farm.prof.mine) notes.push('profesiones → farmeo')
  }
  return { state: out, nivel: d.level, notes }
}

// Clase de /simc → id de guía curada (para avisar cuando no coinciden).
export const SIMC_GUIA = { warrior: 'warrior', hunter: 'hunter', shaman: 'shaman' }
