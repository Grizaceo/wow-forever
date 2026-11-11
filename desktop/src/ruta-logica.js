// Lógica pura de la Ruta de niveles y los Dungeons (sin DOM, sin imports): las
// funciones reciben los datos de data/*.json ya cargados para probarse con
// node:test sobre los JSON reales. Nada se inventa: lo que falta queda en null
// y la vista lo dice con <Hueco>.

// ---------------------------------------------------------------- facción y misiones

// 'alianza' -> 'a', 'horda' -> 'h' (los códigos que usa misiones.json).
export function faccionCodigo(faccion) {
  return faccion === 'alianza' ? 'a' : faccion === 'horda' ? 'h' : null
}

// ¿La misión es de la facción? 'ah' = ambos bandos.
export function misionDeFaccion(m, faccion) {
  const c = faccionCodigo(faccion)
  return !!c && !!m && (m.faccion === 'ah' || m.faccion === c)
}

// Restricciones de la misión: `clases` (IDs de clase) y `prof` (SkillLine de
// profesión, principal o secundaria). Sin restricción = disponible para todos.
export function misionParaPersonaje(m, perfil) {
  if (Array.isArray(m.clases) && m.clases.length && !m.clases.includes(perfil.clase)) return false
  if (m.prof != null) {
    const ps = [...(perfil.profesiones || []), ...(perfil.secundarias || [])]
    if (!ps.includes(m.prof)) return false
  }
  return true
}

// Misiones que el personaje puede tomar: facción + `min` <= nivel (+clase/prof),
// ordenadas por nivel de misión.
export function misionesDisponibles(misiones, perfil) {
  const out = []
  for (const [id, m] of Object.entries(misiones || {})) {
    if (!m || typeof m !== 'object') continue
    if (!misionDeFaccion(m, perfil.faccion)) continue
    if (!((typeof m.min === 'number' ? m.min : 1) <= perfil.nivel)) continue
    if (!misionParaPersonaje(m, perfil)) continue
    out.push([Number(id), m])
  }
  return out.sort((a, b) => a[1].nivel - b[1].nivel || a[0] - b[0])
}

// Banda actual de la ruta: niveles [nivel-2, nivel+5].
export function bandaActual(nivel) {
  return { min: nivel - 2, max: nivel + 5 }
}

// IDs de mapa que existen en dungeons.json (para distinguir misiones de dungeon
// reales de eventos/battlegrounds que usan el campo `dungeon` con otros mapas).
export function mapasDeDungeons(dungeons) {
  const s = new Set()
  for (const k of Object.keys(dungeons?.clasicos || {})) s.add(Number(k))
  for (const k of Object.keys(dungeons?.forever || {})) s.add(Number(k))
  return s
}

// Misiones disponibles dentro de la banda actual, agrupadas por zona o dungeon.
// Devuelve [{tipo:'zona'|'dungeon'|'otra', id, items:[[questId, m]]}] ordenados
// por el nivel más bajo de sus misiones. `dungeons` (dungeons.json) decide si un
// `dungeon` de la misión es un mapa conocido; si no, cae en 'otra'.
export function misionesDeBanda(misiones, perfil, dungeons) {
  const b = bandaActual(perfil.nivel)
  const mapas = mapasDeDungeons(dungeons)
  const grupos = new Map()
  for (const par of misionesDisponibles(misiones, perfil)) {
    const [id, m] = par
    if (typeof m.nivel !== 'number' || m.nivel < b.min || m.nivel > b.max) continue
    let g
    if (m.dungeon != null && mapas.has(Number(m.dungeon))) g = { tipo: 'dungeon', id: Number(m.dungeon) }
    else if (m.zona != null) g = { tipo: 'zona', id: Number(m.zona) }
    else g = { tipo: 'otra', id: null }
    const k = g.tipo + ':' + (g.id ?? '')
    if (!grupos.has(k)) grupos.set(k, { ...g, items: [] })
    grupos.get(k).items.push(par)
  }
  const lista = [...grupos.values()]
  const ORDEN_TIPO = { zona: 0, dungeon: 1, otra: 2 }
  for (const g of lista) {
    g.items.sort((a, b2) => a[1].nivel - b2[1].nivel || a[0] - b2[0])
    g.nivelMin = g.items[0][1].nivel
  }
  lista.sort((a, b2) => a.nivelMin - b2.nivelMin || ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b2.tipo] || (a.id ?? 0) - (b2.id ?? 0))
  return lista
}

// Misiones de un dungeon concreto para el personaje (facción + clase/prof;
// se muestran todas, la vista atenúa las que aún no puede tomar).
export function misionesDeDungeon(misiones, perfil, mapa) {
  const out = []
  for (const [id, m] of Object.entries(misiones || {})) {
    if (!m || Number(m.dungeon) !== Number(mapa)) continue
    if (!misionDeFaccion(m, perfil.faccion)) continue
    if (!misionParaPersonaje(m, perfil)) continue
    out.push([Number(id), m])
  }
  return out.sort((a, b) => a[1].nivel - b[1].nivel || a[0] - b[0])
}

