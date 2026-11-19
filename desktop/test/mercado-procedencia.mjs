// Comparación segura capital/neutral en la pestaña Mercado (Chromium + React real).
// No hay exportador/adaptador verificado: ningún JSON se acredita solo.
// Los escenarios aislados se siembran con el esquema v2 real (bundle + puntero)
// para probar la UI sin inventar una fuente del juego.
// Se ejecuta DESPUÉS de `npm run build` (el arnés monta desktop/plugin.js):
//   PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/mercado-procedencia.mjs
import { createRequire } from 'node:module'
import { iniciar, PERFILES } from './arnes.mjs'

const req = createRequire(import.meta.url)
const Identity = req('../../standalone/market-identity.js')
const History = req('../../standalone/market-history.js')

const a = await iniciar()
const { check } = a
const texto = (p) => p.evaluate(() => document.body.innerText)
const esperar = (p, re) => p.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, { timeout: 15000 })
const dia = Math.floor((Date.now() - Date.UTC(2020, 0, 1)) / 86400000)
const captura = new Date().toISOString()

const AUCTIONATOR = 'AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Prueba"]={version=2,' +
  '["2589"]={m=120,h={["' + dia + '"]=130},l={["' + dia + '"]=120},a={["' + dia + '"]=20}},' +
  '["6469"]={m=99999,h={["' + dia + '"]=100000},l={["' + dia + '"]=99999},a={["' + dia + '"]=5}}}}'

function ident(canal, pool, etiqueta) {
  return Identity.accreditedIdentity({
    game: 'wow-forever', region: 'EU', ruleset: 'PvE', auctionPool: pool,
    postingChannel: canal, localScope: 'obs:compartida', rawSourceKey: 'origen-compartido',
    sourceLabel: etiqueta || 'observacion-sintetica-' + canal,
    fromDay: dia - 2, toDay: dia, verifiedAt: captura,
  })
}
const items = (arr) => arr.map(([k, id, p, day]) => ({
  sourceKey: k, itemId: id, unitPriceCopper: p, observedDay: day ?? dia,
  history: [], available: 5, confirmed: false,
}))
const realm = (canal, pool, arr, etiqueta) => ({
  name: 'origen-compartido', identity: ident(canal, pool, etiqueta), items: items(arr),
})
const keyOf = (r) => Identity.identityKey(r.identity)
const snapshot = (realms) => ({
  schemaVersion: 2, sourceVersion: 8, importedAt: captura, realms, warnings: [],
  observation: { scope: 'fresh-scan', fromDay: dia - 2, toDay: dia, capturedAt: captura },
})
const bundle = (snap, revision = 7) => JSON.stringify({
  version: 1, revision, market: { snapshot: snap }, history: History.emptyStoreV2(),
})
const archivo = (nombre, contenido) => ({
  name: nombre, mimeType: 'application/json', buffer: Buffer.from(contenido, 'utf8'),
})

const R_CAP = realm('capital', 'piscina-capital', [
  ['2589', 2589, 120], ['sintetico-a', null, 900],
])
const R_NEUT = realm('neutral', 'piscina-neutral', [
  ['2589', 2589, 100], ['sintetico-b', null, 700],
])
const R_UNI_A = realm('capital', 'piscina-unica', [['2589', 2589, 120]])
const R_UNI_B = realm('neutral', 'piscina-unica', [['2589', 2589, 100]])
const R_SKEW = realm('neutral', 'piscina-skew', [['2589', 2589, 10000]], 'observacion-sintetica-sesgo')

const v2Previo = (realms, extra = {}) => ({
  perfil: PERFILES.cazadorHorda,
  storage: {
    'market-v2-pointer': { slot: 'a', revision: 7 },
    'market-pointer': { slot: 'a', revision: 6 },
    'price-history-pointer': { slot: 'a', revision: 6 },
    ...(extra.storage || {}),
  },
  archivos: { 'market-v2-a.json': bundle(snapshot(realms)), ...(extra.archivos || {}) },
})

