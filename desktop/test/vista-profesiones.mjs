// Prueba de la sección Profesiones con el arnés: entrenadores de la facción del
// perfil, skill guardado que cambia las recetas aprendibles, costos con mercado
// precargado, otra profesión del perfil y ambos temas sin errores.
//   PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/vista-profesiones.mjs
import { abrirVista, iniciar, PERFILES, PREF, TEMAS } from './arnes.mjs'

const MERCADO = {
  storage: { 'market-pointer': { slot: 'a', revision: 1 } },
  archivos: { 'market-a.json': JSON.stringify({ revision: 1, values: {
    realm: 'Prueba',
    snapshot: { schemaVersion: 1, sourceVersion: 8, importedAt: '2026-11-10T12:00:00.000Z', warnings: [],
      realms: [{ name: 'Prueba', items: [
        { sourceKey: '2589', itemId: 2589, unitPriceCopper: 120, observedDay: 2140,
          history: [{ day: 2140, low: 120, high: 130, available: 20 }] },
      ] }] },
  } }) },
}

// Fixture de mercado data-driven para Herrería (164): precios planos para todos sus
// reactivos y objetos-receta, para ejercitar la ruta de maxeo completa con adquisiciones pagadas.
const { readFileSync } = await import('node:fs')
const profData = JSON.parse(readFileSync(new URL('../../data/profesiones.json', import.meta.url), 'utf8'))
const profs = profData.profesiones || profData
const idsHerreria = new Set()
for (const r of profs['164'].recetas) {
  for (const par of (r.reactivos || [])) idsHerreria.add(Number(Array.isArray(par) ? par[0] : par))
  if (r.receta_item != null) idsHerreria.add(Number(r.receta_item))
}
// Precios mínimos para Cocina: dos platos con margen (arco iris 235c, pargo 180c) y el
// pececito en pérdida, para probar el panel de venta.
const itemsCocina = [[4592, 200, 900], [6289, 10, 4000], [5095, 300, 700], [6361, 50, 2500], [6290, 60, 800], [6291, 100, 900]]
const mercaCocina = {
  storage: { 'market-pointer': { slot: 'a', revision: 1 } },
  archivos: { 'market-a.json': JSON.stringify({ revision: 1, values: { realm: 'Prueba', snapshot: {
    schemaVersion: 1, sourceVersion: 8, importedAt: '2026-11-20T17:20:39.563Z', warnings: [],
    realms: [{ name: 'Prueba', items: itemsCocina.map(([id, p, n]) => ({
      sourceKey: String(id), itemId: id, unitPriceCopper: p, observedDay: 2514,
      history: [{ day: 2514, low: p, high: Math.round(p * 1.1), available: n }],
    })) }],
  } } }) },
}
const mercadoHerreria = {
  storage: { 'market-pointer': { slot: 'a', revision: 1 } },
  archivos: { 'market-a.json': JSON.stringify({ revision: 1, values: { realm: 'Prueba', snapshot: {
    schemaVersion: 1, sourceVersion: 8, importedAt: '2026-11-10T12:00:00.000Z', warnings: [],
    realms: [{ name: 'Prueba', items: [...idsHerreria].filter(Number.isFinite).map((id) => ({
      sourceKey: String(id), itemId: id, unitPriceCopper: 100, observedDay: 2140,
      history: [{ day: 2140, low: 100, high: 110, available: 20 }] })) }] } } }) },
}

const escribirSkill = async (p, id, valor) => {
  // Playwright 1.64 + React 19: fill() se queda esperando acción sobre inputs
  // controlados que se re-renderizan; foco + teclado ejercita el mismo onChange.
  await p.locator('#wf-skill-' + id).focus()
  await p.keyboard.press('Control+A')
  await p.keyboard.type(String(valor))
}
const a = await iniciar()
const { check } = a
const cuentaAprendibles = (p) => p.evaluate(() => {
  const m = /Aprendibles ahora \((\d+)\)/.exec(document.body.innerText)
  return m ? Number(m[1]) : null
})

// 1) Paladín no-muerto (Herrería + Minería) en tema claro con mercado: entrenadores
//    de la Horda primero (las del perfil encabezan el selector).
let { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.paladinHorda, ...MERCADO })
await abrirVista(p, 'profesiones')
await p.getByText('Entrenadores').first().waitFor()
check('Herrería es la profesión por defecto (primera del perfil)', await p.evaluate(() =>
  document.querySelector('#wf-profesion').value === '164'))
check('plegada: solo los entrenadores del siguiente tramo (hasta 75)', await p.getByText('Thrag Stonehoof').count() > 0
  && await p.getByText('Karn Stonehoof').count() === 0 && await p.getByText(/siguiente tramo \(hasta 75\)/).count() > 0)
