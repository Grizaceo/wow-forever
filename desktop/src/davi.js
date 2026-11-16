// «Preguntar a DAVI»: constructores puros del contexto que se adjunta a la pregunta.
// Módulo ES puro, sin DOM ni SDK: los datos llegan por parámetro y solo se copian los
// campos de una lista explícita (allowlist), con acotes de reactivos y nombres. Nunca
// se serializa el ítem entero ni su historial.
import { fechaDe, nombreItem } from './mercado-logica.js'
import { costoReceta, valorCreado, margen } from '../../src/crafteo.js'

// Acotes defensivos: una receta no debería pasar de esto, y un nombre se corta.
export const LIMITE_REACTIVOS = 30
export const LIMITE_NOMBRE = 120
const LIMITE_HISTORIAL = 200

// Únicos campos del ítem de mercado que se leen. `history` y cualquier otro campo
// (vendedores, fuente, etc.) quedan fuera a propósito.
const CAMPOS_ITEM = ['sourceKey', 'itemId', 'unitPriceCopper', 'observedDay']

const texto = (s, max = LIMITE_NOMBRE) => {
  const t = typeof s === 'string' ? s : s == null ? '' : String(s)
  const una = t.replace(/\s+/g, ' ').trim()
  return una.length > max ? una.slice(0, max - 1) + '…' : una
}

// Para resúmenes generados por el plugin (el perfil), sin recorte: acotar el nivel o la
// clase perdería justo lo que DAVI necesita.
const linea = (s) => (typeof s === 'string' ? s : s == null ? '' : String(s)).replace(/\s+/g, ' ').trim()

// Formato del resto del plugin (datos.js): 123456 -> '12o 34p 56c'.
const cobreTexto = (c) => {
  const n = Math.round(c)
  const signo = n < 0 ? '-' : ''
  const a = Math.abs(n)
  const o = Math.floor(a / 10000), p = Math.floor((a % 10000) / 100), b = a % 100
  return signo + [o ? o + 'o' : '', p ? p + 'p' : '', b || (!o && !p) ? b + 'c' : ''].filter(Boolean).join(' ')
}

// Nombre bilingüe de los datos ({es, en}), sin depender de datos.js.
const txt = (n, lang) => {
  if (!n || typeof n !== 'object') return ''
  return texto(lang === 'en' ? n.en || n.es : n.es || n.en)
}