/* -------------------- Sesión 1: Auctionator real -------------------- */
let s1 = await a.abrir('claro', { perfil: PERFILES.cazadorHorda })
let p = s1.p
await p.click('[data-tab="mercado"]')
await p.getByText('Todavía no importaste precios').first().waitFor()
await p.evaluate((fix) => { window.carpetaConcedida = { name: 'SavedVariables', files: { 'Auctionator.lua': fix } } }, AUCTIONATOR)
await p.getByRole('button', { name: 'Leer Auctionator.lua' }).first().click()
await esperar(p, /Importación guardada/)
check('Auctionator real muestra aviso UNKNOWN', await p.getByTestId('procedencia-desconocida').count() === 1)
check('comparación bloqueada con procedencia real', await p.getByTestId('comparacion-bloqueada').count() === 1 &&
  /procedencia desconocida/i.test(await p.getByTestId('comparacion-bloqueada').innerText()))
check('sin filas de comparación sobre datos reales', await p.locator('[data-testid="comparacion-filas"] tr').count() === 0)

// Un JSON autodeclarado "verified" no se convierte en fuente sin adaptador.
const FALSO = JSON.stringify({
  schema: 'wow-forever/separate-source-observations/v1',
  identity: { confidence: 'verified', sourceLabel: 'yo-lo-digo' },
  observation: { scope: 'fresh-scan', capturedAt: captura }, items: [],
})
await p.locator('[data-testid="fuente-aislada"]').setInputFiles(archivo('no-autoverificado.json', FALSO))
await esperar(p, /No se cargó/)
check('JSON arbitrario no se auto-verifica como fuente', await p.getByTestId('error-fuente').count() === 1 &&
  /No se marcó como fuente acreditada/.test(await p.getByTestId('error-fuente').innerText()))
check('sin ámbitos nuevos tras el JSON inválido', await p.locator('#ambito-a option').count() <= 3)
await s1.cerrar()

/* -------------------- Sesión 2: escenarios v2 sembrados -------------------- */
let s2 = await a.abrir('claro', v2Previo([R_CAP, R_NEUT, R_UNI_A, R_UNI_B, R_SKEW]))
let q = s2.p
await q.click('[data-tab="mercado"]')
await q.locator('[data-testid="comparacion-filas"] tr').first().waitFor()
check('v2 sembrado: sin aviso UNKNOWN', await q.getByTestId('procedencia-desconocida').count() === 0)
check('selector por identidad, no por nombre de reino',
  (await q.locator('#ambito-a option').allTextContents()).every((o) => !o.includes('origen-compartido')))
const identidades = await q.getByTestId('identidades-fuente').innerText()
check('etiquetas legibles de origen', /observacion-sintetica-capital/.test(identidades) &&
  /observacion-sintetica-neutral/.test(identidades) && /clave de reino opaca/.test(identidades))

const filas = await q.getByTestId('comparacion-filas').innerText()
check('bruto visible y neto como escenario sin comisión verificada',
  /Bruto: 1p 20c/.test(filas) && /comisión no verificada/.test(filas))
check('ausente en B se explica, no vale cero',
  /Ausente en neutral \(falta de datos, no precio 0\)/.test(filas))
check('fila solo en B se explica, no vale cero',
  /Ausente en capital \(falta de datos, no precio 0\)/.test(filas))
check('delta con signo, fecha y cobertura',
  /Δ −20c/.test(await q.locator('[data-testid="comparacion-filas"] tr', { hasText: '2589' }).first().innerText()) &&
  /\d{4}-\d{2}-\d{2}/.test(await q.getByTestId('cmp-fecha').first().innerText()) &&
  /filas:/.test(filas))
const comparacion = await q.getByTestId('comparacion-card').innerText()
check('sin porcentajes inventados ni promesa de ganancia',
  !/5%|15%/.test(comparacion) && !/ganancia garantizada|beneficio garantizado/.test(comparacion))
check('sin afirmación de liquidez', await q.getByTestId('sin-afirmacion-liquidez').count() === 1)

// Comisión: solo se usa si está verificada, etiquetada, fechada y no es futura.
for (const [lado, bps] of [['capital', '500'], ['neutral', '250']]) {
  await q.locator(`[data-testid="comision-${lado}-bps"]`).fill(bps)
  await q.locator(`[data-testid="comision-${lado}-verificada"]`).check()
  await q.locator(`[data-testid="comision-${lado}-fuente"]`).fill('tasa-prueba')
  await q.locator(`[data-testid="comision-${lado}-dia"]`).fill(String(dia))
}
await q.waitForFunction(() => /Neto: 1p 14c/.test(document.body.innerText))
check('neto calculado solo con comisión verificada',
  /Neto: 1p 14c/.test(await texto(q)) && /Neto: 97c/.test(await texto(q)) && /Δ −17c/.test(await texto(q)))