// ---------------------------------------------------------------- zonas

// Zonas cuyo rango de niveles contiene `nivel`, de tu facción o disputadas,
// ordenadas por nivel mínimo. Cada una lleva `misiones`: cuántas misiones tiene
// tu facción en ella según misiones_por_zona (null si no hay recuento).
export function zonasDeNivel(zonas, faccion, nivel) {
  const out = []
  for (const [id, z] of Object.entries(zonas?.zonas || {})) {
    const nv = z.niveles
    if (!nv || typeof nv.min !== 'number' || typeof nv.max !== 'number') continue
    if (!(nv.min <= nivel && nivel <= nv.max)) continue
    if (z.faccion !== faccion && z.faccion !== 'disputada') continue
    const mpz = zonas.misiones_por_zona?.[id]?.[faccion]
    out.push({
      id: Number(id), n: z.n, niveles: nv, faccion: z.faccion,
      continente: z.continente ?? null,
      misiones: mpz && typeof mpz.n === 'number' ? mpz.n : null,
    })
  }
  return out.sort((a, b) => a.niveles.min - b.niveles.min || a.niveles.max - b.niveles.max || a.id - b.id)
}

// Zonas nuevas de Forever (sin `niveles`), salvo las ciudades: cada una tiene un
// hueco declarado en zonas.json. Nombres únicos para el aviso.
export function zonasSinNiveles(zonas) {
  const vistas = new Set()
  const out = []
  for (const [id, z] of Object.entries(zonas?.zonas || {})) {
    if (z.niveles != null || z.faccion === 'ciudad') continue
    const clave = (z.n && (z.n.es || z.n.en)) || String(id)
    if (vistas.has(clave)) continue
    vistas.add(clave)
    out.push({ id: Number(id), n: z.n, faccion: z.faccion, continente: z.continente ?? null })
  }
  out.sort((a, b) => String(a.n?.es || a.n?.en || '').localeCompare(String(b.n?.es || b.n?.en || ''), 'es'))
  return out
}

// Zona de inicio de la raza ({mapa, zona}) o null (Skyborne no la tiene).
export function inicioDeRaza(personaje, raza) {
  const r = personaje?.razas?.[String(raza)]
  return r && r.inicio && r.inicio.zona != null ? r.inicio : null
}

// ---------------------------------------------------------------- dungeons

// Lista normalizada de dungeons (clásicos + Forever), jefes ordenados por `orden`.
// `botin` es [[itemId, prob]] en clásicos y null en Forever (dato del servidor).
export function listaDungeons(dungeons) {
  const salida = []
  const jefes = (lista) => (lista || [])
    .slice()
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map((j) => ({ encuentro: j.encuentro, orden: j.orden, npc: j.npc ?? null, n: j.n, botin: j.botin ?? null }))
  for (const [id, d] of Object.entries(dungeons?.clasicos || {})) {
    salida.push({
      mapa: Number(id), tipo: 'clasico', n: d.n, f: d.f,
      niveles: d.niveles ?? null, jugadores: typeof d.jugadores === 'number' && d.jugadores > 0 ? d.jugadores : null,
      raid: d.raid === true, jefes: jefes(d.jefes),
    })
  }
  for (const [id, d] of Object.entries(dungeons?.forever || {})) {
    salida.push({
      mapa: Number(id), tipo: 'forever', n: d.n, f: d.f,
      niveles: d.niveles ?? null, jugadores: null,
      raid: false, jefes: jefes(d.jefes),
    })
  }
  return salida
}

// "En mi rango": nivel dentro de [min-5, max+5] del rango del dungeon.
export function dungeonEnRango(d, nivel) {
  const nv = d.niveles
  return !!nv && typeof nv.min === 'number' && nivel >= nv.min - 5 && nivel <= nv.max + 5
}

// Dungeons visibles según el filtro: 'rango' (±5 del nivel), 'todos', 'raids'.
// Orden: por nivel mínimo (los que no tienen nivel, al final).
export function dungeonsVisibles(lista, filtro, nivel) {
  const ok = (d) => filtro === 'raids' ? d.raid === true
    : filtro === 'todos' ? true
    : dungeonEnRango(d, nivel)
  return lista
    .filter(ok)
    .sort((a, b) => (a.niveles?.min ?? 999) - (b.niveles?.min ?? 999)
      || (a.niveles?.max ?? 999) - (b.niveles?.max ?? 999)
      || a.mapa - b.mapa)
}

// ---------------------------------------------------------------- ítem -> competencia
// items.json: id -> [es, en, calidad, nivel_req, nivel_item, venta, clase, subclase, ...]
// Solo hacen falta calidad (2), clase de objeto (6) y subclase (7).

export function infoItem(items, id) {
  const f = items && items[String(id)]
  if (!f) return null
  return { id: Number(id), calidad: f[2], clase: f[6], subclase: f[7] }
}