// Textos fijos del contexto, en los dos idiomas de la interfaz. Los datos bilingües
// ({es, en}) se resuelven con `txt` arriba.
const ETIQUETAS = {
  es: {
    titulo: 'Pregunta a DAVI',
    seccion: 'Sección',
    pregunta: 'Pregunta',
    contexto: 'Contexto seleccionado',
    limites: 'Límites',
    procedencia: 'Procedencia',
    personaje: 'Personaje',
    profesiones: 'Profesiones',
    mercado: 'Mercado',
    perfil: 'Perfil',
    precios: 'Precios y ofertas',
    sinNombre: 'sin nombre',
    sinId: 'sin ID',
    sinClave: 'sin clave',
    sinFecha: 'sin fecha',
    sinReino: 'sin reino',
    sinDato: 'sin dato',
    desconocido: 'desconocido',
    perfilIncompleto: 'Perfil incompleto: faltan facción, raza o clase.',
    limitePerfil: 'Perfil cargado a mano; no es el estado del juego en vivo.',
    limiteSinHistorial: 'No se incluye el historial completo de Auctionator.lua.',
    limiteSinHistorialNiArchivo: 'No se incluye el historial completo ni el contenido de Auctionator.lua.',
    limiteOfertas: 'Precios = ofertas anunciadas, no ventas.',
    limiteReferencia: 'La referencia de botín/farmeo es Classic 1.12 (CMaNGOS), no verificada en Forever.',
    acotadoReceta: 'Receta y reactivos acotados a la receta elegida; no se incluye la lista completa de recetas.',
    costosOfertas: 'Costos y márgenes con precios anunciados, no ventas.',
    receta: 'Receta',
    profesion: 'Profesión',
    crea: 'Crea',
    reactivo: 'Reactivo',
    reactivos: 'Reactivos',
    masNoIncluidos: (n, max) => n + ' más no incluidos (acotado a ' + max + ').',
    deSkill: (s) => s + ' de skill',
    hechizo: (n) => 'hechizo ' + n,
    costoReactivos: 'Costo de reactivos',
    valorCreado: 'Valor creado',
    margen: 'Margen estimado',
    reino: 'Reino',
    item: 'Ítem',
    variante: 'variante sin ID simple; no se mezcla con el ítem base',
    diaObservado: 'Día observado',
    importado: 'Importado',
    ultimoMinimo: 'Último mínimo anunciado',
    porUnidad: 'de cobre por unidad',
    ofertaMaxima: 'Oferta máxima diaria observada',
    tipoDato: 'Tipo de dato: ofertas anunciadas (mínimo unitario), no ventas.',
    referencia: 'Referencia de botín/farmeo: Classic 1.12 (CMaNGOS), no verificada en Forever.',
  },
  en: {
    titulo: 'Ask DAVI',
    seccion: 'Section',
    pregunta: 'Question',
    contexto: 'Selected context',
    limites: 'Limits',
    procedencia: 'Provenance',
    personaje: 'Character',
    profesiones: 'Professions',
    mercado: 'Market',
    perfil: 'Profile',
    precios: 'Prices and offers',
    sinNombre: 'no name',
    sinId: 'no ID',
    sinClave: 'no key',
    sinFecha: 'no date',
    sinReino: 'no realm',
    sinDato: 'no data',
    desconocido: 'unknown',
    perfilIncompleto: 'Incomplete profile: faction, race or class missing.',
    limitePerfil: 'Hand-entered profile; it is not the live game state.',
    limiteSinHistorial: 'The full Auctionator.lua history is not included.',
    limiteSinHistorialNiArchivo: 'Neither the full history nor the Auctionator.lua contents are included.',
    limiteOfertas: 'Prices = posted offers, not sales.',
    limiteReferencia: 'Loot/farming reference is Classic 1.12 (CMaNGOS), not verified in Forever.',
    acotadoReceta: 'Recipe and reagents are bounded to the selected recipe; the full recipe list is not included.',
    costosOfertas: 'Costs and margins use posted prices, not sales.',
    receta: 'Recipe',
    profesion: 'Profession',
    crea: 'Creates',
    reactivo: 'Reagent',
    reactivos: 'Reagents',
    masNoIncluidos: (n, max) => n + ' more not included (capped at ' + max + ').',
    deSkill: (s) => s + ' skill',
    hechizo: (n) => 'spell ' + n,
    costoReactivos: 'Reagent cost',
    valorCreado: 'Value created',
    margen: 'Estimated margin',
    reino: 'Realm',
    item: 'Item',
    variante: 'variant without a simple ID; it is not merged with the base item',
    diaObservado: 'Observed day',
    importado: 'Imported',
    ultimoMinimo: 'Last posted minimum',
    porUnidad: 'copper per unit',
    ofertaMaxima: 'Peak daily supply observed',
    tipoDato: 'Data type: posted offers (unit minimum), not sales.',
    referencia: 'Loot/farming reference: Classic 1.12 (CMaNGOS), not verified in Forever.',
  },
}

const et = (lang) => ETIQUETAS[lang === 'en' ? 'en' : 'es']

function copiarItem(item) {
  const out = {}
  if (!item || typeof item !== 'object') return out
  for (const c of CAMPOS_ITEM) {
    if (Object.prototype.hasOwnProperty.call(item, c)) out[c] = item[c]
  }
  return out
}

// Oferta máxima diaria anunciada, leyendo solo `available` y con un tope de entradas.
export function ofertaMaximaDe(item, tope = LIMITE_HISTORIAL) {
  const h = item && Array.isArray(item.history) ? item.history : null
  if (!h) return null
  const n = Math.min(h.length, Math.max(0, Number(tope) || 0))
  let max = null
  for (let i = 0; i < n; i++) {
    const a = h[i] && h[i].available
    if (Number.isFinite(a) && a > 0 && (max === null || a > max)) max = a
  }
  return max
}

function partePerfil(resumenPerfil, e) {
  const t = linea(resumenPerfil)
  return t ? { titulo: e.perfil, lineas: [t] } : null
}

export function partesDisponibles(snapshot) {
  const out = []
  if (!snapshot || !snapshot.partes) return out
  if (snapshot.partes.perfil) out.push('perfil')
  if (snapshot.partes.precios) out.push('precios')
  return out
}

/* ------------------------------------------------------------- personaje */

export function construirContextoPersonaje({ resumen, procedencia = [], lang = 'es' }) {
  const e = et(lang)
  const ok = linea(resumen) !== ''
  return {
    seccion: 'personaje',
    titulo: e.personaje,
    seleccion: ok ? [] : [e.perfilIncompleto],
    partes: { perfil: ok ? { titulo: e.perfil, lineas: [linea(resumen)] } : null, precios: null },
    limites: [e.limitePerfil, e.limiteSinHistorial],
    procedencia: [...procedencia],
  }
}

