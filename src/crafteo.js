// Cálculos de crafteo para la sección Profesiones: dificultad de una receta según el
// skill, costo de los reactivos (vendedor o subasta), valor y margen de lo creado, y un
// plan de subida estimado. Módulo ES puro, sin DOM: los datos llegan por parámetro
// (data/profesiones.json, la tabla items de data/items.json, el mapa de precios del
// mercado y el skill del jugador).

// items.json: id -> [es, en, calidad, nivel_req, nivel_item, venta_cobre, clase,
// subclase, ligado, compra_cobre, vendedor]. Se acepta la tabla entera ({items:{...}})
// o directamente el mapa id -> fila.
function tablaItems(items) {
  if (!items || typeof items !== 'object') return {}
  return items.items && typeof items.items === 'object' ? items.items : items
}

function filaItem(items, itemId) {
  const t = tablaItems(items)
  const f = t[itemId] ?? t[String(itemId)]
  return Array.isArray(f) ? f : null
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// Precio de un ítem en el mercado importado: Map(itemId -> unitPriceCopper) o un
// objeto plano {itemId: precio}. null si no está.
function precioDe(precios, itemId) {
  if (!precios) return null
  const v = precios instanceof Map ? precios.get(itemId) : precios[itemId] ?? precios[String(itemId)]
  return Number.isFinite(v) && v > 0 ? v : null
}

// Dificultad de una receta para un skill, con la escala de Classic:
//   'no'          aún no se puede aprender (skill < rango.aprende)
//   'naranja'     subida segura (skill < amarillo)
//   'amarillo'    skill < verde
//   'verde'       skill < gris
//   'gris'        ya no sube skill
//   'desconocida' faltan umbrales en los datos
export function dificultad(rango, skill) {
  const s = Number(skill)
  if (!rango || typeof rango !== 'object' || !Number.isFinite(s)) return 'desconocida'
  const aprende = num(rango.aprende)
  if (aprende !== null && s < aprende) return 'no'
  const amarillo = num(rango.amarillo), verde = num(rango.verde), gris = num(rango.gris)
  if (amarillo === null || verde === null || gris === null) return 'desconocida'
  if (s < amarillo) return 'naranja'
  if (s < verde) return 'amarillo'
  if (s < gris) return 'verde'
  return 'gris'
}

// Probabilidad estimada de ganar 1 punto de skill con una receta (fórmula de Classic,
// aproximada para Forever): 1 en naranja; en amarillo/verde decae linealmente como
// (gris - skill) / (gris - amarillo), acotada a [0, 1]; 0 en gris y en 'no'.
// null cuando la dificultad es 'desconocida' (no hay umbrales con qué estimar).
export function probSubida(rango, skill) {
  const d = dificultad(rango, skill)
  if (d === 'naranja') return 1
  if (d === 'gris' || d === 'no') return 0
  if (d === 'desconocida') return null
  const amarillo = num(rango.amarillo), gris = num(rango.gris)
  if (amarillo === null || gris === null || gris <= amarillo) return null
  return Math.min(1, Math.max(0, (gris - Number(skill)) / (gris - amarillo)))
}

// Mapa itemId -> unitPriceCopper del mercado importado. Reino: el pedido (`reino`),
// si no el seleccionado en el mercado (`market.realm`), si no el primero del scan.
// Vacío si no hay mercado o el scan no tiene realms con ítems.
export function preciosDelMercado(market, reino) {
  const precios = new Map()
  const realms = market && market.snapshot && Array.isArray(market.snapshot.realms) ? market.snapshot.realms : []
  if (!realms.length) return precios
  const buscar = (nombre) => {
    if (nombre === null || nombre === undefined || nombre === '') return null
    const n = String(nombre).trim().toLowerCase()
    return realms.find((r) => r && typeof r.name === 'string' && r.name.trim().toLowerCase() === n) || null
  }
  const realm = (reino !== null && reino !== undefined && buscar(reino))
    || (market.realm !== null && market.realm !== undefined && buscar(market.realm))
    || realms[0]
  const items = realm && Array.isArray(realm.items) ? realm.items : []
  for (const it of items) {
    const id = it && it.itemId, precio = it && it.unitPriceCopper
    if (Number.isSafeInteger(id) && id > 0 && Number.isFinite(precio) && precio > 0 && !precios.has(id)) {
      precios.set(id, precio)
    }
  }
  return precios
}

// Costo unitario de conseguir un reactivo: si el ítem se compra a vendedor
// (items.json col. 10 == 1) y tiene precio de compra (col. 9 > 0) -> 'vendedor';
// si no, el precio de subasta -> 'subasta'; si no, {cobre: null, fuente: null}.
export function costoUnidad(itemId, precios, items) {
  const f = filaItem(items, itemId)
  if (f && f[10] === 1 && Number.isFinite(f[9]) && f[9] > 0) return { cobre: f[9], fuente: 'vendedor' }
  const p = precioDe(precios, itemId)
  if (p !== null) return { cobre: p, fuente: 'subasta' }
  return { cobre: null, fuente: null }
}

// Costo de una receta: una entrada por reactivo {item, cant, cobre, fuente} donde
// `cobre` es el precio unitario. `total` es la suma por las cantidades y es null si
// falta el precio de algún reactivo; `faltan` lista esos ítems.
export function costoReceta(receta, precios, items) {
  const partes = (receta && Array.isArray(receta.reactivos) ? receta.reactivos : []).map((par) => {
    const item = Array.isArray(par) ? par[0] : par
    const cant = Array.isArray(par) && Number.isFinite(par[1]) && par[1] > 0 ? par[1] : 1
    const u = costoUnidad(item, precios, items)
    return { item, cant, cobre: u.cobre, fuente: u.fuente }
  })
  const faltan = partes.filter((p) => p.cobre === null).map((p) => p.item)
  const total = faltan.length ? null : partes.reduce((a, p) => a + p.cobre * p.cant, 0)
  return { total, partes, faltan }
}

// Valor de lo que crea la receta: precio de subasta del ítem creado (por unidad,
// por la cantidad) o, sin subasta, su precio de venta al vendedor (col. 5) como
// respaldo. null en encantamientos (crea: null) y cuando no hay referencia de valor.
export function valorCreado(receta, precios, items) {
  if (!receta || receta.crea == null) return null
  const par = receta.crea
  const itemId = Array.isArray(par) ? par[0] : par
  const cant = Array.isArray(par) && Number.isFinite(par[1]) && par[1] > 0 ? par[1] : 1
  const sub = precioDe(precios, itemId)
  if (sub !== null) return sub * cant
  const f = filaItem(items, itemId)
  if (f && Number.isFinite(f[5])) return f[5] * cant
  return null
}

// Margen estimado por crafteo: valor creado menos costo de reactivos. null si falta
// el valor o el costo.
export function margen(receta, precios, items) {
  const v = valorCreado(receta, precios, items)
  const c = costoReceta(receta, precios, items).total
  return v === null || c === null ? null : v - c
}

const MAX_PUNTOS = 1000   // cota defensiva: el skill no pasa de ~365 en los datos

// Compara dos candidatas en un punto de skill. Con precios: menor costo esperado por
// punto (costo / probSubida); las de costo desconocido quedan últimas. Sin precios:
// primero la naranja, luego menos reactivos y mayor probabilidad de subida.
function compararCandidatas(a, b, conPrecio) {
  if (conPrecio) {
    const sa = a.costo.total === null ? Infinity : a.costo.total / a.p
    const sb = b.costo.total === null ? Infinity : b.costo.total / b.p
    if (sa !== sb) return sa - sb
  } else {
    const na = a.d === 'naranja' ? 0 : 1, nb = b.d === 'naranja' ? 0 : 1
    if (na !== nb) return na - nb
  }
  if (a.nReact !== b.nReact) return a.nReact - b.nReact
  if (!conPrecio && a.p !== b.p) return b.p - a.p
  return a.r.spell - b.r.spell
}

// Plan de subida estimado de `desde` a `hasta` (skill, enteros). En cada punto elige,
// entre las recetas aprendibles ahí en naranja o amarillo, la de menor costo esperado
// por punto; sin precios prefiere naranja y menos reactivos. Devuelve pasos contiguos
// {desde, hasta, spell, crafteos, costo}; `spell` null marca un tramo sin receta
// candidata (no se inventa una). `crafteos` es el número esperado de crafts por tramo
// y `costo` el costo esperado total (null si falta el precio de algún reactivo).
// Acotado: cada punto de skill se evalúa una vez y nunca hay bucles por craft.
export function planDeSubida(recetas, desde, hasta, precios, items) {
  if (!Array.isArray(recetas)) return []
  const d0 = Math.floor(Number(desde)), h = Math.ceil(Number(hasta))
  if (!Number.isFinite(d0) || !Number.isFinite(h) || h <= d0) return []
  const conPrecio = precios instanceof Map ? precios.size > 0
    : !!precios && typeof precios === 'object' && Object.keys(precios).length > 0
  const infos = recetas
    .filter((r) => r && typeof r === 'object' && Number.isFinite(r.spell))
    .map((r) => ({ r, costo: costoReceta(r, precios, items),
      nReact: Array.isArray(r.reactivos) ? r.reactivos.length : 0 }))
  const elegir = (s) => {
    let mejor = null
    for (const info of infos) {
      const d = dificultad(info.r.rango, s)
      if (d !== 'naranja' && d !== 'amarillo') continue
      const p = probSubida(info.r.rango, s)
      if (!(p > 0)) continue
      const candidata = { ...info, d, p }
      if (!mejor || compararCandidatas(candidata, mejor, conPrecio) < 0) mejor = candidata
    }
    return mejor
  }
  const pasos = []
  const fin = Math.min(h, d0 + MAX_PUNTOS)
  for (let s = d0; s < fin;) {
    const primero = elegir(s)
    const spell = primero ? primero.r.spell : null
    const total = primero ? primero.costo.total : null
    let j = s + 1, crafteos = primero ? 1 / primero.p : 0
    while (j < fin) {
      const e = elegir(j)
      const sp = e ? e.r.spell : null
      if (sp !== spell) break
      if (e) crafteos += 1 / e.p
      j++
    }
    pasos.push({
      desde: s, hasta: j, spell,
      crafteos: Math.round(crafteos),
      costo: total === null ? null : Math.round(total * crafteos),
    })
    s = j
  }
  return pasos
}
