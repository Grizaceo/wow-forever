// Pruebas puras de «Preguntar a DAVI»: los constructores de contexto (allowlist de
// campos, acotes, variante y reino, sin precios de perfil) y el transporte
// (insertText -> portapapeles -> copia manual; nunca submit/setDraft).
//   node --test tests/
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  LIMITE_REACTIVOS,
  construirContextoMercado,
  construirContextoPersonaje,
  construirContextoProfesion,
  ofertaMaximaDe,
  partesDisponibles,
  previsualizarDavi,
} from '../desktop/src/davi.js'
import { enviarDavi } from '../desktop/src/davi-transporte.js'
import { fechaDe } from '../desktop/src/mercado-logica.js'

const ITEMS = {
  items: {
    '2835': ['Piedra férrea', 'Rough Stone', 1, 1, 1, 1, 4, 1, 0, 4, 0, 0],
    '2862': ['Punta de bronce', 'Bronze Tip', 1, 1, 1, 1, 4, 1, 0, 1, 0, 0],
  },
}
const CATALOGO = { items: {} }

const ITEM = {
  spell: 2660,
  crea: [2862, 1],
  n: { es: 'Piedra de afilar férrea', en: 'Rough Sharpening Stone' },
  reactivos: [[2835, 1]],
}

const recetaLarga = (n) => ({
  spell: 1,
  crea: [2862, 1],
  n: { es: 'Receta larga', en: 'Long Recipe' },
  reactivos: Array.from({ length: n }, (_, i) => [2835 + (i % 2), 1]),
})

test('personaje: el perfil es el único bloque y se puede excluir', () => {
  const snap = construirContextoPersonaje({
    resumen: 'Horda · No-muerto · nivel 24 · Paladín',
    procedencia: ['data/personaje.json'],
  })
  assert.deepEqual(partesDisponibles(snap), ['perfil'])
  const con = previsualizarDavi({ pregunta: '¿Qué hago?', snapshot: snap, activas: ['perfil'] })
  const sin = previsualizarDavi({ pregunta: '¿Qué hago?', snapshot: snap, activas: [] })
  assert.match(con, /Horda · No-muerto/)
  assert.match(con, /data\/personaje\.json/)
  assert.match(con, /no es el estado del juego en vivo/)
  assert.ok(!sin.includes('No-muerto'))
  assert.ok(!sin.includes('24'))
})

test('mercado: allowlist de campos, sin historial ni objetos arbitrarios', () => {
  const item = {
    sourceKey: '2835@forzar',
    itemId: 2835,
    unitPriceCopper: 123456,
    observedDay: 2140,
    history: [{ day: 2140, low: 1, high: 999999, available: 777 }],
    vendedores: { alianza: [{ npc: 'Malgor', zona: 1 }] },
    secreto: 'NO-DEBE-SALIR',
  }
  const snap = construirContextoMercado({
    item,
    realm: 'Prueba',
    available: ofertaMaximaDe(item),
    itemsJson: ITEMS,
    catalogo: CATALOGO,
    importedAt: '2026-11-10T12:00:00.000Z',
    lang: 'es',
    procedencia: ['Auctionator.lua importado'],
  })
  const texto = previsualizarDavi({ pregunta: '¿Compro?', snapshot: snap, activas: partesDisponibles(snap) })
  assert.ok(texto.includes('Piedra férrea'))
  assert.ok(texto.includes('Prueba'))
  assert.ok(texto.includes(String(2140)))
  assert.ok(texto.includes(fechaDe(2140)))
  assert.ok(texto.includes('2026-11-10T12:00:00.000Z'))
  assert.ok(texto.includes('ofertas anunciadas'))
  assert.ok(texto.includes('no ventas'))
  assert.ok(texto.includes('no verificada en Forever'))
  assert.ok(texto.includes('Auctionator.lua'))
  // Ni el historial ni campos fuera de la allowlist se serializan.
  assert.ok(!texto.includes('NO-DEBE-SALIR'))
  assert.ok(!texto.includes('999999'))
  assert.ok(!texto.includes('"history"'))
  assert.ok(!texto.includes('vendedores'))
  assert.ok(!texto.includes('Malgor'))
})