await p.getByRole('button', { name: 'Ver los 16 entrenadores' }).click()
check('ve todos los entrenadores de la Horda (Herrería)', await p.getByText('Brikk Keencraft').count() > 0
  && await p.getByText('Karn Stonehoof').count() > 0)
// Snarl (herrería) está en Orgrimmar, no en Azshara: el NPC va a la zona más chica que lo contiene.
check('los entrenadores muestran zona y coordenadas', await p.getByText('Orgrimmar').count() > 0
  && await p.getByText('X 79.6% · Y 23.3%').count() > 0 && await p.getByText('Cima del Trueno').count() > 0)
check('la tarjeta de plan existe y se marca como estimación', await p.getByText('Plan de subida').count() > 0
  && await p.getByText(/Estimación/).count() > 0)

// 2) El skill guardado cambia las recetas aprendibles.
const antes = await cuentaAprendibles(p)
await escribirSkill(p, 164, 300)
await p.waitForFunction(() => /Aprendibles ahora \(4\d\d\)/.test(document.body.innerText) || document.body.innerText.includes('Aprendibles ahora (3'))
const despues = await cuentaAprendibles(p)
check('cambiar el skill cambia las aprendibles', antes !== null && despues !== null && antes !== despues,
  { antes, despues })
check('el skill quedó guardado en ctx.storage', await p.evaluate((k) =>
  JSON.parse(localStorage.getItem(k)) === 300, PREF + 'skill-164'))
await escribirSkill(p, 164, 1)
await p.waitForTimeout(80)

// 3) Con mercado precargado aparecen costos: Primeros auxilios, Venda de lino
//    (reactivo Paño de lino 2589 a 120c de subasta).
await p.selectOption('#wf-profesion', '129')
await p.waitForFunction(() => document.body.innerText.includes('Venda de lino'))
// 'Venda de lino' también aparece como reactivo del botiquín de primeros auxilios:
// la fila de la receta se identifica por su costo y su reactivo Paño de lino.
const fila = p.locator('tr').filter({ hasText: 'Venda de lino' }).filter({ hasText: '1p 20c' })
check('la Venda de lino muestra costo de subasta', await fila.count() === 1)
check('muestra sus reactivos', (await fila.innerText()).includes('Paño de lino'))
// Click en la fila: el panel de reactivos muestra la fuente de subasta.
await fila.click()
await p.waitForFunction(() => document.body.innerText.includes('subasta ~1p 20c'))
check('el detalle del reactivo muestra la fuente', await p.getByText(/subasta ~1p 20c/).count() > 0)
await cerrar()

// 4) Sin mercado: el plan invita a importar precios y el botón lleva a Mercado.
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.paladinHorda }))
await abrirVista(p, 'profesiones')
await p.getByText('Sin precios de mercado').waitFor()
await p.getByRole('button', { name: 'Importar precios en Mercado' }).click()
await p.waitForTimeout(80)
check('sin mercado, el botón navega a la pestaña Mercado', await p.evaluate(() =>
  document.querySelector('[data-tab="mercado"]').getAttribute('aria-selected') === 'true'))
await cerrar()

// 5) Chamán enano con Alquimia (perfil del arnés): entrenadores de la Alianza.
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.chamanAlianza }))
await abrirVista(p, 'profesiones')
await p.getByText('Entrenadores').first().waitFor()
check('Alquimia por defecto y entrenadores de la Alianza', await p.evaluate(() =>
  document.querySelector('#wf-profesion').value === '171')
  && await p.getByText('Alchemist Mallory').count() > 0)
await cerrar()

// 6) Temas claro y oscuro: la sección se pinta y el color de dificultad sigue al tema.
for (const tema of ['claro', 'oscuro']) {
  ;({ p, cerrar } = await a.abrir(tema, { perfil: PERFILES.cazadorHorda }))
  await abrirVista(p, 'profesiones')
  await p.getByText('Entrenadores').first().waitFor()
  await p.selectOption('#wf-profesion', '129')
  await p.waitForFunction(() => document.body.innerText.includes('naranja'))
  const color = await p.locator('td', { hasText: 'naranja' }).first()
    .evaluate((el) => getComputedStyle(el).color)
  const esperado = TEMAS[tema]['--ui-orange']
  const rgb = await p.evaluate((css) => {
    const d = document.createElement('div'); d.style.color = css; document.body.appendChild(d)
    const c = getComputedStyle(d).color; d.remove(); return c
  }, esperado)
  check(tema + ': la dificultad naranja usa el color del tema', color === rgb, { color, rgb })
  check(tema + ': sin errores ni alertas', await p.locator('[role="alert"]').count() === 0)
  await cerrar()
}

