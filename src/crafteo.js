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

// Dificultad de una receta concreta. Como dificultad(), pero las automáticas se aprenden al
// tomar la profesión (aprende 0) y, sin requisito conocido (casi todas las recetas nuevas de
// Forever: es dato del servidor), no se sabe si ya se puede aprender: 'desconocida', salvo
// que el skill ya la deje en gris.
export function dificultadReceta(receta, skill) {
  const rango = receta && typeof receta === 'object' ? receta.rango : null
  if (!rango || typeof rango !== 'object' || num(rango.aprende) !== null) return dificultad(rango, skill)
  if (receta.como === 'automatica') return dificultad({ ...rango, aprende: 0 }, skill)
  const d = dificultad(rango, skill)
  return d === 'gris' ? 'gris' : 'desconocida'
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

// Coste de CONSEGUIR la receta (no los reactivos). 0 si se aprende gratis (entrenador o
// automática al tomar la profesión); el precio de compra del objeto receta si lo vende un
// vendedor de la facción; si no, el precio de subasta del objeto receta; null si no se sabe
// cómo se consigue (drop sin precio, desconocido). El coste de ENTRENAR los tramos con el
// trainer no está en los datos: se declara aparte, no se inventa.
export function costoAdquisicion(receta, precios, items, faccion) {
  if (!receta || typeof receta !== 'object') return { cobre: null, fuente: null, item: null }
  const como = receta.como
  if (como === 'entrenador' || como === 'automatica') return { cobre: 0, fuente: 'gratis', item: null }
  if (como !== 'receta' || receta.receta_item == null) return { cobre: null, fuente: null, item: receta.receta_item ?? null }
  const iid = receta.receta_item
  const f = filaItem(items, iid)
  const vend = receta.vendedores && typeof receta.vendedores === 'object' ? receta.vendedores : {}
  const facs = faccion ? [faccion] : ['alianza', 'horda']
  const loVende = facs.some((fa) => Array.isArray(vend[fa]) && vend[fa].length > 0)
  if (loVende && f && f[10] === 1 && Number.isFinite(f[9]) && f[9] > 0) {
    return { cobre: f[9], fuente: 'vendedor', item: iid }
  }
  const p = precioDe(precios, iid)
  if (p !== null) return { cobre: p, fuente: 'subasta', item: iid }
  return { cobre: null, fuente: null, item: iid }
}

// Puntos de skill que se espera que una receta aporte desde `s` hasta `e` (suma de
// probSubida en cada punto). Prefijo acumulativo para no recalcular en cada candidato.
function puntosEsperadosAcum(rango, fin) {
  const cum = new Array(fin + 1)
  cum[0] = 0
  for (let k = 0; k < fin; k++) {
    const p = probSubida(rango, k)
    cum[k + 1] = cum[k] + (p > 0 ? p : 0)
  }
  return cum
}

// Ruta de maxeo con precios: de `desde` a `cap` (tope de la profesión; 300 en Classic).
// A diferencia de planDeSubida, SÍ incluye el coste de adquirir las recetas de objeto
// (vendedor o subasta), amortizado sobre los puntos que se espera que aporten, y cobra
// esa adquisición una sola vez. En cada punto elige la receta con menor coste esperado
// por punto (materiales / prob + adquisición amortizada). Incluye verdes (prob > 0) para
// poder llegar al tope. Las recetas sin coste de adquisición conocido quedan fuera de la
// ruta con precio y se listan aparte; las que tienen adquisición pero falta el precio de
// algún reactivo se listan como «sin precio». El entrenamiento de tramos no tiene coste en
// los datos: se declara. Devuelve pasos contiguos y totales; null donde no hay dato.
export function rutaMaxeo(recetas, desde, cap, precios, items, opts = {}) {
  const faccion = opts && opts.faccion ? opts.faccion : null
  const d0 = Math.floor(Number(desde)), h = Math.ceil(Number(cap))
  const avisoEntrenamiento = 'El coste de entrenar los tramos con el trainer no está en los datos (SIN DATOS): no se incluye en el total.'
  const base = {
    desde: d0, cap: h, pasos: [], totalMateriales: null, totalAdquisicion: 0, total: null,
    cobertura: 0, huecos: [], adquisiciones: [], adquisicionesSinDato: [], sinPrecio: [],
    avisoEntrenamiento,
  }
  if (!Array.isArray(recetas) || !Number.isFinite(d0) || !Number.isFinite(h) || h <= d0) return base
  const fin = Math.min(h, d0 + MAX_PUNTOS)
  const infos = recetas
    .filter((r) => r && typeof r === 'object' && Number.isFinite(r.spell))
    .map((r) => ({
      r, acq: costoAdquisicion(r, precios, items, faccion),
      costo: costoReceta(r, precios, items),
      nReact: Array.isArray(r.reactivos) ? r.reactivos.length : 0,
      cum: puntosEsperadosAcum(r.rango, fin),
    }))
  const conAcq = infos.filter((i) => i.acq.cobre !== null)
  base.adquisicionesSinDato = infos.filter((i) => i.acq.cobre === null)
    .map((i) => ({ spell: i.r.spell, item: i.acq.item, como: i.r.como }))
  const pagadas = new Set()
  const sinPrecioMap = new Map()
  let totalMat = 0, totalAdq = 0, puntosCubiertos = 0
  const pasos = [], huecos = []
  const elegir = (s) => {
    let mejor = null
    for (const info of conAcq) {
      const p = probSubida(info.r.rango, s)
      if (!(p > 0)) continue
      if (info.costo.total === null) {
        if (!sinPrecioMap.has(info.r.spell)) sinPrecioMap.set(info.r.spell, { spell: info.r.spell, faltan: info.costo.faltan })
        continue
      }
      const pe = info.cum[fin] - info.cum[s]
      const acqPorPunto = (!pagadas.has(info.r.spell) && info.acq.cobre > 0 && pe > 0) ? info.acq.cobre / pe : 0
      const eff = info.costo.total / p + acqPorPunto
      if (!mejor || eff < mejor.eff || (eff === mejor.eff && (info.nReact < mejor.nReact
        || (info.nReact === mejor.nReact && info.r.spell < mejor.spell)))) {
        mejor = { info, p, eff, nReact: info.nReact, spell: info.r.spell }
      }
    }
    return mejor
  }
  for (let s = d0; s < fin;) {
    const e = elegir(s)
    if (!e) {
      // hueco: ningún candidato con precio en s. Buscar el siguiente punto con candidato.
      let j = s + 1
      while (j < fin && !elegir(j)) j++
      huecos.push({ desde: s, hasta: j, motivo: sinPrecioMap.size ? 'recetas sin precio de reactivos o sin receta conocida' : 'ninguna receta conocida sube en este tramo' })
      s = j
      continue
    }
    const info = e.info, spell = info.r.spell
    if (!pagadas.has(spell) && info.acq.cobre > 0) {
      pagadas.add(spell)
      totalAdq += info.acq.cobre
      base.adquisiciones.push({ spell, item: info.acq.item, cobre: info.acq.cobre, fuente: info.acq.fuente, desde: s })
    }
    let j = s + 1, crafteos = 1 / e.p, mat = info.costo.total * crafteos
    while (j < fin) {
      const e2 = elegir(j)
      if (!e2 || e2.info.r.spell !== spell) break
      crafteos += 1 / e2.p
      mat += info.costo.total / e2.p
      j++
    }
    totalMat += mat
    puntosCubiertos += j - s
    pasos.push({ desde: s, hasta: j, spell, crafteos: Math.round(crafteos), costo: Math.round(mat) })
    s = j
  }
  base.pasos = pasos
  base.huecos = huecos
  base.sinPrecio = [...sinPrecioMap.values()]
  base.totalAdquisicion = Math.round(totalAdq)
  // Sin pasos no hay ruta: el total es null (sin estimación), no 0.
  base.totalMateriales = pasos.length ? Math.round(totalMat) : null
  base.total = pasos.length ? Math.round(totalMat + totalAdq) : null
  base.cobertura = fin > d0 ? puntosCubiertos / (fin - d0) : 0
  return base
}
// ── ROI con histórico de precios ─────────────────────────────────────────────
// El histórico guarda, por ítem y día, el MÍNIMO observado (low) y la cantidad
// disponible (avail = oferta, NO ventas). La media móvil es la media de esos mínimos
// diarios: no es un precio de mercado garantizado ni liquidez probada. El retorno en
// subasta es una estimación; el retorno al vendedor es el suelo garantizado.

// Normaliza la serie de un ítem a [{day, low, avail}] ordenada por día ascendente.
// Acepta triples v1 [day, low, avail] y objetos del snapshot {day, low, available}.
// Descarta observaciones sin día entero o sin mínimo positivo.
export function serieHistorico(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const e of raw) {
    let day, low, avail
    if (Array.isArray(e)) { day = e[0]; low = e[1]; avail = e[2] }
    else if (e && typeof e === 'object') { day = e.day; low = e.low; avail = e.available ?? e.avail }
    else continue
    if (!Number.isInteger(day) || !Number.isFinite(low) || low <= 0) continue
    out.push({ day, low, avail: Number.isFinite(avail) ? avail : null })
  }
  out.sort((a, b) => a.day - b.day)
  return out
}

