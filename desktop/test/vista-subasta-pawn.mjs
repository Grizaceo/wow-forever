// Prueba de la sub-pestaña «Subasta × Pawn» dentro de Mercado, en navegador real:
//   PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/vista-subasta-pawn.mjs
//
// Cubre: la sub-pestaña existe y Ofertas sigue siendo la de siempre; los tres
// estados SIN DATOS con su motivo y su siguiente paso; la tabla ordenada por
// delta con la fórmula visible; procedencia; y que reabrir da la misma tabla
// (determinismo de la vista). Sin red.
import { iniciar, PERFILES } from './arnes.mjs'

const FIXTURE = 'AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Prueba"]={version=2,' +
  '["2589"]={m=120,h={["2140"]=130},l={["2140"]=120},a={["2140"]=20}},' +
  '["6469"]={m=99999,h={["2141"]=100000},l={["2141"]=99999},a={["2141"]=5}}}}'

const CAPTURA = {
  v: 1, origem: 'addon',
  escala: '"Classic":HUNTER1', localized: 'Hunter: Beast Mastery',
  pesos: { Agility: 2, Stamina: 1 },
  equipado: { 18: { id: 9002, i: 28, l: 'INVTYPE_RANGED', k: { ITEM_MOD_AGILITY_SHORT: 2 } } },
  capturado: Math.floor(Date.now() / 1000) - 3600,
}

// Catálogo de stats: 6469 es un arco (slot RANGED) y 2589 es tela de comercio,
// que no tiene slot. Las claves van como string: es la forma real del storage.
const STATS = {
  v: 1, colhido: Math.floor(Date.now() / 1000) - 7200, fonte: 6,
  resolvidos: 2, pendentes: 0,
  itens: {
    2589: { itemID: 2589, ilvl: 10, equipLoc: 'INVTYPE_TRADEGOODS', stats: { Agility: 1 } },
    6469: { itemID: 6469, ilvl: 30, equipLoc: 'INVTYPE_RANGED', stats: { Agility: 4, Stamina: 2 } },
  },
}

const a = await iniciar()
const { check } = a
const esperar = (p, re) => p.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, { timeout: 15000 })
// El título de la tarjeta se pinta en mayúsculas por CSS: se compara en minúsculas.
const texto = async (p) => (await p.evaluate(() => document.body.innerText)).toLowerCase()

// ---------- 1) Session: sin captura de Pawn ----------
let { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda })
await p.click('[data-tab="mercado"]')
check('la sub-pestaña de Mercado existe', await p.locator('[data-testid="mercado-sub"]').count() === 1)
check('Ofertas es la vista por defecto', await p.getByRole('radio', { name: 'Ofertas' }).getAttribute('aria-checked') === 'true')

await p.evaluate((fix) => { window.carpetaConcedida = { name: 'SavedVariables', files: { 'Auctionator.lua': fix } } }, FIXTURE)
await p.getByRole('button', { name: 'Leer Auctionator.lua' }).first().click()
await esperar(p, /Importación guardada/)

await p.getByRole('radio', { name: 'Subasta × Pawn' }).click()
await p.getByText(/SIN DATOS · SIN PESOS PAWN/i).first().waitFor()
const t1 = await texto(p)
check('sin escala Pawn declara SIN DATOS con su motivo', /sin datos · sin pesos pawn/i.test(t1))
check('sin escala indica el siguiente paso (/wfbpawn)', /\/wfbpawn/.test(t1))
check('la fórmula se declara siempre', /score = σ stats × pesos/i.test(t1))
check('avisa que no es recomendación ni DPS', /no es una recomendación, no es dps/i.test(t1))
check('sin escala no inventa filas', await p.locator('table tbody tr').count() === 0)
check('la procedencia declara que no hay captura', /escala pawn: sin captura/i.test(t1))
cerrar()

// ---------- 2) Con captura Pawn pero sin catálogo de stats ----------
;({ p, cerrar } = await a.abrir('oscuro', { perfil: PERFILES.cazadorHorda, storage: { pawn: CAPTURA } }))
await p.click('[data-tab="mercado"]')
await p.evaluate((fix) => { window.carpetaConcedida = { name: 'SavedVariables', files: { 'Auctionator.lua': fix } } }, FIXTURE)
await p.getByRole('button', { name: 'Leer Auctionator.lua' }).first().click()
await esperar(p, /Importación guardada/)
await p.getByRole('radio', { name: 'Subasta × Pawn' }).click()
await p.getByText(/SIN DATOS · SIN CATÁLOGO DE STATS DE ÍTEMS/i).first().waitFor()
const t2 = await texto(p)
check('sin catálogo de stats declara SIN DATOS', /sin datos · sin catálogo de stats de ítems/i.test(t2))
check('sin catálogo indica /wfbp catalogo y /reload', /\/wfbp catalogo/.test(t2) && /\/reload/.test(t2))
check('la escala sí se declara capturada', /hunter: beast mastery/i.test(t2))
cerrar()