await q.locator('[data-testid="comision-neutral-dia"]').fill(String(dia + 100))
await q.getByTestId('comision-futura').waitFor()
check('comisión futura rechazada', /Día futuro/.test(await q.getByTestId('comision-futura').innerText()) &&
  /Neto: escenario/.test(await q.getByTestId('comparacion-filas').innerText()))
await q.locator('[data-testid="comision-neutral-dia"]').fill(String(dia))
await q.waitForFunction(() => /Neto: 97c/.test(document.body.innerText))

// Dos lados con la MISMA piscina se muestran como una sola serie con canales.
await q.locator('#ambito-a').selectOption(keyOf(R_UNI_A))
await q.locator('#ambito-b').selectOption(keyOf(R_UNI_B))
await q.getByTestId('serie-unica').waitFor()
check('misma piscina se muestra como una sola serie', await q.getByTestId('comparacion-bloqueada').count() === 0 &&
  /Sin delta entre ellos/.test(await q.getByTestId('serie-unica').innerText()))
check('canales alternativos sin falso delta',
  /Canal: capital/.test(await q.getByTestId('comparacion-filas').innerText()) &&
  /Canal: neutral/.test(await q.getByTestId('comparacion-filas').innerText()) &&
  (await q.getByTestId('cmp-delta').first().innerText()).trim() === '—')

// Sesgo excesivo entre fuentes distintas: se bloquea antes de mostrar números.
await q.locator('#ambito-a').selectOption(keyOf(R_CAP))
await q.locator('#ambito-b').selectOption(keyOf(R_SKEW))
await esperar(q, /Comparación bloqueada/)
check('sesgo excesivo bloquea con motivo legible',
  /diferencia de precios excesiva/.test(await q.getByTestId('comparacion-bloqueada').innerText()) &&
  await q.locator('[data-testid="comparacion-filas"] tr').count() === 0)
await s2.cerrar()

/* -------------------- Sesión 3: rollback v2 con confirmación -------------------- */
const snapLegacy = {
  schemaVersion: 1, sourceVersion: 8, importedAt: captura,
  realms: [{ name: 'Prueba', items: [
    { sourceKey: '2589', itemId: 2589, unitPriceCopper: 120, observedDay: dia, history: [] },
  ] }],
  warnings: [],
}
const legacyMarket = JSON.stringify({ revision: 6, values: { snapshot: snapLegacy, realm: 'Prueba' } })
const legacyHistory = JSON.stringify({ v: 1, realms: {} })
const backup = JSON.stringify({
  format: 'wow-forever/pre-v2', createdAt: captura,
  pointers: { market: { slot: 'a', revision: 6 }, priceHistory: { slot: 'a', revision: 6 } },
  slots: { a: { market: legacyMarket, history: legacyHistory }, b: { market: null, history: null } },
})
let s3 = await a.abrir('claro', v2Previo([R_CAP], {
  archivos: {
    'pre-v2-backup.json': backup,
    'market-a.json': legacyMarket,
    'price-history-a.json': legacyHistory,
  },
}))
let r = s3.p
await r.click('[data-tab="mercado"]')
await r.getByTestId('identidades-fuente').waitFor()
check('v2: sin UNKNOWN y con ámbito aislado',
  await r.getByTestId('procedencia-desconocida').count() === 0 &&
  /observacion-sintetica-capital/.test(await r.getByTestId('identidades-fuente').innerText()))
check('v2 sigue siendo escenario, no prueba del juego', /no acredita datos del juego|no prueban? la economía/i.test(await texto(r)))

await r.getByRole('button', { name: 'Restaurar respaldo previo a v2' }).click()
check('rollback pide confirmación', await r.getByRole('button', { name: 'Confirmar restauración del respaldo' }).count() === 1 &&
  await r.getByTestId('procedencia-desconocida').count() === 0)
await r.getByRole('button', { name: 'Confirmar restauración del respaldo' }).click()
await esperar(r, /Respaldo previo a v2 restaurado/)
check('rollback restaura el respaldo legado', await r.getByTestId('procedencia-desconocida').count() === 1 &&
  /Paño de lino/.test(await texto(r)))
await s3.cerrar()

await a.terminar('mercado-procedencia')