// Armas (clase 2) subclase -> SkillLine; armaduras (clase 4) subclase -> SkillLine.
export const ARMA_A_SKILLLINE = {
  0: 44, 1: 172, 2: 45, 3: 46, 4: 54, 5: 160, 6: 229, 7: 43, 8: 55,
  10: 136, 13: 473, 15: 173, 16: 176, 18: 226, 19: 228,
}
export const ARMADURA_A_SKILLLINE = { 1: 415, 2: 414, 3: 413, 4: 293, 6: 433 }
export const JOYERIA = 'joyeria' // clase 4 subclase 0: anillos, collares, abalorios — los usa todo el mundo

// SkillLine que exige el ítem para equiparlo, o null si no es arma/armadura
// con mapeo conocido.
export function skilllineDeItem(info) {
  if (!info) return null
  if (info.clase === 2) return ARMA_A_SKILLLINE[info.subclase] ?? null
  if (info.clase === 4) return info.subclase === 0 ? JOYERIA : (ARMADURA_A_SKILLLINE[info.subclase] ?? null)
  return null
}

// "Útil para mi clase": calidad >= 2 (uncommon o mejor) y la clase puede usarlo
// según sus competencias (ids de SkillLine de clases.json). La joyería la usa
// todo el mundo. `competencias` es un iterable de ids.
export function esUtilParaClase(info, competencias) {
  if (!info || typeof info.calidad !== 'number' || info.calidad < 2) return false
  const sl = skilllineDeItem(info)
  if (sl == null) return false
  if (sl === JOYERIA) return true
  return (competencias instanceof Set ? competencias : new Set(competencias || [])).has(sl)
}

// Botín de un jefe filtrado a lo útil para la clase: [[itemId, prob], ...]
export function botinUtil(items, botin, competencias) {
  return (botin || []).filter(([id]) => esUtilParaClase(infoItem(items, id), competencias))
}

// ---------------------------------------------------------------- curado por nombre

// Minúsculas, sin acentos, solo [a-z0-9] como palabras.
export function normalizarNombre(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
const tokensDe = (s) => normalizarNombre(s).split(' ').filter(Boolean)
const contieneTramo = (agujas, pajar) => {
  if (!agujas.length || agujas.length > pajar.length) return false
  for (let i = 0; i + agujas.length <= pajar.length; i++) {
    if (agujas.every((t, j) => pajar[i + j] === t)) return true
  }
  return false
}
const brutosDe = (n) => (n && typeof n === 'object' ? [n.en, n.es] : [n])

// ¿El nombre curado ("Scarlet Monastery — Armory", "Sunken Temple (Atal'Hakkar)",
// "Lower/Upper Blackrock Spire") corresponde al dungeon generado? Coincide si los
// tokens de uno contienen como tramo a los del otro.
export function nombreDungeonCoincide(nombreCurado, nombreGenerado) {
  const c = tokensDe(nombreCurado)
  if (!c.length) return false
  return brutosDe(nombreGenerado).some((bruto) => {
    const g = tokensDe(bruto)
    return !!g.length && (contieneTramo(c, g) || contieneTramo(g, c))
  })
}

// Cruce guía curada -> dungeons generados: Map<mapaId, [{d, indice}]> donde
// `indice` es la posición en la lista `guiaDungeons` (la clave `d<indice>|…` del
// botín conseguido, igual que en standalone/index.html).
export function curadosPorDungeon(guiaDungeons, clasicos, forever) {
  const mapa = new Map()
  const generados = [
    ...Object.entries(clasicos || {}).map(([id, d]) => ({ mapa: Number(id), n: d.n })),
    ...Object.entries(forever || {}).map(([id, d]) => ({ mapa: Number(id), n: d.n })),
  ]
  ;(guiaDungeons || []).forEach((d, indice) => {
    for (const g of generados) {
      if (nombreDungeonCoincide(d && d.n, g.n)) {
        if (!mapa.has(g.mapa)) mapa.set(g.mapa, [])
        mapa.get(g.mapa).push({ d, indice })
        break
      }
    }
  })
  return mapa
}

// ---------------------------------------------------------------- build persistido
// estado.build es el JSON del estado de la guía anterior (standalone). Las
// claves que usan estas vistas son las mismas que index.html: `realm`
// ('kalimdor'|'ek'), `steps` (['<lvl>|<indice hito>']) y `gear` (['d<i>|<nombre>']).

export function leerBuild(texto) {
  try {
    const v = texto ? JSON.parse(texto) : null
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

export function listaBuild(build, clave) {
  const v = build && build[clave]
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
}

// Lee el build más reciente del almacén (ya serializado por createStore).
export async function buildActual(almacen) {
  const e = await almacen.read()
  return leerBuild(e && e.build)
}

// Fusiona `cambios` sobre el build más reciente y lo guarda. Relee antes de
// escribir para no pisar claves de otras secciones.
export async function buildCambios(almacen, cambios) {
  const viejo = await buildActual(almacen)
  await almacen.build(JSON.stringify({ ...viejo, ...cambios }))
}

// Alternar un id dentro de una lista de strings persistida (steps, gear).
export function alternarEnLista(lista, id, puesto) {
  const s = new Set(lista)
  if (puesto) s.add(id)
  else s.delete(id)
  return [...s]
}
