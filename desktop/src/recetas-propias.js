// Recetas de profesión que el jugador YA tiene. Es una declaración del jugador, no una
// lectura del juego: vive en ctx.storage ('recetas-propias') como {v, spells:[…]}. La
// primera lectura sin estado siembra SEMILLA, la lista de Cocina que Cristóbal declaró
// el 2026-11-20. Guardar el estado aunque quede vacío es lo que distingue «lo borré» de
// «nunca se declaró»: solo la ausencia de la clave vuelve a sembrar.
//
// Todo lo de acá es puro salvo leerPropias/guardarPropias, que tocan ctx.storage.

export const CLAVE = 'recetas-propias'
export const VERSION = 1
export const PROFESION_SEMILLA = 185 // Cocina / Cooking

// «Everyday Meals» y sus comidas por buff, tal como las declaró el jugador. El número es
// el spell de la receta en data/profesiones.json (profesión 185); el nombre queda de
// referencia y lo verifica tests/recetas-propias.test.mjs contra los datos.
export const SEMILLA = [
  20626, // Everyday Meals · Undermine Clam Chowder
  2538, // Everyday Meals · Charred Wolf Meat
  6418, // Stamina Food · Crispy Lizard Tail
  8604, // Stamina Food · Herb Baked Egg
  2540, // Strength Food · Roasted Boar Meat
  22480, // Agility Food · Tender Wolf Steak
  15856, // Agility Food · Hot Wolf Ribs
  3398, // Agility Food · Hot Lion Chops
  6416, // Intellect Food · Strider Stew
  18247, // Spell Damage Food · Baked Salmon
  18245, // Spell Damage Food · Lobster Stew
  18243, // Spell Damage Food · Nightfin Soup
  18238, // Spell Damage Food · Spotted Yellowtail
  25704, // Spell Damage Food · Smoked Sagefish
  7827, // Spell Damage Food · Rainbow Fin Albacore
  18246, // Attack Power Food · Mightfish Steak
  18244, // Attack Power Food · Poached Sunscale Salmon
  18239, // Attack Power Food · Cooked Glossy Mightfish
  20916, // Attack Power Food · Mithril Headed Trout
  7753, // Attack Power Food · Longjaw Mud Snapper
  7751, // Attack Power Food · Brilliant Smallfish
  18240, // Combat Prowess Food · Grilled Squid
  18241, // Fisherman's Delights · Filet of Redgill
  7828, // Fisherman's Delights · Rockscale Cod
  7755, // Fisherman's Delights · Bristle Whisker Catfish
]

// Lista canónica: enteros positivos, sin repetir, ordenada (comparaciones estables).
export function normalizarLista(spells) {
  const out = []
  for (const s of Array.isArray(spells) ? spells : []) {
    if (Number.isSafeInteger(s) && s > 0 && !out.includes(s)) out.push(s)
  }
  return out.sort((a, b) => a - b)
}

// Valor guardado válido -> lista; cualquier otra cosa (versión vieja, texto, corrupción)
// -> null, para que el llamador decida (acá: volver a la semilla).
export function normalizarEstado(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  if (v.v !== VERSION || !Array.isArray(v.spells)) return null
  if (!v.spells.every((s) => Number.isSafeInteger(s) && s > 0)) return null
  return normalizarLista(v.spells)
}

// Devuelve { spells, origen: 'guardadas' | 'semilla' }. Tolera que storage falle: en ese
// caso la pantalla igual arranca con la semilla y se evita escribir nada.
export async function leerPropias(ctx) {
  try {
    const guardado = normalizarEstado(await ctx.storage.get(CLAVE))
    if (guardado) return { spells: guardado, origen: 'guardadas' }
  } catch { /* sin storage se usa la semilla */ }
  return { spells: normalizarLista(SEMILLA), origen: 'semilla' }
}

// Guarda y confirma releyendo, como el resto del plugin (almacen.js). Si la lectura no
// coincide lanza: la vista deja el cambio solo en pantalla y no miente sobre el disco.
export async function guardarPropias(ctx, spells) {
  const valor = { v: VERSION, spells: normalizarLista(spells) }
  await ctx.storage.set(CLAVE, valor)
  const leido = normalizarEstado(await ctx.storage.get(CLAVE))
  if (!leido || leido.join(',') !== valor.spells.join(',')) {
    throw new Error('No se confirmó el guardado de recetas propias.')
  }
  return valor.spells
}

// Marca/desmarca un spell sin mutar la lista recibida.
export function alternar(spells, spell) {
  const base = normalizarLista(spells)
  if (!Number.isSafeInteger(spell) || spell <= 0) return base
  return base.includes(spell) ? base.filter((s) => s !== spell) : normalizarLista([...base, spell])
}

// Resumen para la vista y para el contexto de «Preguntar a DAVI»: cuántas del catálogo de
// esta profesión ya tiene y cuáles faltan (por spell, determinista).
export function resumenRecetario(recetas, propias) {
  const lista = Array.isArray(recetas) ? recetas.filter((r) => r && Number.isSafeInteger(r.spell)) : []
  const mias = new Set(normalizarLista(propias))
  const faltantes = lista.filter((r) => !mias.has(r.spell)).map((r) => r.spell).sort((a, b) => a - b)
  return {
    tiene: lista.filter((r) => mias.has(r.spell)).length,
    total: lista.length,
    faltantes,
  }
}