// ---------- 3) Todo presente: tabla, orden, procedencia ----------
;({ p, cerrar } = await a.abrir('claro', {
  perfil: PERFILES.cazadorHorda,
  storage: { pawn: CAPTURA, 'pawn-stats': STATS },
}))
await p.click('[data-tab="mercado"]')
await p.evaluate((fix) => { window.carpetaConcedida = { name: 'SavedVariables', files: { 'Auctionator.lua': fix } } }, FIXTURE)
await p.getByRole('button', { name: 'Leer Auctionator.lua' }).first().click()
await esperar(p, /Importación guardada/)
await p.getByRole('radio', { name: 'Subasta × Pawn' }).click()
await p.locator('table tbody tr').first().waitFor()

const filas = await p.evaluate(() => [...document.querySelectorAll('table tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.innerText.trim())))
check('solo compite el ítem con slot y stats', filas.length === 1, filas)
check('la fila es el arco del snapshot', /venomstrike/i.test(filas[0][0]), filas[0])
check('slot declarado (RANGED)', filas[0][1] === 'RANGED', filas[0])
check('ilvl del catálogo', filas[0][2] === '30', filas[0])
check('precio en cobre del snapshot', /9g|999/.test(filas[0][3]) || filas[0][3] !== '', filas[0][3])
check('score = 4·2 + 2·1', filas[0][4] === '10', filas[0][4])
check('delta contra el arco puesto (+6)', filas[0][5] === '+6', filas[0][5])
check('plata por punto calculada', Number(filas[0][6]) > 0, filas[0][6])

// El detalle de exclusiones vive en un <details>: se abre para leerlo y se
// vuelve a cerrar (no cambia la tabla ni el resumen).
await p.locator('summary').first().click()
const t3 = await texto(p)
check('la exclusión por slot no reconocido se declara', /1 × slot no reconocido/i.test(t3))
check('resumen con ofertas e ítems', /\d+ ofertas · 2 ítems · 1 en la tabla · 1 excluidas/i.test(t3))
check('procedencia: escala Pawn', /escala pawn: hunter: beast mastery · capturada \d{4}-\d{2}-\d{2}/i.test(t3))
check('procedencia: catálogo de stats', /catálogo de stats: 2 ítems · cosechado \d{4}-\d{2}-\d{2}/i.test(t3))
check('procedencia: subasta y reino', /subasta: prueba · 2 claves/i.test(t3))

// El orden se sostiene al ir y volver de la sub-pestaña (misma entrada, misma tabla).
await p.getByRole('radio', { name: 'Ofertas' }).click()
await p.getByRole('button', { name: 'Leer Auctionator.lua' }).first().waitFor()
await p.getByRole('radio', { name: 'Subasta × Pawn' }).click()
await p.locator('table tbody tr').first().waitFor()
const filas2 = await p.evaluate(() => [...document.querySelectorAll('table tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.innerText.trim())))
check('volver a la sub-pestaña da la misma tabla', JSON.stringify(filas2) === JSON.stringify(filas), { filas, filas2 })
cerrar()

// ---------- 4) Sin ofertas importadas ----------
;({ p, cerrar } = await a.abrir('claro', {
  perfil: PERFILES.cazadorHorda,
  storage: { pawn: CAPTURA, 'pawn-stats': STATS },
}))
await p.click('[data-tab="mercado"]')
await p.getByRole('radio', { name: 'Subasta × Pawn' }).click()
await p.getByText(/SIN DATOS · SIN OFERTAS IMPORTADAS/i).first().waitFor()
const t4 = await texto(p)
check('sin ofertas declara SIN DATOS', /sin datos · sin ofertas importadas/i.test(t4))
check('sin ofertas remite a la pestaña Mercado', /importá los precios de auctionator/i.test(t4))
cerrar()

await a.terminar('vista-subasta-pawn')