/* ------------------------------------------------------------- profesión */

export function construirContextoProfesion({
  id, nombre, skill, receta, itemsJson, catalogo, precios, lang = 'es',
  resumenPerfil = null, procedencia = [], market = null, reino = null,
}) {
  const e = et(lang)
  const seleccion = [e.profesion + ': ' + (txt(nombre, lang) || texto(nombre)) + ' (id ' + id + ') · ' + e.deSkill(skill)]
  const preciosLineas = []
  if (receta && typeof receta === 'object') {
    const spell = Number.isFinite(receta.spell) ? receta.spell : null
    seleccion.push(e.receta + ': ' + (txt(receta.n, lang) || e.sinNombre) + (spell === null ? '' : ' (' + e.hechizo(spell) + ')'))
    const crea = Array.isArray(receta.crea) ? receta.crea : null
    if (crea) {
      const cid = Number.isSafeInteger(crea[0]) && crea[0] > 0 ? crea[0] : null
      const cant = Number.isFinite(crea[1]) && crea[1] > 0 ? crea[1] : 1
      const cname = cid === null ? e.sinId : (nombreItem({ itemId: cid, sourceKey: String(cid) }, itemsJson, catalogo, lang) || '#' + cid)
      seleccion.push(e.crea + ': ' + cant + ' × ' + cname + ' (id ' + cid + ')')
    }
    const reactivos = Array.isArray(receta.reactivos) ? receta.reactivos : []
    const tope = Math.min(reactivos.length, LIMITE_REACTIVOS)
    for (let i = 0; i < tope; i++) {
      const par = reactivos[i]
      const rid = Array.isArray(par) ? par[0] : par
      const rcant = Array.isArray(par) && Number.isFinite(par[1]) && par[1] > 0 ? par[1] : 1
      const rname = Number.isSafeInteger(rid) && rid > 0
        ? (nombreItem({ itemId: rid, sourceKey: String(rid) }, itemsJson, catalogo, lang) || '#' + rid)
        : e.sinId
      seleccion.push(e.reactivo + ': ' + rcant + ' × ' + rname + ' (id ' + rid + ')')
    }
    if (reactivos.length > tope) {
      seleccion.push(e.reactivos + ': ' + e.masNoIncluidos(reactivos.length - tope, LIMITE_REACTIVOS))
    }
    // Los precios solo si hay al menos un reactivo con precio conocido.
    const costo = costoReceta(receta, precios, itemsJson)
    if (costo.partes.some((p) => p.cobre !== null)) {
      for (const p of costo.partes.slice(0, LIMITE_REACTIVOS)) {
        if (p.cobre === null) continue
        const nm = Number.isSafeInteger(p.item) && p.item > 0
          ? (nombreItem({ itemId: p.item, sourceKey: String(p.item) }, itemsJson, catalogo, lang) || '#' + p.item)
          : e.sinId
        preciosLineas.push(nm + ' (id ' + p.item + '): ' + cobreTexto(p.cobre) + ' (' + p.fuente + ')')
      }
      preciosLineas.push(e.costoReactivos + ': ' + (costo.total === null ? e.desconocido : cobreTexto(costo.total)))
      const v = valorCreado(receta, precios, itemsJson)
      preciosLineas.push(e.valorCreado + ': ' + (v === null ? e.desconocido : cobreTexto(v)))
      const m = margen(receta, precios, itemsJson)
      preciosLineas.push(e.margen + ': ' + (m === null ? e.desconocido : cobreTexto(m)))
      // Misma resolución de reino que preciosDelMercado: únicamente los ítems de
      // esta receta, sin copiar el snapshot ni su historial. Las fechas van en el
      // bloque opcional de precios, nunca fuera de él.
      const realms = Array.isArray(market?.snapshot?.realms) ? market.snapshot.realms : []
      const buscar = (n) => n == null || n === '' ? null : realms.find((r) =>
        typeof r?.name === 'string' && r.name.trim().toLowerCase() === String(n).trim().toLowerCase())
      const realm = buscar(reino) || buscar(market?.realm) || realms[0]
      if (realm) {
        preciosLineas.push(e.reino + ': ' + texto(realm.name))
        preciosLineas.push('Auctionator.lua · ' + e.importado + ': ' + (texto(market?.snapshot?.importedAt) || e.sinFecha))
        const ids = new Set(costo.partes.slice(0, LIMITE_REACTIVOS).filter((p) => p.fuente === 'subasta').map((p) => p.item))
        if (crea) ids.add(crea[0])
        for (const itemId of ids) {
          const it = (realm.items || []).find((it) => it?.itemId === itemId && Number.isFinite(it.unitPriceCopper) && it.unitPriceCopper > 0)
          if (it) preciosLineas.push('id ' + itemId + ' · ' + e.diaObservado + ': '
            + (Number.isSafeInteger(it.observedDay) ? (fechaDe(it.observedDay) || e.sinFecha) + ' (' + it.observedDay + ')' : e.sinFecha))
        }
      }
    }
  }
  return {
    seccion: 'profesiones',
    titulo: e.profesiones,
    seleccion,
    partes: { perfil: partePerfil(resumenPerfil, e), precios: preciosLineas.length ? { titulo: e.precios, lineas: preciosLineas } : null },
    limites: [e.acotadoReceta, e.costosOfertas],
    procedencia: [...procedencia],
  }
}

