// Pruebas de desktop/src/simc.js: parser del export de SimulationCraft,
// persistencia en ctx.storage ('personaje-simc'), extracción del bloque
// WoWForeverBridgeDB.personaje y propuesta de perfil.
// Todo dato de personaje aquí es inventado y anonimizado (regla del repo).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  CLAVE,
  VERSION,
  MAX_TEXTO,
  parsearSimc,
  normalizarEstadoPersonagem,
  lerPersonagem,
  guardarPersonagem,
  sincronizarPersonagem,
  propostaPerfil,
} from '../desktop/src/simc.js'
import { parseBridge } from '../desktop/src/bridge.js'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..')
const DADOS = JSON.parse(readFileSync(join(RAIZ, 'data', 'personaje.json'), 'utf8'))
const PERFIL_VAZIO = { v: 1, faccion: null, raza: null, clase: null, nivel: 1, profesiones: [], secundarias: [], reino: '' }

// Export realista del addon SimulationCraft 12.1.5-04 (Forever): misma forma
// que produce Simulationcraft:GetSimcProfile en core.lua. Anonimizado.
const EXPORT_COMPLETO = [
  '# Personaje - unknown - 2026-11-20 12:00 - latam/Prueba',
  '# SimC Addon 12.1.5-04',
  '# WoW 12.0.1.70888, TOC 16001',
  '# Requires SimulationCraft 1000-01 or newer',
  '',
  'hunter="Personaje Prueba"',
  'level=30',
  'race=human',
  'region=latam',
  'server=prueba',
  'role=attack',
  'professions=engineering=300/first_aid=110',
  'spec=unknown',
  '',
  'talents=CdEAAAAAAAAAAAAAAAAAAAAA',
  '',
  '# Primary Talents',
  '# talents=CcEAAAAAAAAAAAAAAAAAAAAA',
  '',
  'legacy_talents=12345:1/67890:2',
  '',
  '# Arco de prueba (30)',
  'main_hand=,id=23456,enchant_id=789,gem_id=111/222,bonus_id=333/444',
  '# Pechera de lana (25)',
  'chest=,id=34567,gem_id=555',
  '# Anel de plata (20)',
  'finger1=,id=45678',
  '# Yeso de prueba (20)',
  'trinket1=,id=56789',
  '',
  '# Mascota - Beast (20)',
  'pet_family=cat',
  'pet_creature_id=1234',
  'pet_level=20',
  'pet_happiness=3',
  'pet_abilities=136/311',
  '',
  '### Gear from Bags',
  '#',
  '# Daga vieja (15)',
  '# legs=,id=11111,enchant_id=222',
  '',
  '### Additional Character Info',
  '#',
  '# character_stats=strength:10/agility:150/stamina:80/intellect:20/spirit:15/health:1200/mana:500',
  '# character_stats_base=strength:10/agility:120/stamina:70/intellect:15/spirit:10/health:900/mana:400',
  '# character_stats_bonus=strength:0/agility:30/stamina:10/intellect:5/spirit:5/health:300/mana:100',
  '# character_stats_gear=agility:25/stamina:8/intellect:4/health:250',
  '# attack_power=melee:100:5:0/ranged:50:2:0',
  '# spell_power=holy:0/fire:0',
  '# spell_stats=healing:0/penetration:0',
  '# regen=health:10:20/health_from_spirit:5:10/mana:8:16/mana_from_spirit:4:8',
  '# crit=melee:5.00/ranged:5.00/spell:0.00',
  '# hit=melee_rating_bonus:10/melee_modifier:0/ranged_rating_bonus:8/ranged_modifier:0',
  '# haste=melee:0/ranged:0/ranged_ammo:0/spell:0',
  '# combat_modifiers=expertise:10/expertise_offhand:0/expertise_ranged:0',
  '# combat_ratings=dodge:50:0/parry:0:0/hit_melee:10:0',
  '# defense=armor_base:500/armor_effective:600/armor:600/armor_bonus:100/defense_skill:300/dodge:5.00',
  '# resistances=holy:0/fire:0/nature:0/frost:0/shadow:0/arcane:0',
  '# weapon_damage=mainhand:50:100:2.40:0:0:0/offhand:0:0:0:0:0:0:0/ranged:30:60:2.80:0:0:0',
  '# pet_info=type:beast',
  '# pet_stats=health:800/mana:0/armor:200',
  '# pet_attack_power=melee:50:0:0',
  '# pet_defense=armor:200/defense_skill:200',
  '# skills=first_aid:110',
  '# buffs=',
  '',
  '# Checksum: abc123def456',
  '',
].join('\n')

