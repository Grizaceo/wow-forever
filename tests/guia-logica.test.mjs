// node --test tests/guia-logica.test.mjs — lógica pura de la guía curada.
// Los guide-*.js son UMD de navegador (window.GUIDE_*), así que acá van fixtures
// mínimas con la misma forma; el parser /simc usa textos sintéticos propios.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aplicarSimc, bands, bandOf, curDps, curMf, dungeonsEnRango, fmtDps, hitosCercanos,
  leerBuild, macroCats, macroKeyMap, macroLen, mejorObtenida, normalizarGuia, normalizeFarm,
  parseFields, parseSimcProfile, pickSimcWeapon, proximasArmas, setWeaponOwnedEstado,
  simcHelpers, simcVitals, slotView, usableFor, weaponForLoot, weaponLookup, wfOf,
} from '../desktop/src/guia-logica.js'

// ---- fixtures con la forma de guide-hunter.js ----
const WEAPONS = [
  { id: 'w1', n: 'Arco viejo', t: 'bow', dps: 5.0, lvl: 5, src: 'quest', q: 'common' },
  { id: 'w2', n: 'Arco mejor', t: 'bow', dps: 9.0, lvl: 15, src: 'drop', q: 'rare', approx: true },
  { id: 'w3', n: 'Arco eng', t: 'bow', dps: 12.0, lvl: 25, src: 'ingeniería', q: 'uncommon', eng: true },
  { id: 'w4', n: 'Ballesta', t: 'crossbow', dps: 8.0, lvl: 20, src: 'AH', q: 'rare' },
]
const GF = {
  weapons: WEAPONS,
  milestones: [
    { lvl: 10, cat: 'Clase', txt: 'pet', loc: 'K' },
    { lvl: 20, cat: 'Quest', txt: 'quest de clase', loc: 'E' },
    { lvl: 30, cat: 'Zona', txt: 'zona nueva' },
  ],
  routes: { kalimdor: [{ min: 1, max: 20, zones: 'K zones' }, { min: 21, max: 40, zones: 'K zones 2' }], ek: [{ min: 1, max: 20, zones: 'E zones' }] },
}
const G = {
  id: 'hunter', name: 'Hunter', specs: { bm: 'BM', mm: 'MM' }, defaultSpec: 'bm',
  prefs: [['bow', 'Arco'], ['any', 'Cualq.']], defaultPref: 'bow',
  typeFilters: [['all', 'Todas'], ['bow', 'Arcos']], useEng: true,
  dungeons: [{ n: 'WC', loc: 'Barrens', cont: 'K', r: [17, 24], loot: [['Arco azul', 'descripción']] }],
  bar: { keys: [{ k: '1', o: [{ m: 'Macro uno', t: 'Macro uno' }] }], mouse: [], click: [], alt1: [] },
  macros: [{ n: 'Macro uno', cat: 'DPS', lvl: 1, code: '/cast A', desc: 'desc' }],
  simc: { slot: 'ranged', pet: true, racePref: { troll: 'bow' }, rows: () => [] },
}
const CTX = { G, GF, facKey: 'horde', perfil: { nivel: 20, clase: 3, faccion: 'horda' } }

test('leerBuild conserva claves desconocidas y normaliza las conocidas', () => {
  const b = leerBuild(JSON.stringify({ spec: 'mm', pref: 'bow', owned: ['w1', 'w1', 42], gear: [], steps: [],
    futuraClave: { anidada: [1, 2] }, otra: 'x', customDps: 12.5 }), CTX)
  assert.equal(b.spec, 'mm')
  assert.deepEqual(b.owned, ['w1'])           // dedup + solo strings
  assert.equal(b.futuraClave.anidada[1], 2)   // clave desconocida intacta
  assert.equal(b.otra, 'x')
  assert.equal(b.customDps, 12.5)
  assert.equal(b.lvl, 20)                     // el nivel sale del perfil
})

test('build inválido o ausente no rompe: vuelve a defaults', () => {
  for (const txt of [null, undefined, '', '{roto', '[]', '"x"', '42']) {
    const b = leerBuild(txt, CTX)
    assert.equal(b.spec, 'bm')                // defaultSpec
    assert.equal(b.pref, 'bow')               // defaultPref
    assert.equal(b.realm, 'kalimdor')         // primera ruta disponible
    assert.deepEqual(b.owned, [])
  }
})