// 7) Modo «Maxear a 300» (rutaMaxeo): adquisición, cobertura, huecos y SIN DATOS declarados.
// 7a) Sin mercado: el modo maxear invita a importar precios y declara el trainer SIN DATOS.
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.paladinHorda }))
await abrirVista(p, 'profesiones')
await p.getByRole('button', { name: 'Maxear a 300' }).click()
await p.getByText('Sin precios de mercado').waitFor()
check('maxear sin mercado: aviso de importar + nota SIN DATOS del trainer',
  await p.getByText(/SIN DATOS/).count() > 0
  && await p.getByRole('button', { name: 'Importar precios en Mercado' }).count() > 0)
await cerrar()

// 7b) Mercado completo de Herrería: ruta con pasos, adquisiciones pagadas, cobertura y total.
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.paladinHorda, ...mercadoHerreria }))
await abrirVista(p, 'profesiones')
await escribirSkill(p, 164, 1)
await p.waitForTimeout(80)
await p.getByRole('button', { name: 'Maxear a 300' }).click()
await p.getByText('Adquisición de recetas').first().waitFor()
check('maxear: título de la tarjeta y nota de entrenamiento SIN DATOS',
  await p.evaluate(() => document.body.innerText.includes('Maxear a 300'))
  && await p.getByText(/SIN DATOS/).count() > 0)
check('maxear: cobertura del tramo declarada', await p.getByText(/% del tramo cubierto/).count() > 0)
check('maxear: hay pasos de ruta con crafts', await p.evaluate(() => document.body.innerText.includes('crafts')))
check('maxear: sección de adquisición con fuente vendedor/subasta',
  await p.getByText('Adquisición de recetas').count() > 0
  && (await p.getByText('vendedor').count() > 0 || await p.getByText('subasta').count() > 0))
check('maxear: total materiales + adquisición',
  await p.getByText('Total estimado (materiales + adquisición)').count() > 0)
check('maxear: sin errores ni alertas', await p.locator('[role="alert"]').count() === 0)
await cerrar()

// 7c) Mercado parcial (solo Paño de lino): Primeros auxilios declara cobertura o falta de ruta, honesto.
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.chamanAlianza, ...MERCADO }))
await abrirVista(p, 'profesiones')
await p.selectOption('#wf-profesion', '129')
await escribirSkill(p, 129, 1)
await p.waitForTimeout(80)
await p.getByRole('button', { name: 'Maxear a 300' }).click()
await p.waitForFunction(() => document.body.innerText.includes('Maxear a 300'))
check('maxear parcial: cobertura o falta de ruta, con SIN DATOS del trainer',
  await p.getByText(/SIN DATOS/).count() > 0
  && (await p.getByText(/% del tramo cubierto/).count() > 0
      || await p.getByText(/No hay ruta con precio/).count() > 0))
check('maxear parcial: sin alertas', await p.locator('[role="alert"]').count() === 0)
await cerrar()

// 7d) El toggle vuelve al plan rápido anterior (intacto).
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.paladinHorda, ...mercadoHerreria }))
await abrirVista(p, 'profesiones')
await p.getByRole('button', { name: 'Maxear a 300' }).click()
await p.getByText('Adquisición de recetas').first().waitFor()
await p.getByRole('button', { name: 'Plan rápido' }).click()
await p.getByText(/Plan de subida ·/).waitFor()
check('toggle de vuelta al plan rápido (comportamiento anterior intacto)',
  await p.getByText(/Plan de subida ·/).count() > 0)
await cerrar()

// 8) Recetas propias (Cocina, perfil cazadorHorda): la semilla declarada se marca, el
//    cambio se guarda y se relee, un estado guardado manda sobre la semilla y el filtro
//    «Ocultar las que tengo» esconde exactamente las marcadas.
const CLAVE_PROPIAS = PREF + 'recetas-propias'
const casillas = (pg) => pg.locator('tbody input[type="checkbox"]:checked').count()
const filasTabla = (pg) => pg.locator('tbody tr').count()

;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda }))
await abrirVista(p, 'profesiones')
await p.selectOption('#wf-profesion', '185')
await p.getByRole('radio', { name: /^Todas \(/ }).click()
await p.waitForFunction(() => /TIENES 25/i.test(document.body.innerText))
check('Cocina: la tarjeta declara las recetas propias y marca las 25 sembradas',
  await p.getByText(/tienes 25/i).count() > 0 && await casillas(p) === 25,
  { marcadas: await casillas(p) })

const antesQuitar = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), CLAVE_PROPIAS)
const sinSemilla = await p.locator('tbody input[type="checkbox"]:checked').first()
  .getAttribute('aria-label')
await p.locator('tbody input[type="checkbox"]:checked').first().click()
await p.waitForTimeout(60)
const guardado = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), CLAVE_PROPIAS)
check('desmarcar una receta la persiste en ctx.storage (24, con relectura)',
  await casillas(p) === 24 && guardado && guardado.v === 1 && guardado.spells.length === 24
  && antesQuitar === null,
  { guardado: guardado && guardado.spells.length, etiqueta: sinSemilla })