test('mercado: excluir precios quita el precio pero deja la identidad', () => {
  const item = { sourceKey: '2835', itemId: 2835, unitPriceCopper: 123456, observedDay: 2140, history: [] }
  const snap = construirContextoMercado({
    item, realm: 'Prueba', available: 7, itemsJson: ITEMS, catalogo: CATALOGO,
    importedAt: '2026-11-10T12:00:00.000Z', lang: 'es', procedencia: [],
  })
  const con = previsualizarDavi({ pregunta: 'x', snapshot: snap, activas: ['precios'] })
  const sin = previsualizarDavi({ pregunta: 'x', snapshot: snap, activas: [] })
  assert.match(con, /12o 34p 56c/)
  assert.match(con, /oferta máxima diaria observada: 7/i)
  assert.ok(!sin.includes('12o 34p 56c'))
  assert.ok(sin.includes('Piedra férrea'))
  assert.ok(sin.includes(String(2140)))
})

test('mercado: reino cruzado y variante sin ID simple se conservan, sin mezclar', () => {
  const base = { sourceKey: '2835', itemId: 2835, unitPriceCopper: 120, observedDay: 2140, history: [] }
  const ali = construirContextoMercado({
    item: base, realm: 'Alianza', available: null, itemsJson: ITEMS, catalogo: CATALOGO,
    importedAt: '2026-11-10T12:00:00.000Z', lang: 'es', procedencia: [],
  })
  const hor = construirContextoMercado({
    item: { ...base, unitPriceCopper: 9999 }, realm: 'Horda', available: null, itemsJson: ITEMS,
    catalogo: CATALOGO, importedAt: '2026-11-10T12:00:00.000Z', lang: 'es', procedencia: [],
  })
  const vari = construirContextoMercado({
    item: { sourceKey: '2835@forzar', itemId: null, unitPriceCopper: 50, observedDay: 2140, history: [] },
    realm: 'Horda', available: 3, itemsJson: ITEMS, catalogo: CATALOGO,
    importedAt: '2026-11-10T12:00:00.000Z', lang: 'es', procedencia: [],
  })
  const tAli = previsualizarDavi({ pregunta: 'x', snapshot: ali, activas: ['precios'] })
  const tHor = previsualizarDavi({ pregunta: 'x', snapshot: hor, activas: ['precios'] })
  const tVari = previsualizarDavi({ pregunta: 'x', snapshot: vari, activas: ['precios'] })
  assert.ok(tAli.includes('Alianza') && !tAli.includes('Horda'))
  assert.ok(tHor.includes('Horda') && !tHor.includes('Alianza'))
  assert.ok(tAli.includes('Piedra férrea'))
  // La variante sin ID simple no se resuelve contra el ítem base.
  assert.ok(tVari.includes('2835@forzar'))
  assert.ok(tVari.includes('sin ID simple'))
  assert.ok(!tVari.includes('Piedra férrea'))
})

test('profesión: receta y reactivos acotados; sin precios de perfil cuando se excluye', () => {
  const snap = construirContextoProfesion({
    id: 164,
    nombre: 'Herrería',
    skill: 120,
    receta: ITEM,
    itemsJson: ITEMS,
    catalogo: CATALOGO,
    precios: new Map([[2835, 123456]]),
    lang: 'es',
    resumenPerfil: 'Horda · nivel 24 · Paladín',
    procedencia: ['data/profesiones.json'],
  })
  assert.deepEqual(partesDisponibles(snap), ['perfil', 'precios'])
  const con = previsualizarDavi({ pregunta: '¿Cómo subo?', snapshot: snap, activas: ['perfil', 'precios'] })
  const sin = previsualizarDavi({ pregunta: '¿Cómo subo?', snapshot: snap, activas: [] })
  assert.match(con, /Herrería \(id 164\)/)
  assert.match(con, /Piedra de afilar férrea/)
  assert.match(con, /Piedra férrea/)
  assert.match(con, /Horda · nivel 24/)
  assert.match(con, /12o 34p 56c/)
  assert.ok(!sin.includes('Horda'))
  assert.ok(!sin.includes('nivel 24'))
  assert.ok(!sin.includes('12o 34p 56c'))
  assert.ok(sin.includes('Piedra férrea'))
})

test('profesión: sin mercado no hay bloque de precios y la receta se acota', () => {
  const snap = construirContextoProfesion({
    id: 164, nombre: 'Herrería', skill: 1, receta: recetaLarga(LIMITE_REACTIVOS + 25),
    itemsJson: ITEMS, catalogo: CATALOGO, precios: new Map(), lang: 'es',
    resumenPerfil: null, procedencia: [],
  })
  assert.deepEqual(partesDisponibles(snap), [])
  const texto = previsualizarDavi({ pregunta: 'x', snapshot: snap, activas: [] })
  const lineas = texto.split('\n').filter((l) => l.startsWith('- Reactivo:'))
  assert.equal(lineas.length, LIMITE_REACTIVOS)
  assert.match(texto, /acotado/)
})