test('roundtrip leer→escribir conserva claves desconocidas', () => {
  const b = leerBuild(JSON.stringify({ spec: 'mm', rpgPropio: { oro: 999 }, lista: ['a'] }), CTX)
  const texto = JSON.stringify(b)
  const b2 = leerBuild(texto, CTX)
  assert.equal(b2.rpgPropio.oro, 999)
  assert.deepEqual(b2.lista, ['a'])
  assert.equal(b2.spec, 'mm')
})

test('migración: un gid de loot que nombra un arma la marca como tenida', () => {
  const b = leerBuild(JSON.stringify({ gear: ['d0|Arco mejor'], owned: [] }), CTX)
  assert.ok(b.owned.includes('w2'))
  assert.ok(b.gear.includes('d0|Arco mejor'))
})

test('setWeaponOwnedEstado sincroniza owned y loot de dungeons', () => {
  const st = { owned: [], gear: [] }
  const dungeons = [{ loot: [['Arco mejor', 'x']] }]
  const r = setWeaponOwnedEstado(st, 'w2', true, { weapons: WEAPONS, dungeons })
  assert.deepEqual(r.owned, ['w2'])
  assert.deepEqual(r.gear, ['d0|Arco mejor'])
  const r2 = setWeaponOwnedEstado({ owned: r.owned, gear: r.gear }, 'w2', false, { weapons: WEAPONS, dungeons })
  assert.deepEqual(r2.owned, [])
  assert.deepEqual(r2.gear, [])
})

test('weaponForLoot casa por nombre sin distinción de mayúsculas', () => {
  assert.equal(weaponForLoot('d3|arco MEJOR', WEAPONS).id, 'w2')
  assert.equal(weaponForLoot('d3|no existe', WEAPONS), null)
})

test('curDps: arma de tabla, arma custom y dps real de /simc', () => {
  const st = { cur: 'w2', customDps: 0, weaponDps: null, simc: null }
  assert.equal(curDps(st, WEAPONS), 9.0)
  assert.equal(curDps({ ...st, cur: 'other', customDps: 7.5 }, WEAPONS), 7.5)
  assert.equal(curDps({ ...st, weaponDps: 10.5 }, WEAPONS), 10.5)
  const conSimc = { ...st, simc: { weapon: { match: { id: 'w2' }, dps: 11.2 } } }
  assert.equal(curDps(conSimc, WEAPONS), 11.2)
})

test('proximasArmas filtra por nivel, preferencia, ingeniería y umbral de dps', () => {
  const base = { lvl: 20, pref: 'bow', eng: false, os: new Set(), cur: 'w1', dps: 5.0 }
  const lista = proximasArmas(WEAPONS, base).map((w) => w.id)
  assert.deepEqual(lista, ['w4', 'w2'].filter((id) => id !== 'w4') && ['w2']) // w4 es crossbow (pref bow), w3 pide eng
  const conEng = proximasArmas(WEAPONS, { ...base, eng: true }).map((w) => w.id)
  assert.ok(conEng.includes('w3'))
  const any = proximasArmas(WEAPONS, { ...base, pref: 'any' }).map((w) => w.id)
  assert.ok(any.includes('w4'))
})

test('mejorObtenida solo considera poseídas, de tu nivel y mejores que tu dps', () => {
  // lvl 20: w3 (req 25) queda fuera → gana w2 (9.0 > 5.0)
  const r = mejorObtenida(WEAPONS, { lvl: 20, eng: true, os: new Set(['w2', 'w3']), cur: 'w1', dps: 5.0 })
  assert.equal(r.id, 'w2')
  // lvl 30: w3 (12.0) le gana a w2
  const r2 = mejorObtenida(WEAPONS, { lvl: 30, eng: true, os: new Set(['w2', 'w3']), cur: 'w1', dps: 5.0 })
  assert.equal(r2.id, 'w3')
  // sin poseer nada mejor → null
  assert.equal(mejorObtenida(WEAPONS, { lvl: 30, eng: true, os: new Set(), cur: 'w1', dps: 5.0 }), null)
})

test('bands/bandOf/dungeonsEnRango/hitosCercanos', () => {
  const bs = bands(GF, 'kalimdor')
  assert.equal(bs.length, 2)
  assert.equal(bandOf(bs, 15).min, 1)
  assert.equal(bandOf(bs, 30).min, 21)
  const dk = dungeonsEnRango(G.dungeons, 20, 'K')
  assert.equal(dk.length, 1)
  assert.deepEqual(hitosCercanos(GF.milestones, 20).map((m) => m.lvl), [20, 30])
})

