// simc.js — estado del personaje leído del export string de SimulationCraft.
// Parser PURO (sin DOM, sin SDK, sin eval): solo lee líneas `clave=valor` y
// comentarios `#`. Lo que no entiende va a `desconhecidas`, nunca rompe.
//
// Formato verificado contra el addon instalado (12.1.5-04, Forever):
//   Interface/AddOns/Simulationcraft/core.lua — GetSimcProfile (~L1109),
//     GetItemStringFromItemLink (~L543), simcSlotNames en extras.lua:173
//   forever/pet.lua (pet_family/pet_level/...), forever/stats.lua
//     (character_stats*, pet_*, combat lines), forever/legacytalents.lua.
//
// Persistencia: ctx.storage['personaje-simc'] =
//   { v:1, origem:'addon'|'pegado', texto, capturado, erro:{msg,capturado}|null }
// `texto` es el export crudo (solo lo lee esta vista; NUNCA va a DAVI).
import {
  MAX_PRINCIPALES,
  PROFESIONES_PRINCIPALES,
  PROFESIONES_SECUNDARIAS,
  faccionDeRaza,
  razasPara,
  validarPerfil,
} from '../../src/perfil.js'

export const CLAVE = 'personaje-simc'
export const VERSION = 1
export const MAX_TEXTO = 512 * 1024
const MAX_DESCONHECIDAS = 200
const MAX_CAMPO = 200
const MAX_ERRO = 500

// Tokens del export -> IDs de data/personaje.json (clases/razas).
const CLASE_POR_TOKEN = { warrior: 1, paladin: 2, hunter: 3, rogue: 4, priest: 5, shaman: 7, mage: 8, warlock: 9, druid: 11 }
const RAZA_POR_TOKEN = { human: 1, orc: 2, dwarf: 3, night_elf: 4, undead: 5, tauren: 6, gnome: 7, troll: 8, skyborne_alliance: 95, skyborne_horde: 96 }
// Tokenized profNames del addon (extras.lua:73-89) -> ID de data/profesiones.json.
// Ojo: el addon usa ProfNames[184]='Cooking' pero el skillLine real del cliente
// es 185; aquí se mapea al ID del cliente (cooking nunca se exporta de todos
// modos: profNames[185] es nil en el addon).
const PROFISSAO_POR_TOKEN = {
  first_aid: 129, blacksmithing: 164, leatherworking: 165, alchemy: 171,
  herbalism: 182, cooking: 185, mining: 186, tailoring: 197, engineering: 202,
  enchanting: 333, fishing: 356, skinning: 393, jewelcrafting: 755,
  inscription: 773, archaeology: 794,
}

// simcSlotNames de extras.lua:173-191 (+ 'ranged' de Forever, extras.lua:232).
const SLOTS_EQUIPADOS = new Set([
  'head', 'neck', 'shoulder', 'back', 'chest', 'shirt', 'tabard', 'wrist',
  'hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1',
  'trinket2', 'main_hand', 'off_hand', 'ammo', 'ranged',
])

// Líneas de comentario `# clave=valor` con valores "nombre:v/nombre:v".
const STATS_PLANOS = {
  character_stats: 'stats', character_stats_base: 'statsBase',
  character_stats_bonus: 'statsBonus', character_stats_gear: 'statsGear',
  pet_stats: 'petStats', pet_stats_base: 'petStatsBase',
  pet_stats_bonus: 'petStatsBonus', pet_stats_gear: 'petStatsGear',
}
const STATS_COMBATE = new Set([
  'attack_power', 'spell_power', 'spell_stats', 'regen', 'crit', 'hit',
  'haste', 'combat_modifiers', 'combat_ratings', 'defense', 'resistances',
  'weapon_damage', 'pet_attack_power', 'pet_spell_power', 'pet_crit',
  'pet_hit', 'pet_haste', 'pet_combat_modifiers', 'pet_combat_ratings',
  'pet_defense', 'pet_resistances', 'pet_weapon_damage', 'pet_modifiers',
])
const OUTROS_KEYS = new Set([
  'skills', 'buffs', 'ammo_count', 'pet_training_points',
  'bonus_roll_currencies', 'bonus_roll_items', 'loot_spec',
])
const MASCOTE_KEYS = new Set(['family', 'creature_id', 'level', 'happiness', 'abilities'])