test('ofertaMaximaDe: lee solo available del historial y con tope', () => {
  assert.equal(ofertaMaximaDe({ history: [{ available: 3 }, { available: 42 }, { available: 5 }] }), 42)
  const grande = Array.from({ length: 5000 }, (_, i) => ({ available: i }))
  assert.equal(ofertaMaximaDe({ history: grande }, 10), 9)
  assert.equal(ofertaMaximaDe({ history: grande }), 199)
  assert.equal(ofertaMaximaDe({}), null)
  assert.equal(ofertaMaximaDe({ history: 'no' }), null)
  assert.equal(ofertaMaximaDe({ history: [{ low: 1 }] }), null)
})

/* ------------------------------------------------------------- transporte */

function doble({ insert = true, insertLanza = false, clip = true, clipLanza = false, conSubmit = true } = {}) {
  const llamadas = { insert: [], clip: [], submit: 0, setDraft: 0 }
  const host = {
    composer: {
      insertText: async (...args) => {
        llamadas.insert.push(args)
        if (insertLanza) throw new Error('insert-fallo')
        return insert
      },
    },
  }
  if (conSubmit) {
    host.composer.submit = async () => { llamadas.submit++ }
    host.composer.setDraft = async () => { llamadas.setDraft++ }
  }
  const ctx = { os: { writeClipboard: async (t) => { llamadas.clip.push(t); if (clipLanza) throw new Error('clip-fallo'); return clip } } }
  return { host, ctx, llamadas }
}

test('transporte: insertText(true) inserta con modo bloque y no toca el portapapeles', async () => {
  const { host, ctx, llamadas } = doble({ insert: true })
  const r = await enviarDavi({ host, ctx, texto: '  pregunta  ' })
  assert.deepEqual(r, { estado: 'insertado', motivo: null })
  assert.equal(llamadas.insert.length, 1)
  assert.deepEqual(llamadas.insert[0], [null, 'pregunta', { mode: 'block' }])
  assert.equal(llamadas.clip.length, 0)
  assert.equal(llamadas.submit, 0)
  assert.equal(llamadas.setDraft, 0)
})

test('transporte: insertText(false) cae al portapapeles', async () => {
  const { host, ctx, llamadas } = doble({ insert: false, clip: true })
  const r = await enviarDavi({ host, ctx, texto: 'pregunta' })
  assert.equal(r.estado, 'copiado')
  assert.equal(r.motivo, 'insert-text-fallo')
  assert.deepEqual(llamadas.clip, ['pregunta'])
})

test('transporte: insertText que lanza cae al portapapeles', async () => {
  const { host, ctx, llamadas } = doble({ insertLanza: true })
  const r = await enviarDavi({ host, ctx, texto: 'pregunta' })
  assert.equal(r.estado, 'copiado')
  assert.equal(r.motivo, 'insert-text-excepcion')
  assert.deepEqual(llamadas.clip, ['pregunta'])
})

test('transporte: sin composer cae al portapapeles', async () => {
  const { host, ctx, llamadas } = doble({})
  delete host.composer
  const r = await enviarDavi({ host, ctx, texto: 'pregunta' })
  assert.equal(r.estado, 'copiado')
  assert.equal(r.motivo, 'insert-text-no-disponible')
  assert.deepEqual(llamadas.clip, ['pregunta'])
})

test('transporte: portapapeles que falla deja el texto para copia manual', async () => {
  const { host, ctx, llamadas } = doble({ insert: false, clip: false })
  const r = await enviarDavi({ host, ctx, texto: 'pregunta' })
  assert.equal(r.estado, 'manual')
  assert.equal(llamadas.clip.length, 1)
})

test('transporte: nunca llama submit ni setDraft', async () => {
  const { host, ctx, llamadas } = doble({ insert: false, clip: false })
  await enviarDavi({ host, ctx, texto: 'pregunta' })
  assert.equal(llamadas.submit, 0)
  assert.equal(llamadas.setDraft, 0)
})

test('transporte: texto vacío no hace nada', async () => {
  const { host, ctx, llamadas } = doble({})
  const r = await enviarDavi({ host, ctx, texto: '   ' })
  assert.equal(r.estado, 'error')
  assert.equal(llamadas.insert.length, 0)
  assert.equal(llamadas.clip.length, 0)
})