// Media móvil de los mínimos diarios: media de los últimos `ventana` días (ventana
// null/0/undefined = todos). {media (cobre redondeado), n, desde, hasta} o null si vacío.
export function mediaMovil(series, ventana) {
  const s = Array.isArray(series) ? series : []
  if (!s.length) return null
  const w = Number.isInteger(ventana) && ventana > 0 ? ventana : s.length
  const ult = s.slice(-w)
  const suma = ult.reduce((a, e) => a + e.low, 0)
  return { media: Math.round(suma / ult.length), n: ult.length, desde: ult[0].day, hasta: ult[ult.length - 1].day }
}

// Tendencia del mínimo diario: cambio % del último respecto al primero observado.
// {direccion:'sube'|'baja'|'plana', deltaPct} o null con <2 puntos. Plana si |Δ|<2%.
export function tendencia(series) {
  const s = Array.isArray(series) ? series : []
  if (s.length < 2) return null
  const first = s[0].low, last = s[s.length - 1].low
  if (!(first > 0)) return null
  const deltaPct = ((last - first) / first) * 100
  const direccion = deltaPct > 2 ? 'sube' : deltaPct < -2 ? 'baja' : 'plana'
  return { direccion, deltaPct: Math.round(deltaPct * 10) / 10 }
}