test('parsearSimc: export completo produce todos los campos', () => {
  const r = parsearSimc(EXPORT_COMPLETO)
  assert.equal(r.ok, true)
  assert.deepEqual(r.erros, [])
  const p = r.personagem
  assert.equal(p.version, '12.1.5-04')
  assert.equal(p.checksum, 'abc123def456')
  assert.equal(p.clase, 3) // hunter
  assert.equal(p.claseToken, 'hunter')
  assert.equal(p.spec, 'unknown')
  assert.equal(p.nivel, 30)
  assert.equal(p.raza, 1) // human
  assert.equal(p.razaToken, 'human')
  assert.equal(p.reino, 'prueba')
  assert.equal(p.regiao, 'latam')
  assert.equal(p.rol, 'attack')
  assert.equal(p.stats.strength, 10)
  assert.equal(p.stats.agility, 150)
  assert.equal(p.stats.health, 1200)
  assert.equal(p.statsBase.agility, 120)
  assert.equal(p.statsBonus.agility, 30)
  assert.equal(p.statsGear.agility, 25)
  assert.deepEqual(p.combate.attack_power.melee, [100, 5, 0])
  assert.equal(p.combate.crit.melee, 5)
  assert.equal(p.combate.defense.armor_effective, 600)
  assert.equal(p.mascote.family, 'cat')
  assert.equal(p.mascote.creature_id, 1234)
  assert.equal(p.mascote.level, 20)
  assert.deepEqual(p.mascote.abilities, [136, 311])
  assert.equal(p.mascote.stats.health, 800)
  assert.equal(p.mascote.combate.defense.armor, 200)
  const mh = p.equipo.main_hand
  assert.equal(mh.id, 23456)
  assert.equal(mh.ilvl, 30)
  assert.equal(mh.nome, 'Arco de prueba')
  assert.equal(mh.enchant, 789)
  assert.deepEqual(mh.gems, [111, 222])
  assert.deepEqual(mh.bonus, [333, 444])
  assert.equal(p.equipo.chest.id, 34567)
  assert.equal(p.equipo.chest.ilvl, 25)
  assert.equal(p.equipo.finger1.id, 45678)
  assert.equal(p.equipo.trinket1.id, 56789)
  assert.equal(p.equipo.legs, undefined) // slot ausente queda null/undefined
  assert.equal(p.equipable[0].id, 11111) // bolsa comentada
  assert.equal(p.equipable[0].slot, 'legs')
  assert.equal(p.equipable[0].ilvl, 15)
  assert.deepEqual(p.bolsas, {})
  assert.equal(p.outros.skills, 'first_aid:110')
  assert.equal(p.talentos.ativo, 'CdEAAAAAAAAAAAAAAAAAAAAA')
  assert.deepEqual(p.talentos.grupos, ['CcEAAAAAAAAAAAAAAAAAAAAA'])
  assert.equal(p.talentos.legacy, '12345:1/67890:2')
  assert.deepEqual(p.profissoes, [
    { id: 202, nome: 'engineering', skill: 300 },
    { id: 129, nome: 'first_aid', skill: 110 },
  ])
  assert.ok(Array.isArray(p.desconhecidas))
})