const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
const numOuTexto = (v) => {
  const s = String(v ?? '').trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : s.slice(0, MAX_CAMPO)
}
const intOuNull = (v) => {
  const n = num(v)
  return n !== null && Number.isInteger(n) ? n : null
}
const cortar = (v) => String(v ?? '').slice(0, MAX_CAMPO)

function personagemVazio() {
  return {
    version: null, checksum: null, nome: null,
    classeToken: null, clase: null, spec: null,
    nivel: null, razaToken: null, raza: null,
    reino: null, regiao: null, rol: null,
    stats: {}, statsBase: {}, statsBonus: {}, statsGear: {},
    combate: {},
    mascote: {
      family: null, creature_id: null, level: null, happiness: null,
      abilities: [], stats: {}, statsBase: {}, statsBonus: {}, statsGear: {},
      info: {}, combate: {},
    },
    equipo: {}, equipable: [], recompensas: [], bolsas: {},
    talentos: { ativo: null, grupos: [], legacy: null, sistemas: {} },
    profissoes: [], outros: {}, desconhecidas: [],
  }
}

// ",id=123,enchant_id=4,gem_id=1/2,bonus_id=3,..." -> campos del ítem.
function parseItemOptions(valor) {
  const out = { id: null, ilvl: null, nome: null, enchant: null, gems: [], bonus: [], extras: {} }
  for (const parte of String(valor ?? '').split(',')) {
    if (!parte) continue
    const eq = parte.indexOf('=')
    if (eq < 0) continue
    const k = parte.slice(0, eq)
    const v = parte.slice(eq + 1)
    if (k === 'id') out.id = intOuNull(v)
    else if (k === 'enchant_id') out.enchant = intOuNull(v)
    else if (k === 'gem_id') out.gems = v.split('/').map(intOuNull).filter((x) => x !== null)
    else if (k === 'bonus_id') out.bonus = v.split('/').map(intOuNull).filter((x) => x !== null)
    else out.extras[k] = cortar(v)
  }
  return out
}

// "name:v/nome2:v2:v3" -> { name: v, nome2: [v2, v3] } (escalar si un solo valor).
function parseCombate(valor) {
  const out = {}
  for (const entrada of String(valor ?? '').split('/')) {
    if (!entrada) continue
    const partes = entrada.split(':')
    const nome = partes[0]
    if (!nome) continue
    const resto = partes.slice(1).map(numOuTexto)
    out[nome] = resto.length <= 1 ? (resto[0] ?? null) : resto
  }
  return out
}

// "name:v/nome2:v2" -> { name: v, nome2: v2 } plano (stats, pet_info).
function parsePares(valor) {
  const out = {}
  for (const entrada of String(valor ?? '').split('/')) {
    if (!entrada) continue
    const eq = entrada.indexOf(':')
    if (eq < 0) continue
    const k = entrada.slice(0, eq)
    const v = entrada.slice(eq + 1)
    if (!k) continue
    out[k] = v.includes(':') ? v.split(':').map(numOuTexto) : numOuTexto(v)
  }
  return out
}

function parseProfissoes(valor) {
  const out = []
  for (const entrada of String(valor ?? '').split('/')) {
    const eq = entrada.indexOf('=')
    if (eq < 0) continue
    const nome = entrada.slice(0, eq)
    if (!nome) continue
    out.push({ id: PROFISSAO_POR_TOKEN[nome] ?? null, nome, skill: intOuNull(entrada.slice(eq + 1)) })
  }
  return out
}

function lineaClaveValor(linha) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(linha)
  return m ? { chave: m[1], valor: m[2] } : null
}