// Mapa de precios por media móvil histórica + metadatos por ítem. historyItems:
// {id: serieCruda}; ventana: días (null = todos). Devuelve {precios: Map(id->media),
// meta: {id: {media,n,desde,hasta,direccion,deltaPct}}}.
export function preciosHistoricos(historyItems, ventana) {
  const precios = new Map(), meta = {}
  if (!historyItems || typeof historyItems !== 'object') return { precios, meta }
  for (const key of Object.keys(historyItems)) {
    const id = Number(key)
    if (!Number.isInteger(id) || id <= 0) continue
    const s = serieHistorico(historyItems[key])
    const mm = mediaMovil(s, ventana)
    if (!mm) continue
    precios.set(id, mm.media)
    const t = tendencia(s)
    meta[id] = { media: mm.media, n: mm.n, desde: mm.desde, hasta: mm.hasta,
      direccion: t ? t.direccion : null, deltaPct: t ? t.deltaPct : null }
  }
  return { precios, meta }
}

// ROI de la ruta de maxeo: coste total (rutaMaxeo) frente al valor recuperable de los
// crafts producidos al subir. Dos retornos honestos y separados:
//  - retornoVendedor: SUELO garantizado (venta al vendedor col.5 × crafteos × yield).
//  - retornoEstimado: mejor valor realizable por craft (AH si hay precio medio, si no
//    vendedor; el mayor de ambos). La liquidez en AH NO está garantizada (avail es
//    oferta, no ventas): es estimación. `precios` puede ser la media móvil histórica.
// `opts.meta` (opcional) aporta tendencia por ítem para un resumen sobre los reactivos.
// null donde no hay dato. Los crafts sin valor (crea null, p.ej. encantamientos) se
// declaran SIN DATOS y quedan fuera del retorno.
export function roiRuta(recetas, desde, cap, precios, items, opts = {}) {
  const ruta = rutaMaxeo(recetas, desde, cap, precios, items, opts)
  const porSpell = new Map()
  for (const r of (Array.isArray(recetas) ? recetas : [])) if (r && Number.isFinite(r.spell)) porSpell.set(r.spell, r)
  const meta = opts && opts.meta ? opts.meta : null
  let retVend = 0, retEst = 0, conValor = 0, sinValor = 0
  const reactivos = new Set()
  for (const paso of ruta.pasos) {
    const r = porSpell.get(paso.spell)
    for (const par of (r && Array.isArray(r.reactivos) ? r.reactivos : [])) reactivos.add(Array.isArray(par) ? par[0] : par)
    if (!r || r.crea == null) { sinValor++; continue }
    const par = r.crea
    const cid = Array.isArray(par) ? par[0] : par
    const cant = Array.isArray(par) && Number.isFinite(par[1]) && par[1] > 0 ? par[1] : 1
    const f = filaItem(items, cid)
    const vend = f && Number.isFinite(f[5]) ? f[5] * cant : null
    const sub = precioDe(precios, cid)
    const ah = sub !== null ? sub * cant : null
    if (vend === null && ah === null) { sinValor++; continue }
    conValor++
    if (vend !== null) retVend += paso.crafteos * vend
    const unitEst = ah !== null ? (vend !== null ? Math.max(ah, vend) : ah) : vend
    retEst += paso.crafteos * unitEst
  }
  const coste = ruta.total
  const roi = (ret) => (coste !== null && coste > 0 ? ret / coste : null)
  let tendenciaResumen = null
  if (meta) {
    let suben = 0, bajan = 0, planas = 0, sinHist = 0
    for (const id of reactivos) {
      const m = meta[id] ?? meta[String(id)]
      if (!m || !m.direccion) { sinHist++; continue }
      if (m.direccion === 'sube') suben++; else if (m.direccion === 'baja') bajan++; else planas++
    }
    tendenciaResumen = { suben, bajan, planas, sinHist }
  }
  return {
    desde: ruta.desde, cap: ruta.cap, cobertura: ruta.cobertura,
    coste, totalMateriales: ruta.totalMateriales, totalAdquisicion: ruta.totalAdquisicion,
    retornoVendedor: Math.round(retVend), retornoEstimado: Math.round(retEst),
    roiVendedor: roi(retVend), roiEstimado: roi(retEst),
    netoVendedor: coste !== null ? Math.round(retVend - coste) : null,
    netoEstimado: coste !== null ? Math.round(retEst - coste) : null,
    pasosConValor: conValor, pasosSinValor: sinValor,
    tendenciaResumen, huecos: ruta.huecos.length,
    aviso: 'Retorno vendedor = suelo garantizado. Retorno estimado = subasta si hay precio medio, si no vendedor (el mayor); la liquidez en subasta NO está garantizada (la cantidad disponible es oferta, no ventas). Media de mínimos diarios observados. Entrenamiento de tramos: SIN DATOS.',
  }
}