test('parsearSimc: export sin talentos ni equipo deja campos en null', () => {
  const texto = [
    'mage="Maga"',
    'level=60',
    'race=dwarf',
    'server=reino',
    '',
    '# character_stats=agility:200/intellect:300/health:2000',
    '# Checksum: xyz',
  ].join('\n')
  const r = parsearSimc(texto)
  assert.equal(r.ok, true)
  const p = r.personagem
  assert.equal(p.clase, 8)
  assert.equal(p.raza, 3)
  assert.equal(p.stats.intellect, 300)
  assert.deepEqual(p.talentos, { ativo: null, grupos: [], legacy: null, sistemas: {} })
  assert.deepEqual(p.equipo, {})
  assert.deepEqual(p.equipable, [])
  assert.deepEqual(p.profissoes, [])
})

test('parsearSimc: líneas desconocidas van a desconhecidas sin romper', () => {
  const texto = EXPORT_COMPLETO + 'custom_thing=42\n# otra_cosa=hola\n'
  const r = parsearSimc(texto)
  assert.equal(r.ok, true)
  assert.ok(r.personagem.desconhecidas.includes('custom_thing=42'))
  assert.ok(r.personagem.desconhecidas.includes('otra_cosa=hola'))
  assert.equal(r.personagem.stats.strength, 10) // el resto sigue bien
})

test('parsearSimc: basura devuelve ok:false sin inventar campos', () => {
  const r = parsearSimc('esto no es un export\nsolo texto random\n!!!\n')
  assert.equal(r.ok, false)
  assert.ok(r.erros.length > 0)
  assert.deepEqual(r.personagem.stats, {})
})

test('parsearSimc: vacío, null y no-string se rechazan', () => {
  for (const t of ['', '   \n  ', null, undefined, 42, {}]) {
    const r = parsearSimc(t)
    assert.equal(r.ok, false, `entrada ${JSON.stringify(t)}`)
  }
})

test('parsearSimc: entrada gigante se rechaza', () => {
  const grande = 'x=1\n' + 'a'.repeat(MAX_TEXTO) + '\n'
  const r = parsearSimc(grande)
  assert.equal(r.ok, false)
  assert.ok(r.erros.some((e) => /grande|tamanho|size/i.test(e)))
})

test('parsearSimc: CRLF se parsea igual que LF', () => {
  const crlf = EXPORT_COMPLETO.replace(/\n/g, '\r\n')
  const a = parsearSimc(EXPORT_COMPLETO)
  const b = parsearSimc(crlf)
  assert.equal(b.ok, true)
  assert.equal(b.personagem.clase, a.personagem.clase)
  assert.equal(b.personagem.equipo.main_hand.id, 23456)
  assert.equal(b.personagem.stats.health, 1200)
})

test('parsearSimc: tokens de raza/clase desconocidos quedan en null con error', () => {
  const texto = 'alien="X"\nlevel=30\nrace=elfo_oscuro\nserver=reino\n'
  const r = parsearSimc(texto)
  assert.equal(r.ok, true) // level=30 es reconocido
  assert.equal(r.personagem.clase, null)
  assert.equal(r.personagem.claseToken, 'alien')
  assert.equal(r.personagem.raza, null)
  assert.equal(r.personagem.razaToken, 'elfo_oscuro')
  assert.ok(r.erros.length > 0)
})

