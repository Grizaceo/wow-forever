// Perfil del jugador: validación, normalización y migración desde la guía anterior.
// Módulo ES puro (sin DOM ni SDK). `personaje` es el contenido de data/personaje.json.

export const VERSION = 1
export const NIVEL_MAX = 60
export const PROFESIONES_PRINCIPALES = [171, 164, 333, 202, 182, 165, 186, 393, 197]
export const PROFESIONES_SECUNDARIAS = [185, 129, 356]
export const MAX_PRINCIPALES = 2
const MAX_REINO = 64

// Estado de la guía anterior (standalone/index.html): cls, fac, lvl.
const CLASE_VIEJA = { hunter: 3, warrior: 1, shaman: 7 }
const FACCION_VIEJA = { horde: 'horda', alliance: 'alianza' }

const entero = (v) => (typeof v === 'number' && Number.isInteger(v) ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null)

export function faccionDeRaza(personaje, raza) {
  return personaje?.razas?.[String(raza)]?.faccion ?? null
}

export function combinacionValida(personaje, raza, clase) {
  return (personaje?.combinaciones || []).some(([r, c]) => r === raza && c === clase)
}

// Razas que pueden ser `clase` en `faccion`, en el orden de sus ID.
export function razasPara(personaje, faccion, clase) {
  return (personaje?.combinaciones || [])
    .filter(([r, c]) => c === clase && faccionDeRaza(personaje, r) === faccion)
    .map(([r]) => r)
    .sort((a, b) => a - b)
}

export function perfilVacio() {
  return { v: VERSION, faccion: null, raza: null, clase: null, nivel: 1, profesiones: [], secundarias: [], reino: '' }
}

// Devuelve {ok, errores, perfil}. `perfil` va normalizado aunque haya errores,
// para que la interfaz pueda mostrar lo que sí es válido; nunca inventa valores.
export function validarPerfil(entrada, personaje) {
  const errores = []
  const p = perfilVacio()
  const e = entrada && typeof entrada === 'object' ? entrada : {}

  p.raza = entero(e.raza)
  p.clase = entero(e.clase)
  if (p.raza === null || !personaje?.razas?.[String(p.raza)]) errores.push('raza')
  if (p.clase === null || !personaje?.clases?.[String(p.clase)]) errores.push('clase')
  if (!errores.length && !combinacionValida(personaje, p.raza, p.clase)) errores.push('combinacion')

  const faccionRaza = p.raza === null ? null : faccionDeRaza(personaje, p.raza)
  p.faccion = faccionRaza ?? (e.faccion === 'alianza' || e.faccion === 'horda' ? e.faccion : null)
  if (faccionRaza && e.faccion && e.faccion !== faccionRaza) errores.push('faccion')

  const nivel = entero(e.nivel)
  if (nivel === null || nivel < 1 || nivel > NIVEL_MAX) errores.push('nivel')
  p.nivel = nivel === null ? 1 : Math.min(NIVEL_MAX, Math.max(1, nivel))

  const vistas = new Set()
  for (const x of Array.isArray(e.profesiones) ? e.profesiones : []) {
    const id = entero(x)
    if (id === null || !PROFESIONES_PRINCIPALES.includes(id)) { errores.push('profesiones'); continue }
    if (!vistas.has(id)) { vistas.add(id); p.profesiones.push(id) }
  }
  if (p.profesiones.length > MAX_PRINCIPALES) {
    errores.push('profesiones')
    p.profesiones = p.profesiones.slice(0, MAX_PRINCIPALES)
  }
  for (const x of Array.isArray(e.secundarias) ? e.secundarias : []) {
    const id = entero(x)
    if (id === null || !PROFESIONES_SECUNDARIAS.includes(id)) { errores.push('secundarias'); continue }
    if (!p.secundarias.includes(id)) p.secundarias.push(id)
  }
  p.secundarias.sort((a, b) => a - b)

  if (typeof e.reino === 'string') p.reino = e.reino.trim().slice(0, MAX_REINO)
  else if (e.reino != null) errores.push('reino')

  return { ok: errores.length === 0, errores: [...new Set(errores)], perfil: p }
}

// Convierte el estado de la guía anterior. La guía vieja no guardaba la raza:
// se propone la primera raza válida y se marca `razaSupuesta` para que la
// interfaz le pida al jugador confirmarla.
export function migrarPerfil(viejo, personaje) {
  const v = viejo && typeof viejo === 'object' ? viejo : {}
  const clase = CLASE_VIEJA[v.cls] ?? null
  const faccion = FACCION_VIEJA[v.fac] ?? null
  const nivel = entero(v.lvl)
  const razas = clase && faccion ? razasPara(personaje, faccion, clase) : []
  const { perfil } = validarPerfil({
    raza: razas[0] ?? null, clase, faccion,
    nivel: nivel === null ? 1 : Math.min(NIVEL_MAX, Math.max(1, nivel)),
    profesiones: v.eng ? [202] : [],
  }, personaje)
  return { perfil, razaSupuesta: razas.length > 0 }
}

// Resumen del perfil para pegarlo en el chat del agente (botón «Copiar perfil para el
// agente»). Nombres en español con el inglés entre paréntesis y los IDs que usa la skill
// (scripts/consultar.py acepta --raza/--clase/profesión por ID). `nombresProf` es
// {id: {es, en}} (de profesiones.json). null si faltan facción, raza o clase.
export function perfilParaAgente(perfil, personaje, nombresProf = {}) {
  if (!perfil || !perfil.faccion || perfil.raza == null || perfil.clase == null) return null
  const conId = (x, tipo, id) => {
    const es = x && (x.es || x.en), en = x && (x.en || x.es)
    return es && en && es !== en ? `${es} (${en}, ${tipo} ${id})` : `${es || '?'} (${tipo} ${id})`
  }
  const fac = personaje.facciones?.[perfil.faccion]?.n
  const raza = personaje.razas?.[String(perfil.raza)]?.n
  const clase = personaje.clases?.[String(perfil.clase)]?.n
  const profs = (ids) => (ids || []).map((id) => conId(nombresProf[String(id)], 'id', id)).join(', ')
  const partes = [
    (fac && (fac.es || fac.en)) || perfil.faccion,
    conId(raza, 'raza', perfil.raza),
    conId(clase, 'clase', perfil.clase),
    `nivel ${perfil.nivel}`,
  ]
  if ((perfil.profesiones || []).length) partes.push(`profesiones: ${profs(perfil.profesiones)}`)
  if ((perfil.secundarias || []).length) partes.push(`secundarias: ${profs(perfil.secundarias)}`)
  return `Mi personaje de WoW Forever (plugin wow-forever): ${partes.join(' · ')}`
}