// ---- macros y barra ----
const MACROS = [
  { n: 'A', cat: 'DPS', lvl: 1, code: '/cast X', desc: 'd' },
  { n: 'B', cat: 'Pet', lvl: 10, tal: 'mm', code: '/petattack\nmod:shift /x', desc: 'd' },
]
test('macroCats/curMf/usableFor/macroLen', () => {
  assert.deepEqual(macroCats(MACROS), ['DPS', 'Pet'])
  assert.equal(curMf('Pet', ['DPS', 'Pet']), 'Pet')
  assert.equal(curMf('Rara', ['DPS']), 'all')
  assert.equal(usableFor(MACROS[0], 1, 'bm'), true)
  assert.equal(usableFor(MACROS[1], 10, 'bm'), false)  // tal mm ≠ bm
  assert.equal(usableFor(MACROS[1], 10, 'mm'), true)
  assert.equal(macroLen('/cast X'), 7)
})

test('slotView: macro lista, spell del libro, pronto y libre', () => {
  const bar = {
    keys: [
      { k: '1', o: [{ m: 'A', t: 'A' }] },
      { k: '2', o: [{ s: 'SpellX', lvl: 30, t: 'Spell X' }] },
      { k: '3', o: [] },
      { k: 'W', move: true },
    ],
    mouse: [],
  }
  const ctx = { mdg: false, spec: 'bm', lvl: 20, macros: MACROS }
  const v1 = slotView(bar.keys[0], ctx)
  assert.equal(v1.cls, 'ready'); assert.equal(v1.sub, 'macro'); assert.equal(v1.mi, 0)
  const v2 = slotView(bar.keys[1], ctx)
  assert.equal(v2.cls, 'soon'); assert.equal(v2.sub, 'lvl 30'); assert.equal(v2.mi, -1)
  const v3 = slotView(bar.keys[2], ctx)
  assert.equal(v3.cls, 'free'); assert.equal(v3.sub, 'libre')
  const v4 = slotView(bar.keys[3], ctx)
  assert.equal(v4.cls, 'move')
})

test('macroKeyMap marca la tecla de cada macro (y la variante dungeon)', () => {
  const bar = { keys: [{ k: '2', o: [{ m: 'A', t: 'A' }], dg: { m: 'B', t: 'B dg' } }], mouse: [{ k: 'rueda', o: [{ m: 'A', t: 'A' }] }] }
  const map = macroKeyMap(bar)
  assert.equal(map.A, 'rueda')          // mouse pisa keys? no: keys primero, mouse después → 'rueda'
  assert.equal(map.B, '2 · dungeon')
})

test('fmtDps marca aproximados con ~', () => {
  assert.equal(fmtDps({ dps: 9.6, approx: true }), '9.6~')
  assert.equal(fmtDps({ dps: 9.6 }), '9.6')
  assert.equal(fmtDps({ dps: 9.64 }), '9.6')
})

// ---- /simc (textos sintéticos) ----
const SIMC_PET = 'hunter="Fixture"\nlevel=19\npet_family=raptor\npet_level=<b id="level-marker">html</b>\npet_happiness=<b id="happy-marker">html</b>'
const SIMC_PET_ONLY = 'pet_family=raptor\npet_level=19'
const SIMC_FULL = 'hunter="Fixture"\nlevel=28\nrace=troll\nserver=camwow_us1_pvp\nprofessions=skinning=200\n# Barbarian War Axe (28)\nmain_hand=,id=3201\n# Venomstrike (24)\nranged=,id=6469\n# character_stats=health:700/mana:1600/strength:50/agility:90/stamina:58/intellect:85/spirit:72\n# weapon_damage=mainhand:90:110:3.3/ranged:76:94:2.18'

test('parseSimcProfile: pet-only y campos pet quedan como texto', () => {
  const d = parseSimcProfile(SIMC_PET_ONLY)
  assert.equal(d.pet.pet_family, 'raptor')
  assert.equal(d.pet.pet_level, '19')
  const d2 = parseSimcProfile(SIMC_PET)
  assert.equal(d2.pet.pet_level, '<b id="level-marker">html</b>')  // nunca se parsea como HTML
  assert.equal(d2.pet.pet_happiness, '<b id="happy-marker">html</b>')
  assert.equal(d2.className, 'hunter')
  assert.equal(d2.name, 'Fixture')
  assert.equal(d2.level, 19)
})

