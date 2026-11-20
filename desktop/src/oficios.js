// Niveles de oficio declarados a mano por el jugador, con la misma mecánica que
// recetas-propias.js: la semilla pinta la primera vez, lo guardado la reemplaza en
// cuanto llega y un estado guardado vacío NO se vuelve a sembrar.
// El input de la vista Profesiones (`skill-<id>` en ctx.storage) manda sobre esto:
// si el jugador escribió un nivel, ese valor gana siempre.
export const CLAVE = 'niveles-oficio'
export const VERSION = 1
export const PESCA = 356
export const NIVEL_MAX = 300

// Pesca 93: lo declaró el jugador. El plugin nunca lo leyó del cliente.
export const SEMILLA = Object.freeze({ [PESCA]: 93 })

const entero = (v) => {
  if (typeof v === 'number') return Number.isSafeInteger(v) ? v : null
  if (typeof v === 'string' && /^\d{1,3}$/.test(v)) return Number(v)
  return null
}
const idValido = (id) => Number.isSafeInteger(id) && id > 0
const nivelValido = (n) => Number.isSafeInteger(n) && n >= 0 && n <= NIVEL_MAX

// {id: nivel} sin ids inválidos ni niveles fuera de 0..300; claves numéricas.
export function normalizarNiveles(x) {
  const out = {}
  if (!x || typeof x !== 'object' || Array.isArray(x)) return out
  for (const clave of Object.keys(x)) {
    const id = entero(clave)
    const n = entero(x[clave])
    if (!idValido(id) || !nivelValido(n)) continue
    out[id] = n
  }
  return out
}

// Contrato guardado: {v, niveles:{id:nivel}}. Estricto: un valor inválido anula el estado.
export function normalizarEstado(estado) {
  if (!estado || typeof estado !== 'object' || Array.isArray(estado)) return null
  if (estado.v !== VERSION) return null
  const crudo = estado.niveles
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null
  for (const clave of Object.keys(crudo)) {
    const id = entero(clave)
    const n = entero(crudo[clave])
    if (!idValido(id) || !nivelValido(n)) return null
  }
  return normalizarNiveles(crudo)
}

export function nivelDe(niveles, id, def = 0) {
  const n = niveles && typeof niveles === 'object' ? niveles[id] : null
  return nivelValido(n) ? n : def
}

// {niveles, origen:'declarados'|'semilla'}. Un estado ilegible cae a la semilla;
// uno válido pero vacío significa «el jugador los borró» y no se resiembra.
export async function leerNiveles(ctx) {
  let guardado = null
  try {
    guardado = ctx && ctx.storage ? await ctx.storage.get(CLAVE) : null
  } catch {
    guardado = null
  }
  const limpio = normalizarEstado(guardado)
  if (limpio) return { niveles: limpio, origen: 'declarados' }
  return { niveles: { ...SEMILLA }, origen: 'semilla' }
}

// Persiste y confirma releyendo: si el storage no devuelve lo escrito, falla.
export async function guardarNiveles(ctx, niveles) {
  const limpio = normalizarNiveles(niveles)
  await ctx.storage.set(CLAVE, { v: VERSION, niveles: limpio })
  const leido = normalizarEstado(await ctx.storage.get(CLAVE))
  if (!leido) throw new Error('No se confirmó el guardado de los niveles de oficio.')
  return leido
}