await cerrar()
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda, storage: { 'recetas-propias': guardado } }))
await abrirVista(p, 'profesiones')
await p.selectOption('#wf-profesion', '185')
await p.getByRole('radio', { name: /^Todas \(/ }).click()
await p.waitForFunction(() => !/TIENES 25/i.test(document.body.innerText))
check('lo guardado manda sobre la semilla al reabrir (24, no vuelve a 25)',
  await casillas(p) === 24 && await p.getByText(/tienes 24/i).count() > 0,
  { marcadas: await casillas(p) })
await cerrar()

;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda, storage: { 'recetas-propias': { v: 1, spells: [] } } }))
await abrirVista(p, 'profesiones')
await p.selectOption('#wf-profesion', '185')
await p.getByRole('radio', { name: /^Todas \(/ }).click()
await p.waitForTimeout(80)
check('un estado guardado vacío no siembra nada (ni marca ni ofrece ocultar)',
  await casillas(p) === 0 && await p.getByText(/tienes \d+/i).count() === 0
  && await p.getByLabel('Ocultar las que tengo').count() === 0)
await cerrar()

;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda }))
await abrirVista(p, 'profesiones')
await p.selectOption('#wf-profesion', '185')
await p.getByRole('radio', { name: /^Todas \(/ }).click()
await p.waitForFunction(() => /TIENES 25/i.test(document.body.innerText))
const nTodas = await filasTabla(p)
await p.getByLabel('Ocultar las que tengo').click()
await p.waitForTimeout(80)
const nOcultas = await filasTabla(p)
check('«Ocultar las que tengo» esconde exactamente las 25 marcadas',
  nTodas - nOcultas === 25 && nOcultas > 0 && await p.locator('[role="alert"]').count() === 0,
  { nTodas, nOcultas })
await cerrar()

// 9) Nivel de oficio declarado a mano (oficios.js): Pesca arranca en 93, el chip avisa
//    que no lo leyó el juego y un nivel escrito a mano lo pisa y persiste.
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.magoCielonato }))
await abrirVista(p, 'profesiones')
await p.selectOption('#wf-profesion', '356')
await p.waitForFunction(() => document.querySelector('#wf-skill-356') !== null)
check('Pesca arranca con el nivel declarado (93) y lo marca como tal',
  await p.inputValue('#wf-skill-356') === '93'
  && await p.getByText(/Declarado a mano/).count() > 0,
  { skill: await p.inputValue('#wf-skill-356') })
await escribirSkill(p, 356, 150)
await p.waitForTimeout(80)
check('un nivel escrito a mano pisa al declarado y persiste en ctx.storage',
  await p.evaluate((k) => JSON.parse(localStorage.getItem(k)) === 150, PREF + 'skill-356')
  && await p.evaluate(() => document.querySelector('#wf-skill-356').value) === '150', null)
check('sin el nivel declarado, el chip desaparece', await p.getByText(/Declarado a mano/).count() === 0)
check('sin errores ni alertas (nivel declarado)', await p.locator('[role="alert"]').count() === 0)
await cerrar()

// 10) Panel «Qué vender ahora»: cruza tus recetas con los precios, ordena por neto
//     tras 5% de subasta y reactivos comprados, y declara que son ofertas anunciadas.
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda, ...mercaCocina }))
await abrirVista(p, 'profesiones')
await p.selectOption('#wf-profesion', '185')
await p.getByRole('radio', { name: /^Todas \(/ }).click()
await p.waitForFunction(() => /Qué vender ahora/i.test(document.body.innerText))
const panel = p.locator('section', { hasText: 'Qué vender ahora' }).last()
const filasVenta = await panel.locator('[data-venta-fila]').count()
const primeraVenta = filasVenta ? await panel.locator('[data-venta-fila]').first().innerText() : ''
check('el panel de venta ordena por neto y pone primero el plato más rentable',
  filasVenta === 2 && /Atún blanco arco iris/.test(primeraVenta), { filasVenta, primeraVenta })
check('la segunda plaza es el pargo y el pececito en pérdida no entra',
  /Pargo de lodo boquilargo/.test(await panel.locator('[data-venta-fila]').last().innerText())
  && !/Pececito luminoso/.test(await panel.innerText()), null)
check('muestra las existencias listadas del plato', /\b700\b/.test(primeraVenta), { primeraVenta })
check('declara que son ofertas anunciadas y no ventas cerradas',
  await panel.getByText(/ofertas anunciadas, no de ventas cerradas/i).count() > 0)
check('sin errores ni alertas (panel de venta)', await p.locator('[role="alert"]').count() === 0)
await cerrar()

await a.terminar('vista-profesiones')
