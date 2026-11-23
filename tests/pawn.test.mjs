// Pruebas de desktop/src/pawn.js: catálogo PawnCommon (SavedVariables),
// captura WoWForeverBridgeDB.pawn, elección de escala y sincronización.
// Todo dato aquí es inventado y anonimizado (regla del repo: nada de nombres
// de personaje/cuenta).
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CLAVE,
  CLAVE_CATALOGO,
  VERSION,
  MAX_PESOS,
  MAX_EQUIPE,
  parsePawnScales,
  parsePawnCaptura,
  escalaDoJogador,
  lerPawn,
  guardarPawn,
  sincronizarPawn,
  lerCatalogoPawn,
  sincronizarCatalogoPawn,
} from '../desktop/src/pawn.js'
import { parseBridge } from '../desktop/src/bridge.js'

const enc = (s) => new TextEncoder().encode(s)

// Pawn.lua de cuenta con la forma real (Pawn 2.14.3): escalas de proveedor sin
// Values persistidos (PawnUnitializePlugins las borra, Pawn.lua:5665-5671) y
// una escala custom que sí conserva Values. Anonimizado.
const PAWN_LUA = `
PawnCommon = {
["LastVersion"] = 2.1403,
["Scales"] = {
["\\"Classic\\":HUNTER1"] = {
["Color"] = "aad372",
["ClassID"] = 3,
["LocalizedName"] = "Hunter: Beast Mastery",
["PerCharacterOptions"] = {
},
["Provider"] = "Classic",
["SpecID"] = 1,
["Role"] = "DAMAGER",
},
["\\"Classic\\":HUNTER2"] = {
["ClassID"] = 3,
["LocalizedName"] = "Hunter: Marksmanship",
["Provider"] = "Classic",
["SpecID"] = 2,
["Role"] = "DAMAGER",
},
["\\"Classic\\":MAGE1"] = {
["ClassID"] = 8,
["LocalizedName"] = "Mage: Arcane",
["Provider"] = "Classic",
["SpecID"] = 1,
["Role"] = "DAMAGER",
},
["Mi escala custom"] = {
["ClassID"] = 3,
["LocalizedName"] = "Mi escala custom",
["Values"] = {
["Strength"] = 1,
["Agility"] = 1.24,
["Anidada"] = { ["x"] = 1 },
["Texto"] = "no-numero",
},
},
},
}
`

const CAPTURA = {
  v: 1,
  origem: 'addon',
  escala: '"Classic":HUNTER1',
  localized: 'Hunter: Beast Mastery',
  provider: 'Classic',
  classID: 3,
  specID: 1,
  pesos: { Agility: 1.5, Strength: 1, Crit: 0.8 },
  equipo: {
    valores: [
      { escala: '"Classic":HUNTER1', valor: 12.5, localized: 'Hunter: Beast Mastery' },
      { escala: '"Classic":HUNTER1', valor: 8, localized: null },
    ],
    ilvl: 33,
  },
  candidatas: [
    { nome: '"Classic":HUNTER1', localized: 'Hunter: Beast Mastery', provider: 'Classic', classID: 3, specID: 1, role: 'DAMAGER' },
  ],
  capturado: 1763300000,
  truncado: false,
}

// ---------- parsePawnScales ----------

test('parsePawnScales: catálogo realista con versao y flags temPesos', () => {
  const r = parsePawnScales(PAWN_LUA)
  assert.equal(r.versao, 2.1403)
  assert.deepEqual(r.erros, [])
  assert.equal(r.escalas.length, 4)
  const hunter1 = r.escalas.find((e) => e.nome === '"Classic":HUNTER1')
  assert.equal(hunter1.localized, 'Hunter: Beast Mastery')
  assert.equal(hunter1.provider, 'Classic')
  assert.equal(hunter1.classID, 3)
  assert.equal(hunter1.specID, 1)
  assert.equal(hunter1.role, 'DAMAGER')
  assert.equal(hunter1.temPesos, false) // proveedor: Values no persiste
  const custom = r.escalas.find((e) => e.nome === 'Mi escala custom')
  assert.equal(custom.temPesos, true)
  assert.equal(custom.pesos.Agility, 1.24)
  assert.equal(custom.pesos.Anidada, undefined) // sub-tabla descartada
  assert.equal(custom.pesos.Texto, undefined) // no numérico descartado
})