/* --------------------------------------------------------------- mercado */

export function construirContextoMercado({
  item, realm, available = null, itemsJson, catalogo, importedAt, lang = 'es',
  resumenPerfil = null, procedencia = [],
}) {
  const e = et(lang)
  const it = copiarItem(item)
  const id = Number.isSafeInteger(it.itemId) && it.itemId > 0 ? it.itemId : null
  const variante = id === null
  const nombre = variante ? null
    : (nombreItem({ itemId: id, sourceKey: String(id) }, itemsJson, catalogo, lang) || '#' + id)
  const seleccion = [e.reino + ': ' + (texto(realm) || e.sinReino)]
  seleccion.push(e.item + ': ' + (variante
    ? (texto(it.sourceKey) || e.sinClave) + ' (' + e.variante + ')'
    : (nombre || texto(it.sourceKey) || e.sinNombre) + ' (id ' + id + ')'))
  if (Number.isSafeInteger(it.observedDay)) {
    seleccion.push(e.diaObservado + ': ' + (fechaDe(it.observedDay) || e.sinFecha) + ' (' + it.observedDay + ')')
  }
  if (typeof importedAt === 'string' && importedAt) seleccion.push(e.importado + ': ' + importedAt)

  const preciosLineas = []
  if (Number.isFinite(it.unitPriceCopper) && it.unitPriceCopper > 0) {
    preciosLineas.push(e.ultimoMinimo + ': ' + cobreTexto(it.unitPriceCopper) + ' ' + e.porUnidad + ' (' + Math.round(it.unitPriceCopper) + 'c)')
  } else {
    preciosLineas.push(e.ultimoMinimo + ': ' + e.sinDato)
  }
  preciosLineas.push(e.ofertaMaxima + ': ' + (Number.isFinite(available) && available > 0 ? Math.round(available) : e.sinDato))
  preciosLineas.push(e.tipoDato)
  preciosLineas.push(e.referencia)

  return {
    seccion: 'mercado',
    titulo: e.mercado,
    seleccion,
    partes: {
      perfil: partePerfil(resumenPerfil, e),
      precios: { titulo: e.precios, lineas: preciosLineas },
    },
    limites: [e.limiteSinHistorialNiArchivo, e.limiteOfertas, e.limiteReferencia],
    procedencia: [...procedencia],
  }
}

/* ----------------------------------------------------------- previsualizar */

export function previsualizarDavi({ pregunta, snapshot, activas, lang = 'es' }) {
  if (!snapshot) return ''
  const e = et(lang)
  const set = activas instanceof Set ? activas : new Set(Array.isArray(activas) ? activas : [])
  const out = []
  out.push(e.titulo + ' — ' + snapshot.titulo)
  out.push(e.pregunta + ': ' + (typeof pregunta === 'string' ? pregunta : ''))
  out.push('')
  out.push(e.contexto + ':')
  for (const l of snapshot.seleccion || []) out.push('- ' + l)
  if (snapshot.partes && snapshot.partes.perfil && set.has('perfil')) {
    out.push(snapshot.partes.perfil.titulo + ':')
    for (const l of snapshot.partes.perfil.lineas) out.push('- ' + l)
  }
  if (snapshot.partes && snapshot.partes.precios && set.has('precios')) {
    out.push(snapshot.partes.precios.titulo + ':')
    for (const l of snapshot.partes.precios.lineas) out.push('- ' + l)
  }
  out.push(e.limites + ':')
  for (const l of snapshot.limites || []) out.push('- ' + l)
  out.push(e.procedencia + ':')
  for (const l of snapshot.procedencia || []) out.push('- ' + l)
  return out.join('\n')
}