test('parseSimcProfile: arma por slot con nombre pendiente y rangos de weapon_damage', () => {
  const d = parseSimcProfile(SIMC_FULL)
  assert.equal(d.level, 28)
  assert.equal(d.className, 'hunter')
  assert.equal(d.race, 'troll')
  assert.equal(d.server, 'camwow_us1_pvp')
  assert.deepEqual(d.professions, [['skinning', 200]])
  assert.equal(d.eng, false)
  assert.equal(d.wslots.main_hand.name, 'Barbarian War Axe')
  assert.equal(d.wslots.ranged.name, 'Venomstrike')
  assert.equal(d.wslots.main_hand.range.min, 90)
  assert.equal(d.wslots.main_hand.range.mx, 110)
  assert.equal(d.wslots.main_hand.range.spd, 3.3)
  assert.ok(Math.abs(d.wslots.main_hand.dps - (100 / 3.3)) < 0.01)
  assert.equal(d.wslots.ranged.range.min, 76)
})

test('parseSimcProfile: stats de combate bajo claves #', () => {
  const d = parseSimcProfile(SIMC_FULL)
  const v = simcVitals(d.stats)
  assert.equal(v.hp, 700)
  assert.equal(v.powers[0][1], 1600)         // mana
  assert.equal(v.attrs.length, 5)
  assert.equal(v.attrs.find((a) => a[0] === 'Agilidad')[1], 90)
})

test('pickSimcWeapon elige el slot de la guía y casa con la tabla', () => {
  const d = parseSimcProfile(SIMC_FULL)
  const lookup = weaponLookup([{ id: 'venomstrike', n: 'Venomstrike', t: 'bow', dps: 9.6, lvl: 19 }])
  pickSimcWeapon(d, 'ranged', lookup)
  assert.equal(d.weapon.slot, 'ranged')
  assert.equal(d.weapon.match.id, 'venomstrike')
  // sin match: arma queda con su dps real
  const d2 = parseSimcProfile(SIMC_FULL)
  pickSimcWeapon(d2, 'main_hand', {})
  assert.equal(d2.weapon.match, null)
  assert.ok(d2.weapon.dps > 0)
})

test('aplicarSimc: arma de tabla → cur + owned/gear; sin tabla → other+customDps', () => {
  const st = { owned: [], gear: [], spec: 'bm', pref: 'bow', eng: false, farm: null }
  const d = parseSimcProfile(SIMC_FULL)
  pickSimcWeapon(d, 'ranged', weaponLookup([{ id: 'venomstrike', n: 'Venomstrike', t: 'bow', dps: 9.6, lvl: 19 }]))
  // forzamos el match en el slot elegido (ranged→venomstrike)
  const r = aplicarSimc(st, d, { G, weapons: WEAPONS, dungeons: G.dungeons })
  assert.equal(r.state.lvl, 28)
  assert.equal(r.state.name, 'Fixture')
  assert.equal(r.state.pref, 'bow')         // racePref troll→bow
  assert.equal(r.state.eng, false)
  assert.equal(r.nivel, 28)
  assert.ok(r.notes.some((n) => n.includes('nivel 28')))
  // professions → farm.prof
  assert.equal(r.state.farm.prof.skin, true)
  assert.equal(r.state.farm.prof.herb, false)
  assert.equal(r.state.farm.prof.mine, false)
  assert.ok(r.state.simc.weapon)

  const d2 = parseSimcProfile(SIMC_FULL)
  d2.weapon = { name: 'Arma rara', dps: 15.7, range: null, match: null, slot: 'ranged' }
  const r2 = aplicarSimc(st, d2, { G, weapons: WEAPONS, dungeons: G.dungeons })
  assert.equal(r2.state.cur, 'other')
  assert.equal(r2.state.customDps, 15.7)
})

test('aplicarSimc conserva claves ajenas del build', () => {
  const st = { owned: [], gear: [], steps: [], miPropio: { x: 1 }, farm: null }
  const r = aplicarSimc(st, parseSimcProfile(SIMC_PET_ONLY), { G, weapons: WEAPONS, dungeons: [] })
  assert.deepEqual(r.state.miPropio, { x: 1 })
})

test('normalizeFarm aplica defaults y sanea', () => {
  const f = normalizeFarm({ comp: 'raro', gph: -3, prof: { skin: true }, n: 99, session: 3, zoneComp: { a: 'low', b: 'mal' } })
  assert.equal(f.comp, 'auto')
  assert.equal(f.gph, 5)
  assert.equal(f.prof.skin, true)
  assert.equal(f.prof.herb, false)
  assert.equal(f.n, 5)
  assert.equal(f.session, 2)
  assert.deepEqual(f.zoneComp, { a: 'low' })
})

test('normalizarGuia sin guía (G null) devuelve lo básico sin romper', () => {
  const b = normalizarGuia({ owned: ['x'], lvl: 33 }, {})
  assert.equal(b.lvl, 33)
  assert.deepEqual(b.owned, ['x'])
})