test('parsePawnScales: entradas vacías o inválidas no rompen', () => {
  for (const t of ['', '   ', null, undefined, 42, {}]) {
    const r = parsePawnScales(t)
    assert.equal(r.escalas.length, 0)
    assert.ok(r.erros.length > 0)
  }
  const sinPawn = parsePawnScales('OtraCosa = { a = 1 }\n')
  assert.equal(sinPawn.escalas.length, 0)
  assert.ok(sinPawn.erros.length > 0)
})

test('parsePawnScales: acepta Uint8Array igual que texto', () => {
  const a = parsePawnScales(PAWN_LUA)
  const b = parsePawnScales(enc(PAWN_LUA))
  assert.equal(b.escalas.length, a.escalas.length)
  assert.equal(b.versao, a.versao)
})

// ---------- parsePawnCaptura ----------

test('parsePawnCaptura: captura válida se normaliza completa', () => {
  const c = parsePawnCaptura(CAPTURA)
  assert.ok(c)
  assert.equal(c.v, VERSION)
  assert.equal(c.origem, 'addon')
  assert.equal(c.escala, '"Classic":HUNTER1')
  assert.equal(c.localized, 'Hunter: Beast Mastery')
  assert.equal(c.provider, 'Classic')
  assert.equal(c.classID, 3)
  assert.equal(c.specID, 1)
  assert.deepEqual(c.pesos, { Agility: 1.5, Strength: 1, Crit: 0.8 })
  assert.equal(c.equipo.ilvl, 33)
  assert.equal(c.equipo.valores.length, 2)
  assert.equal(c.equipo.valores[0].valor, 12.5)
  assert.equal(c.capturado, 1763300000)
  assert.equal(c.truncado, false)
  assert.equal(c.candidatas.length, 1)
})

test('parsePawnCaptura: basura devuelve null, nunca inventa', () => {
  assert.equal(parsePawnCaptura(null), null)
  assert.equal(parsePawnCaptura('x'), null)
  assert.equal(parsePawnCaptura({}), null)
  assert.equal(parsePawnCaptura({ ...CAPTURA, v: 2 }), null)
  assert.equal(parsePawnCaptura({ ...CAPTURA, origem: 'pegado' }), null)
  assert.equal(parsePawnCaptura({ ...CAPTURA, escala: '' }), null)
  assert.equal(parsePawnCaptura({ ...CAPTURA, escala: 42 }), null)
  assert.equal(parsePawnCaptura({ ...CAPTURA, capturado: 'ayer' }), null)
  assert.equal(parsePawnCaptura({ ...CAPTURA, capturado: -5 }), null)
})

test('parsePawnCaptura: pesos no numéricos y >40 claves se acotan', () => {
  const pesos = {}
  for (let i = 0; i < MAX_PESOS + 15; i++) pesos['Stat' + i] = i + 0.5
  pesos.Anidada = { x: 1 }
  pesos.Texto = 'hola'
  const c = parsePawnCaptura({ ...CAPTURA, pesos, truncado: false })
  assert.equal(Object.keys(c.pesos).length, MAX_PESOS)
  assert.equal(c.truncado, true)
  assert.equal(c.pesos.Anidada, undefined)
  assert.equal(c.pesos.Texto, undefined)
})

test('parsePawnCaptura: equipo inválido se descarta sin tirar la captura', () => {
  const c = parsePawnCaptura({
    ...CAPTURA,
    equipo: {
      valores: [
        { escala: 'ok', valor: 5, localized: 'x' },
        { escala: 'mal', valor: 'no-num' },
        { escala: '', valor: 1 },
        'basura',
      ],
      ilvl: 5000, // fuera de rango 0..1000
    },
  })
  assert.ok(c)
  assert.equal(c.equipo.valores.length, 1)
  assert.equal(c.equipo.ilvl, null)
  const c2 = parsePawnCaptura({ ...CAPTURA, equipo: 'roto' })
  assert.equal(c2.equipo, null)
  const c3 = parsePawnCaptura({ ...CAPTURA, equipo: { valores: Array.from({ length: MAX_EQUIPE + 5 }, (_, i) => ({ escala: 's' + i, valor: i })), ilvl: 20 } })
  assert.equal(c3.equipo.valores.length, MAX_EQUIPE)
  assert.equal(c3.equipo.ilvl, 20)
})