// parsearSimc(texto) -> { ok, erros, personagem }
export function parsearSimc(texto) {
  const erros = []
  const p = personagemVazio()
  if (typeof texto !== 'string' || !texto.trim()) {
    return { ok: false, erros: ['vazio'], personagem: p }
  }
  if (texto.length > MAX_TEXTO) {
    return { ok: false, erros: ['grande'], personagem: p }
  }

  const linhas = texto.replace(/\r\n?/g, '\n').split('\n')
  let pendente = null // {nome, ilvl} del comentario '# Nombre (ilvl)'
  let secao = null // 'bolsas' | 'recompensas' | null

  const desconhecida = (kv) => {
    if (p.desconhecidas.length < MAX_DESCONHECIDAS) p.desconhecidas.push(cortar(kv))
  }
  const equipable = (chave, valor, comentado) => {
    const item = parseItemOptions(valor)
    if (pendente) { item.nome = pendente.nome; item.ilvl = pendente.ilvl }
    item.slot = chave
    if (comentado && secao === 'bolsas') p.equipable.push(item)
    else if (comentado && secao === 'recompensas') p.recompensas.push(item)
    else if (!comentado) p.equipo[chave] = item
    else desconhecida(`${chave}=${cortar(valor)}`)
  }

  for (const bruta of linhas) {
    const linha = bruta.trim()
    if (!linha) continue

    if (linha.startsWith('#')) {
      const conteudo = linha.replace(/^#+\s?/, '').trim()
      if (!conteudo) continue
      if (linha.startsWith('###')) {
        if (conteudo === 'Gear from Bags') secao = 'bolsas'
        else if (conteudo === 'Weekly Reward Choices') secao = 'recompensas'
        else secao = null
        continue
      }
      const mc = /^Checksum:\s*(\S+)/.exec(conteudo)
      if (mc) { p.checksum = mc[1]; continue }
      const mv = /^SimC Addon\s+(.+)$/.exec(conteudo)
      if (mv) { p.version = mv[1].trim(); continue }
      // comentario de ítem: '# Nombre (ilvl)'
      const mi = /^(.+?)\s+\((\d+)\)\s*$/.exec(conteudo)
      if (mi && !conteudo.includes('=')) { pendente = { nome: cortar(mi[1]), ilvl: intOuNull(mi[2]) }; continue }
      const kv = lineaClaveValor(conteudo)
      if (!kv) continue
      if (SLOTS_EQUIPADOS.has(kv.chave)) { equipable(kv.chave, kv.valor, true); pendente = null; continue }
      if (kv.chave === 'talents') { p.talentos.grupos.push(cortar(kv.valor)); continue }
      const statPlano = STATS_PLANOS[kv.chave]
      if (statPlano) {
        const alvo = statPlano === 'petStats' ? p.mascote.stats
          : statPlano === 'petStatsBase' ? p.mascote.statsBase
          : statPlano === 'petStatsBonus' ? p.mascote.statsBonus
          : statPlano === 'petStatsGear' ? p.mascote.statsGear
          : p[statPlano]
        Object.assign(alvo, parsePares(kv.valor))
        continue
      }
      if (kv.chave === 'pet_info') { Object.assign(p.mascote.info, parsePares(kv.valor)); continue }
      if (STATS_COMBATE.has(kv.chave)) {
        if (kv.chave.startsWith('pet_')) p.mascote.combate[kv.chave.slice(4)] = parseCombate(kv.valor)
        else p.combate[kv.chave] = parseCombate(kv.valor)
        continue
      }
      if (OUTROS_KEYS.has(kv.chave)) { p.outros[kv.chave] = cortar(kv.valor); continue }
      desconhecida(`${kv.chave}=${cortar(kv.valor)}`)
      continue
    }

    const kv = lineaClaveValor(linha)
    if (!kv) { desconhecida(linha); pendente = null; continue }
    const { chave, valor } = kv
    if (SLOTS_EQUIPADOS.has(chave)) { equipable(chave, valor, false); pendente = null; continue }
    pendente = null // cualquier otra línea real cierra el comentario '# Nombre (ilvl)'
    if (/^bag\d+$/.test(chave)) { p.bolsas[chave] = parseItemOptions(valor).id; continue }
    if (chave === 'level') {
      p.nivel = intOuNull(valor)
      if (p.nivel === null) erros.push('nivel:invalido')
      continue
    }
    if (chave === 'race') {
      p.razaToken = cortar(valor)
      p.raza = RAZA_POR_TOKEN[p.razaToken] ?? null
      if (p.raza === null) erros.push(`raza:${cortar(valor)}`)
      continue
    }
    if (chave === 'region') { p.regiao = cortar(valor); continue }
    if (chave === 'server') { p.reino = cortar(valor); continue }
    if (chave === 'role') { p.rol = cortar(valor); continue }
    if (chave === 'spec') { p.spec = cortar(valor); continue }
    if (chave === 'professions') { p.profissoes = parseProfissoes(valor); continue }
    if (chave === 'talents') { p.talentos.ativo = cortar(valor); continue }
    if (chave === 'legacy_talents') { p.talentos.legacy = cortar(valor); continue }
    if (chave.endsWith('_talents')) { p.talentos.sistemas[chave] = cortar(valor); continue }
    if (/^pet_/.test(chave)) {
      const resto = chave.slice(4)
      const plano = { stats: 'stats', stats_base: 'statsBase', stats_bonus: 'statsBonus', stats_gear: 'statsGear' }[resto]
      if (plano) Object.assign(p.mascote[plano], parsePares(valor))
      else if (resto === 'info') Object.assign(p.mascote.info, parsePares(valor))
      else if (MASCOTE_KEYS.has(resto)) {
        if (resto === 'abilities') p.mascote.abilities = valor.split('/').map(intOuNull).filter((x) => x !== null)
        else if (resto === 'creature_id' || resto === 'level' || resto === 'happiness') p.mascote[resto] = intOuNull(valor)
        else p.mascote[resto] = cortar(valor)
      } else {
        p.mascote.combate[resto] = parseCombate(valor)
      }
      continue
    }
    // class="Nombre" (única línea con valor entre comillas del export)
    if (valor.startsWith('"') && valor.endsWith('"') && valor.length >= 2) {
      p.nome = cortar(valor.slice(1, -1))
      p.claseToken = chave
      p.clase = CLASE_POR_TOKEN[chave] ?? null
      if (p.clase === null) erros.push(`clase:${cortar(chave)}`)
      continue
    }
    desconhecida(`${chave}=${cortar(valor)}`)
  }

  const temDados = p.version !== null || p.nome !== null || p.clase !== null ||
    p.nivel !== null || p.raza !== null || p.reino !== null ||
    Object.keys(p.stats).length > 0 || Object.keys(p.equipo).length > 0 ||
    p.talentos.ativo !== null || p.profissoes.length > 0 ||
    Object.keys(p.combate).length > 0 || p.mascote.family !== null
  if (!temDados) erros.push('sin-datos')
  return { ok: temDados, erros, personagem: p }
}

// ---------- persistencia (ctx.storage) ----------

export function normalizarEstadoPersonagem(e) {
  if (!e || typeof e !== 'object' || e.v !== VERSION) return null
  if (e.origem !== 'addon' && e.origem !== 'pegado') return null
  if (typeof e.texto !== 'string' || e.texto.length > MAX_TEXTO) return null
  const capturado = Number.isInteger(e.capturado) && e.capturado > 0 ? e.capturado : null
  let erro = null
  if (e.erro && typeof e.erro === 'object') {
    const msg = typeof e.erro.msg === 'string' && e.erro.msg ? e.erro.msg.slice(0, MAX_ERRO) : null
    const cap = Number.isInteger(e.erro.capturado) && e.erro.capturado > 0 ? e.erro.capturado : null
    if (msg && cap) erro = { msg, capturado: cap }
  }
  return { v: VERSION, origem: e.origem, texto: e.texto, capturado, erro }
}

export async function lerPersonagem(ctx) {
  try {
    return normalizarEstadoPersonagem(await ctx.storage.get(CLAVE, null))
  } catch {
    return null
  }
}

export async function guardarPersonagem(ctx, registro) {
  const n = normalizarEstadoPersonagem(registro)
  if (!n) return null
  await ctx.storage.set(CLAVE, n)
  return lerPersonagem(ctx)
}

const mesmoConjunto = (a, b) => a.length === b.length && a.every((x) => b.includes(x))

// sincronizarPersonagem(ctx, journal) — journal = salida de parseBridge.
// El addon escribe WoWForeverBridgeDB.personagem (último export bueno) y
// .personagemErro (último intento fallido). Gana el capturado más nuevo;
// un 'pegado' manual solo cede ante una captura real del addon.
export async function sincronizarPersonagem(ctx, journal) {
  const bom = journal?.personagem
  const mau = journal?.personagemErro
  const capBom = bom && typeof bom.simc === 'string' && bom.simc.length > 0 &&
    bom.simc.length <= MAX_TEXTO && Number.isInteger(bom.capturado) && bom.capturado > 0 ? bom : null
  const capMau = mau && typeof mau.erro === 'string' && mau.erro &&
    Number.isInteger(mau.capturado) && mau.capturado > 0
    ? { msg: mau.erro.slice(0, MAX_ERRO), capturado: mau.capturado } : null
  if (!capBom && !capMau) return { status: 'sin-cambios' }
  const atual = await lerPersonagem(ctx)
  let prox = null
  if (capBom && (!atual || atual.origem !== 'addon' || (atual.capturado ?? -1) < capBom.capturado)) {
    prox = {
      v: VERSION, origem: 'addon', texto: capBom.simc, capturado: capBom.capturado,
      erro: capMau && capMau.capturado > capBom.capturado ? capMau : null,
    }
  } else if (capMau && atual?.origem === 'addon' && capMau.capturado > (atual.erro?.capturado ?? -1)) {
    prox = { ...atual, erro: capMau }
  }
  if (!prox) return { status: 'sin-cambios' }
  const estado = await guardarPersonagem(ctx, prox)
  return estado ? { status: 'ok', estado } : { status: 'sin-cambios' }
}

// propostaPerfil(p, perfil, dados) — campos del export que difieren del perfil
// manual. Nunca propone raza/facción inválidas para la clase; si el candidato
// completo no valida, devuelve null. null si no hay diferencias.
export function propostaPerfil(p, perfil, dados) {
  if (!p || typeof p !== 'object' || !perfil || typeof perfil !== 'object') return null
  const campos = {}
  if (Number.isInteger(p.nivel) && p.nivel >= 1 && p.nivel <= 60 && p.nivel !== perfil.nivel) {
    campos.nivel = p.nivel
  }
  let classeFinal = perfil.clase ?? null
  if (Number.isInteger(p.clase) && dados?.clases?.[String(p.clase)] && p.clase !== perfil.clase) {
    campos.clase = p.clase
    classeFinal = p.clase
  }
  // Los reinos no distinguen mayúsculas: 'prueba' y 'Prueba' son el mismo reino.
  if (typeof p.reino === 'string' && p.reino &&
      p.reino.toLowerCase() !== String(perfil.reino ?? '').toLowerCase()) {
    campos.reino = p.reino.replace(/_/g, ' ')
  }
  if (Number.isInteger(p.raza)) {
    const facRaza = faccionDeRaza(dados, p.raza)
    const facBase = facRaza ?? perfil.faccion ?? null
    if (facBase && razasPara(dados, facBase, classeFinal).includes(p.raza)) {
      if (p.raza !== perfil.raza) campos.raza = p.raza
      const facFinal = facRaza ?? perfil.faccion ?? null
      if (facFinal && facFinal !== perfil.faccion) campos.faccion = facFinal
    }
  }
  if (Array.isArray(p.profissoes) && p.profissoes.length) {
    const ids = p.profissoes.map((x) => x?.id).filter((id) => Number.isInteger(id))
    const principais = [...new Set(ids.filter((id) => PROFESIONES_PRINCIPALES.includes(id)))].slice(0, MAX_PRINCIPALES)
    const secundarias = [...new Set(ids.filter((id) => PROFESIONES_SECUNDARIAS.includes(id)))].sort((a, b) => a - b)
    if (principais.length && !mesmoConjunto(principais, perfil.profesiones ?? [])) campos.profissoes = principais
    if (secundarias.length && !mesmoConjunto(secundarias, perfil.secundarias ?? [])) campos.secundarias = secundarias
  }
  if (!Object.keys(campos).length) return null
  const { ok } = validarPerfil({ ...perfil, ...campos }, dados)
  return ok ? { campos } : null
}