test('parsearSimc: el texto nunca se evalúa (sin código ejecutable)', () => {
  const malicioso = 'level=30\n' + 'x"; process.exit(1); //\n' + 'require("fs")\n'
  const r = parsearSimc(malicioso)
  assert.equal(r.ok, true) // level=30 basta
  assert.equal(r.personagem.nivel, 30)
  assert.ok(r.personagem.desconhecidas.length > 0)
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

test('storage: guardar/leer/normalizar roundtrip', async () => {
  const ctx = ctxFalso()
  assert.equal(await lerPersonagem(ctx), null)
  const reg = {
    v: VERSION,
    origem: 'addon',
    texto: EXPORT_COMPLETO,
    capturado: 1763300000,
    erro: null,
  }
  const guardado = await guardarPersonagem(ctx, reg)
  assert.equal(guardado.origem, 'addon')
  assert.equal(guardado.texto, EXPORT_COMPLETO)
  const lido = await lerPersonagem(ctx)
  assert.equal(lido.capturado, 1763300000)
})

test('storage: registro corrupto se normaliza a null', () => {
  assert.equal(normalizarEstadoPersonagem(null), null)
  assert.equal(normalizarEstadoPersonagem('x'), null)
  assert.equal(normalizarEstadoPersonagem({ v: 99, origem: 'addon' }), null)
  assert.equal(normalizarEstadoPersonagem({ v: 1, origem: 'otro', texto: 'x' }), null)
  const gigante = { v: 1, origem: 'pegado', texto: 'a'.repeat(MAX_TEXTO + 1) }
  assert.equal(normalizarEstadoPersonagem(gigante), null)
})

test('storage: erro del addon se conserva con su timestamp', async () => {
  const ctx = ctxFalso()
  const reg = {
    v: VERSION,
    origem: 'addon',
    texto: EXPORT_COMPLETO,
    capturado: 1763300000,
    erro: { msg: 'SimulationcraftAPI ausente', capturado: 1763300100 },
  }
  const n = normalizarEstadoPersonagem(reg)
  assert.equal(n.erro.msg, 'SimulationcraftAPI ausente')
  assert.equal(n.erro.capturado, 1763300100)
})

// ---------- extracción desde el journal del bridge ----------

const enc = (s) => new TextEncoder().encode(s)

function journalLua(personagemLua) {
  return [
    'WoWForeverBridgeDB={version=1,retentionDays=14,',
    'entries={[2500]={day=2500,at=1763300000,realm="reino",items={',
    '["i:23456"]={d=2500,m=15000,hi=15000,lo=15000,av=1},',
    '}}},',
    personagemLua,
    '}',
  ].join('')
}

test('bridge: WoWForeverBridgeDB.personagem se extrae con simc y capturado', () => {
  const simcEsc = EXPORT_COMPLETO.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
  const lua = journalLua(`personagem={simc="${simcEsc}",capturado=1763300000,origem="addon"},`)
  const j = parseBridge(enc(lua))
  assert.equal(j.personagem.simc, EXPORT_COMPLETO)
  assert.equal(j.personagem.capturado, 1763300000)
  assert.equal(j.personagem.origem, 'addon')
  assert.equal(j.entries.length, 1)
})

test('bridge: personagemErro se extrae; ausencia deja null', () => {
  const lua = journalLua('personagemErro={erro="GetSimcProfile fallo",capturado=1763300200},')
  const j = parseBridge(enc(lua))
  assert.equal(j.personagem, null)
  assert.equal(j.personagemErro.erro, 'GetSimcProfile fallo')
  assert.equal(j.personagemErro.capturado, 1763300200)
  const j2 = parseBridge(enc(journalLua('')))
  assert.equal(j2.personagem, null)
  assert.equal(j2.personagemErro, null)
})

test('bridge: simc gigante se descarta sin tirar el journal', () => {
  const simcGrande = 'a'.repeat(600 * 1024)
  const lua = journalLua(`personagem={simc="${simcGrande}",capturado=1},`)
  const j = parseBridge(enc(lua))
  assert.equal(j.personagem, null)
  assert.equal(j.entries.length, 1)
})

// ---------- sincronización addon -> storage ----------

test('sincronizar: captura del addon gana sobre pegado y es idempotente', async () => {
  const ctx = ctxFalso()
  await guardarPersonagem(ctx, { v: 1, origem: 'pegado', texto: 'viejo', capturado: 100, erro: null })
  const journal = {
    version: 1,
    retentionDays: 14,
    entries: [],
    personagem: { simc: EXPORT_COMPLETO, capturado: 200, origem: 'addon' },
    personagemErro: null,
  }
  const r1 = await sincronizarPersonagem(ctx, journal)
  assert.equal(r1.status, 'ok')
  const lido = await lerPersonagem(ctx)
  assert.equal(lido.origem, 'addon')
  assert.equal(lido.texto, EXPORT_COMPLETO)
  // misma captura otra vez: sin cambios
  const r2 = await sincronizarPersonagem(ctx, journal)
  assert.equal(r2.status, 'sin-cambios')
})

test('sincronizar: erro del addon más nuevo que el último buen export se guarda', async () => {
  const ctx = ctxFalso()
  const journal = {
    version: 1,
    retentionDays: 14,
    entries: [],
    personagem: { simc: EXPORT_COMPLETO, capturado: 200, origem: 'addon' },
    personagemErro: { erro: 'fallo reciente', capturado: 300 },
  }
  await sincronizarPersonagem(ctx, journal)
  const lido = await lerPersonagem(ctx)
  assert.equal(lido.texto, EXPORT_COMPLETO) // conserva el último export bueno
  assert.equal(lido.erro.msg, 'fallo reciente')
  assert.equal(lido.erro.capturado, 300)
})

test('sincronizar: solo erro sin export previo no crea estado', async () => {
  const ctx = ctxFalso()
  const journal = {
    version: 1,
    retentionDays: 14,
    entries: [],
    personagem: null,
    personagemErro: { erro: 'nunca hubo export', capturado: 300 },
  }
  const r = await sincronizarPersonagem(ctx, journal)
  assert.equal(r.status, 'sin-cambios')
  assert.equal(await lerPersonagem(ctx), null)
})

// ---------- propuesta de perfil ----------

test('propostaPerfil: propone campos del export sin tocar raza válida', () => {
  const p = parsearSimc(EXPORT_COMPLETO).personagem
  const perfil = { ...PERFIL_VAZIO, faccion: 'horda', raza: 2, clase: 3, nivel: 25, reino: 'otro' }
  const r = propostaPerfil(p, perfil, DADOS)
  assert.ok(r)
  assert.equal(r.campos.nivel, 30)
  assert.equal(r.campos.reino, 'prueba')
  assert.equal(r.campos.raza, 1) // human es válido para hunter
  assert.equal(r.campos.faccion, 'alianza') // la raza del export implica la facción
  assert.equal(r.campos.clase, undefined) // ya era hunter
  assert.deepEqual(r.campos.profissoes, [202])
  assert.deepEqual(r.campos.secundarias, [129])
})

test('propostaPerfil: raza inválida para la clase no se propone', () => {
  // dwarf no puede ser warlock en combinaciones -> raza/facción quedan fuera
  const texto = 'warlock="X"\nlevel=35\nrace=dwarf\nserver=reino_x\n'
  const p = parsearSimc(texto).personagem
  const perfil = { ...PERFIL_VAZIO, faccion: 'horda', raza: 2, clase: 9, nivel: 30 }
  const r = propostaPerfil(p, perfil, DADOS)
  assert.ok(r)
  assert.equal(r.campos.raza, undefined)
  assert.equal(r.campos.faccion, undefined)
  assert.equal(r.campos.clase, undefined) // ya era warlock
  assert.equal(r.campos.nivel, 35)
  assert.equal(r.campos.reino, 'reino x') // el token del export vuelve a espacios
})

test('propostaPerfil: sin diferencias devuelve null', () => {
  const p = parsearSimc(EXPORT_COMPLETO).personagem
  const perfil = {
    ...PERFIL_VAZIO,
    faccion: 'alianza',
    raza: 1,
    clase: 3,
    nivel: 30,
    reino: 'prueba',
    profesiones: [202],
    secundarias: [129],
  }
  const r = propostaPerfil(p, perfil, DADOS)
  assert.equal(r, null)
})