test('parsePawnCaptura: acepta arrays Lua que llegan como objeto con claves numéricas', () => {
  // El lector de SavedVariables entrega {a,b} como {1:a,2:b} con claves string
  // (standalone/market.js:769), así que en producción equipo/candidatas NUNCA
  // son arrays JS. Los tests con arrays reales no lo veían.
  const c = parsePawnCaptura({
    ...CAPTURA,
    equipo: { valores: { 1: { escala: 'a', valor: 1.5 }, 2: { escala: 'b', valor: 22 } }, ilvl: 24 },
    candidatas: { 1: { nome: 'Hunter: Beast Mastery', classID: 3 }, 2: { nome: 'Hunter: Survival' } },
  })
  assert.equal(c.equipo.valores.length, 2)
  assert.equal(c.equipo.valores[0].escala, 'a')
  assert.equal(c.equipo.valores[1].valor, 22)
  assert.equal(c.equipo.ilvl, 24)
  assert.equal(c.candidatas.length, 2)
  assert.equal(c.candidatas[0].nome, 'Hunter: Beast Mastery')
  // Orden por índice numérico, no por orden de inserción ("10" no va antes que "2").
  const d = parsePawnCaptura({ ...CAPTURA, equipo: { valores: { 10: { escala: 'diez', valor: 10 }, 2: { escala: 'dos', valor: 2 } } } })
  assert.deepEqual(d.equipo.valores.map((v) => v.escala), ['dos', 'diez'])
  // Clave no numérica: no adivinamos, la lista entera se descarta.
  const e = parsePawnCaptura({ ...CAPTURA, equipo: { valores: { 1: { escala: 'a', valor: 1 }, otra: { escala: 'b', valor: 2 } } } })
  assert.equal(e.equipo.valores.length, 0)
})

// ---------- escalaDoJogador ----------
test('escalaDoJogador: la captura del addon manda sobre el catálogo', () => {
  const cat = parsePawnScales(PAWN_LUA)
  const r = escalaDoJogador(cat, CAPTURA, { classe: 3, spec: 2 })
  assert.equal(r.motivo, 'capturada')
  assert.equal(r.escala.nome, '"Classic":HUNTER1')
  assert.equal(r.temPesos, true)
  assert.equal(r.escala.pesos.Agility, 1.5)
})

test('escalaDoJogador: clase+spec del catálogo cuando no hay captura', () => {
  const cat = parsePawnScales(PAWN_LUA)
  const r = escalaDoJogador(cat, null, { classe: 3, spec: 2 })
  assert.equal(r.motivo, 'catalogo-clase-spec')
  assert.equal(r.escala.nome, '"Classic":HUNTER2')
  assert.equal(r.temPesos, false) // proveedor: sin pesos persistidos
  assert.deepEqual(r.candidatas.sort(), ['"Classic":HUNTER2'])
})

test('escalaDoJogador: spec desconocida cae a clase sola', () => {
  const cat = parsePawnScales(PAWN_LUA)
  const r = escalaDoJogador(cat, null, { classe: 3, spec: 99 })
  assert.equal(r.motivo, 'catalogo-clase')
  assert.equal(r.escala.nome, '"Classic":HUNTER1') // orden de nombre
  assert.ok(r.candidatas.length >= 3) // HUNTER1, HUNTER2 y la custom
})

test('escalaDoJogador: clase sin escalas devuelve null con motivo', () => {
  const cat = parsePawnScales(PAWN_LUA)
  const r = escalaDoJogador(cat, null, { classe: 4, spec: 1 })
  assert.equal(r.escala, null)
  assert.equal(r.motivo, 'sin-coincidencia')
  assert.equal(r.temPesos, false)
})

test('escalaDoJogador: empate entre candidatas se resuelve por nombre', () => {
  const cat = {
    escalas: [
      { nome: 'B', localized: 'B', provider: null, classID: 3, specID: 1, temPesos: false },
      { nome: 'A', localized: 'A', provider: null, classID: 3, specID: 1, temPesos: false },
      { nome: 'C', localized: 'C', provider: null, classID: 3, specID: 2, temPesos: false },
    ],
  }
  const r = escalaDoJogador(cat, null, { classe: 3, spec: 1 })
  assert.equal(r.escala.nome, 'A')
  assert.deepEqual(r.candidatas, ['A', 'B'])
  assert.equal(r.motivo, 'catalogo-clase-spec')
})

// ---------- persistencia ----------

function ctxFalso() {
  const datos = new Map()
  return {
    datos,
    storage: {
      async get(k, d) { return datos.has(k) ? datos.get(k) : d },
      async set(k, v) { datos.set(k, v) },
    },
  }
}

