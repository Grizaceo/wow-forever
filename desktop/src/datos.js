// Datos del juego que trae el plugin. Todo viene de data/ (generado por
// tools/build-datos-juego.py) y de standalone/ (drop-data generado y guías curadas).
// Nada se descarga ni se lee del juego.
import personaje from '../../data/personaje.json'
import clases from '../../data/clases.json'
import profesiones from '../../data/profesiones.json'
import items from '../../data/items.json'
import zonas from '../../data/zonas.json'
import misiones from '../../data/misiones.json'
import dungeons from '../../data/dungeons.json'
import dropData from '../../standalone/drop-data.js'
import { GUIDE_HUNTER } from '../../standalone/guide-hunter.js'
import { GUIDE_LEGACY } from '../../standalone/guide-legacy.js'

export const D = { personaje, clases, profesiones, items, zonas, misiones, dungeons, dropData }

// Guías curadas por ID de clase del cliente (3 Cazador) y por facción que cubren. El
// resto de clases no tiene capa curada. Las de Guerrero y Chamán se retiraron en la
// 2.0.0: nombraban ítems, misiones, jefes y razas que no existen
// (tools/auditar-curado.mjs lo mostró), y esas clases usan solo los datos generados
// hasta que se reescriban. Sus archivos se borraron del repo (2026-11-20); lo único
// validado, la lista curada de dungeons, vive en tests/fixtures/guias-curadas.json.
// Toda guía que se agregue acá tiene que pasar ese auditor (tests/curado-datos.test.mjs).
export const GUIAS = { 3: GUIDE_HUNTER }
export const LEGACY = GUIDE_LEGACY

// Nombre visible de la clase de una guía curada, desde personaje.json (la guía trae su
// nombre en inglés, `G.name`). Si la guía no está en GUIAS, cae a ese nombre.
export function nombreClaseGuia(G, lang) {
  const id = Object.keys(GUIAS).find((k) => GUIAS[k] === G)
  const c = id && D.personaje.clases[id]
  return c ? nombre(c.n, lang) : (G && G.name) || ''
}
const FAC_GUIA = { alianza: 'alliance', horda: 'horde' }

export function guiaCurada(perfil) {
  const g = perfil && GUIAS[perfil.clase]
  if (!g) return null
  const fac = FAC_GUIA[perfil.faccion]
  return g.factions && g.factions[fac] ? { guia: g, fac, datos: g.factions[fac] } : { guia: g, fac: null, datos: null }
}

// Nombre visible en el idioma pedido, con respaldo al otro.
export function nombre(n, lang) {
  if (!n) return ''
  if (typeof n === 'string') return n
  return (lang === 'en' ? n.en || n.es : n.es || n.en) || ''
}

// items.json: id -> [es, en, calidad, nivel_req, nivel_item, venta_cobre, clase, subclase, ligado]
export function item(id) {
  const f = items.items[String(id)]
  if (!f) return null
  return { id: Number(id), n: { es: f[0] || f[1], en: f[1] || f[0] }, calidad: f[2], nivelReq: f[3],
    nivelItem: f[4], venta: f[5], clase: f[6], subclase: f[7], ligado: f[8] }
}

export function zona(id) {
  return id == null ? null : zonas.zonas[String(id)] || null
}

export const FACCIONES = ['alianza', 'horda']
export const PRINCIPALES = [171, 164, 333, 202, 182, 165, 186, 393, 197]
export const SECUNDARIAS = [185, 129, 356]

export function huecos(archivo, filtro) {
  return (D[archivo].huecos || []).filter((h) => Object.entries(filtro).every(([k, v]) => h[k] === v))
}

// Precio en cobre a "1g 2s 3c" (inglés) o "1o 2p 3c" (español).
// El idioma se fija al arrancar la app y al cambiarlo; así las vistas no
// tienen que pasar `lang` a cada precio.
let IDIOMA_DINERO = 'es'

export function setIdioma(lang) {
  IDIOMA_DINERO = lang === 'es' ? 'es' : 'en'
}

export function dinero(cobre, lang = IDIOMA_DINERO) {
  if (cobre == null || !Number.isFinite(cobre)) return '—'
  const c = Math.round(cobre), o = Math.floor(c / 10000), p = Math.floor((c % 10000) / 100), b = c % 100
  const [uO, uP, uC] = lang === 'es' ? ['o', 'p', 'c'] : ['g', 's', 'c']
  return [o ? o + uO : '', p ? p + uP : '', b || (!o && !p) ? b + uC : ''].filter(Boolean).join(' ')
}