test('storage: guardar/leer captura roundtrip y corrupto -> null', async () => {
  const ctx = ctxFalso()
  assert.equal(await lerPawn(ctx), null)
  const g = await guardarPawn(ctx, { ...CAPTURA, erro: { msg: 'x', capturado: 1 } })
  assert.equal(g.escala, '"Classic":HUNTER1')
  const lido = await lerPawn(ctx)
  assert.equal(lido.capturado, 1763300000)
  assert.equal(lido.erro.msg, 'x')
  ctx.datos.set(CLAVE, { v: 99 })
  assert.equal(await lerPawn(ctx), null)
  ctx.datos.set(CLAVE, 'basura')
  assert.equal(await lerPawn(ctx), null)
})

// ---------- journal del bridge ----------

function journalLua(bloque) {
  return [
    'WoWForeverBridgeDB={version=1,retentionDays=14,',
    'entries={[2500]={day=2500,at=1763300000,realm="reino",items={',
    '["i:23456"]={d=2500,m=15000,hi=15000,lo=15000,av=1},',
    '}}},',
    bloque,
    '}',
  ].join('')
}

test('bridge: WoWForeverBridgeDB.pawn y pawnErro se extraen validados', () => {
  const pawnLua = 'pawn={v=1,escala="esc",localized="Esc",provider="P",classID=3,specID=1,' +
    'pesos={Agility=1.5,Anidada={x=1}},equipo={valores={{escala="e",valor=2,localized="l"}},ilvl=30},' +
    'capturado=1763300000,origem="addon",truncado=false},' +
    'pawnErro={erro="falhou",capturado=1763300100},'
  const j = parseBridge(enc(journalLua(pawnLua)))
  assert.ok(j.pawn)
  assert.equal(j.pawn.escala, 'esc')
  assert.equal(j.pawn.pesos.Anidada, undefined)
  assert.equal(j.pawn.equipo.ilvl, 30)
  assert.equal(j.pawn.capturado, 1763300000)
  assert.equal(j.pawnErro.erro, 'falhou')
  assert.equal(j.pawnErro.capturado, 1763300100)
  const j2 = parseBridge(enc(journalLua('')))
  assert.equal(j2.pawn, null)
  assert.equal(j2.pawnErro, null)
})

test('bridge: pawn inválido se descarta sin tirar el journal', () => {
  const lua = journalLua('pawn={v=2,escala="x",capturado=1,origem="addon"},')
  const j = parseBridge(enc(lua))
  assert.equal(j.pawn, null)
  assert.equal(j.entries.length, 1)
})

// ---------- sincronización addon -> storage ----------

test('sincronizarPawn: captura nueva gana, idempotente, erro se conserva', async () => {
  const ctx = ctxFalso()
  const journal = {
    version: 1, retentionDays: 14, entries: [],
    pawn: { ...CAPTURA, capturado: 200 },
    pawnErro: { erro: 'fallo', capturado: 300 },
  }
  const r1 = await sincronizarPawn(ctx, journal)
  assert.equal(r1.status, 'ok')
  const lido = await lerPawn(ctx)
  assert.equal(lido.escala, '"Classic":HUNTER1')
  assert.equal(lido.erro.msg, 'fallo') // erro más nuevo que la captura
  const r2 = await sincronizarPawn(ctx, journal)
  assert.equal(r2.status, 'sin-cambios')
  // captura más vieja no reemplaza
  const r3 = await sincronizarPawn(ctx, { ...journal, pawn: { ...CAPTURA, capturado: 100 } })
  assert.equal(r3.status, 'sin-cambios')
  // solo erro sin captura previa no crea estado
  const ctx2 = ctxFalso()
  const r4 = await sincronizarPawn(ctx2, { version: 1, retentionDays: 14, entries: [], pawn: null, pawnErro: { erro: 'nunca', capturado: 5 } })
  assert.equal(r4.status, 'sin-cambios')
  assert.equal(await lerPawn(ctx2), null)
})

// ---------- catálogo ----------

test('sincronizarCatalogoPawn: guarda escalas y las relee normalizadas', async () => {
  const ctx = ctxFalso()
  const r = await sincronizarCatalogoPawn(ctx, enc(PAWN_LUA))
  assert.equal(r.status, 'ok')
  const cat = await lerCatalogoPawn(ctx)
  assert.equal(cat.v, VERSION)
  assert.equal(cat.versao, 2.1403)
  assert.equal(cat.escalas.length, 4)
  assert.ok(ctx.datos.has(CLAVE_CATALOGO))
  const vacio = await sincronizarCatalogoPawn(ctx, enc('nada = 1'))
  assert.equal(vacio.status, 'sin-cambios')
})
