// Valoración personal TSM (primera entrega descriptiva) en Chromium + React reales.
// Fixtures 100 % sintéticas, sin archivos del juego ni red. Cubre temas ES/EN,
// ancho estrecho, teclado en los desplegables, reemplazo/corrección/recorte/borrado,
// avance de reloj sin nueva importación y detalle Auctionator sin cruce TSM.
//   DESKTOP_PLUGIN=… PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/tsm-valoracion.mjs
import { iniciar, PERFILES } from './arnes.mjs'

const NOW_S = 1800000000                        // 2027-01-15T08:00:00Z, reloj controlado
const NOW_MS = NOW_S * 1000
const DAY = 86400
const TX = 'itemString,stackSize,quantity,price,otherPlayer,player,time,source'
const EX = 'itemString,stackSize,quantity,player,time'
const csv = (header, lines) => JSON.stringify([header, ...lines].join('\n'))
const venta = (itemString, qty, price, time, source = 'Auction') =>
  `${itemString},20,${qty},${price},PRIVATE_BUYER,PRIVATE_PLAYER,${time},${source}`

// Cinco días distintos, un registro por día: mediana de día = precio del día.
// Mediana entre días (peso igual): 140. q1 tipo 7 = 120, q3 = 160.
function fixtureTSM({ saltarDia = null, precioDia = null, qtyUltimo = 50 } = {}) {
  const dias = [[26, 10, 100], [19, 20, 120], [10, 30, 140], [3, 40, 160], [1, qtyUltimo, 180]]
  const sales = []
  for (const [age, qty, price] of dias) {
    if (age === saltarDia) continue
    sales.push(venta('i:2589', qty, precioDia && age === 10 ? precioDia : price, NOW_S - age * DAY))
  }
  sales.push(venta('i:2589', 5, 0, NOW_S - 2 * DAY))                       // cero → excluido
  sales.push(venta('i:2589', 7, 999, NOW_S + 60 * DAY))                    // futuro → excluido
  sales.push(venta('i:2589', 8, 90, NOW_S - 45 * DAY))                     // fuera de ventana
  sales.push(venta('i:2589', 9, 500, NOW_S - 5 * DAY, 'Trade'))            // no Auction
  sales.push(venta('i:2589:1:2', 12, 300, NOW_S - 2 * DAY))                // variante literal aparte
  return 'TradeSkillMasterDB={' +
    `["r@Prueba@internalData@csvSales"]=${csv(TX, sales)},` +
    `["r@Prueba@internalData@csvBuys"]=${csv(TX, [venta('i:2589', 10, 80, NOW_S - 4 * DAY, 'Auction')])},` +
    `["r@Prueba@internalData@csvExpired"]=${csv(EX, [`i:2589,20,60,PRIVATE_PLAYER,${NOW_S - 4 * DAY}`])},` +
    `["r@Prueba@internalData@csvCancelled"]=${csv(EX, [`i:2589,20,7,PRIVATE_PLAYER,${NOW_S - 4 * DAY}`])},` +
    `["r@Otro@internalData@csvSales"]=${csv(TX, [venta('i:2589', 99, 777, NOW_S - 2 * DAY)])}}`
}

const AUCTION = 'AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Prueba"]={version=2,' +
  '["2589"]={m=140,h={["2565"]=170,["2568"]=160},l={["2565"]=150,["2568"]=140},a={["2565"]=4,["2568"]=30}},' +
  '["2588"]={m=90,h={["2570"]=100},l={["2570"]=90},a={["2570"]=12}}}}'

const a = await iniciar()
const { check } = a
const filas = (p) => p.locator('[data-testid="valoracion-fila"]')
const texto = (p) => p.evaluate(() => document.body.innerText)

async function abrirMercado(tema, idioma) {
  const { p, cerrar } = await a.abrir(tema, { perfil: PERFILES.cazadorHorda, idioma })
  // Reloj controlado ANTES de montar Mercado: el estado local del panel usa Date.now().
  await p.clock.install({ time: new Date(NOW_MS) })
  await p.click('[data-tab="mercado"]')
  const panel = p.locator('[data-testid="tsm-panel"]')
  await panel.waitFor()
  await p.evaluate(({ tsm, auction }) => {
    window.carpetaConcedida = { name: 'SavedVariables', files: { 'TradeSkillMaster.lua': tsm, 'Auctionator.lua': auction } }
  }, { tsm: fixtureTSM(), auction: AUCTION })
  return { p, cerrar, panel }
}

async function importar(p, panel) {
  await panel.getByRole('button', { name: /Leer TradeSkillMaster\.lua|Read TradeSkillMaster\.lua/ }).first().click()
  await p.waitForFunction(() => /Importación TSM guardada|TSM import saved/.test(document.body.innerText))
}

// ---------------------------------------- ES/EN × claro/oscuro: contenido y desplegables
for (const tema of ['claro', 'oscuro']) {
  for (const idioma of ['es', 'en']) {
    const { p, cerrar, panel } = await abrirMercado(tema, idioma)
    const en = idioma === 'en'
    check(`${tema}/${idioma}: panel TSM disponible`,
      await panel.getByText(en ? 'No imported transactions' : 'Sin operaciones importadas').count() === 1)
    await importar(p, panel)
    await filas(p).first().waitFor()
    check(`${tema}/${idioma}: dos variantes literales, sin mezclar`, await filas(p).count() === 2)
    const primera = filas(p).first()
    const txt = await primera.innerText()
    check(`${tema}/${idioma}: resumen unidades/registros/días/última venta`,
      (en ? /1s 40c/ : /1p 40c/).test(txt) && /\b150\b/.test(txt) && /5/.test(txt) && /2027-01-14/.test(txt))
    check(`${tema}/${idioma}: vendidas excluye ceros/futuro/fuera de ventana/no Auction`,
      !/\b999c\b|\b9s 99c\b/.test(txt) && !/\b500\b/.test(txt))
    check(`${tema}/${idioma}: sin predicción ni beneficio`,
      !/predicción|prediction|beneficio|profit|demanda|demand/i.test(txt))
    check(`${tema}/${idioma}: importe registrado sin segundo descuento de comisión`,
      await primera.locator('[data-testid="valoracion-tipico"]').innerText() ===
        (en ? 'observed typical 1s 40c' : 'típico observado 1p 40c'))

    // Método y fuente nacen cerrados; se abren por teclado.
    const metodo = p.locator('[data-testid="valoracion-metodo"]').first()
    const fuente = p.locator('[data-testid="valoracion-fuente"]').first()
    check(`${tema}/${idioma}: método y fuente cerrados por defecto`,
      (await metodo.getAttribute('open')) === null && (await fuente.getAttribute('open')) === null)
    await p.locator('[data-testid="valoracion-metodo"] summary').first().focus()
    await p.keyboard.press('Enter')
    check(`${tema}/${idioma}: método se abre con Enter`, (await metodo.getAttribute('open')) !== null)
    const mt = await metodo.innerText()
    check(`${tema}/${idioma}: versión de método y políticas declaradas`,
      /v1/.test(mt) && /28/.test(mt) && /5/.test(mt) && /7/.test(mt) && /0[,.]5/.test(mt))
    check(`${tema}/${idioma}: modo historial/ventana etiquetado, sin predicción`,
      /histórico|history|ventana|window/.test(mt) && !/predicción|prediction|pronóstico|forecast/i.test(mt))
    await p.locator('[data-testid="valoracion-fuente"] summary').first().focus()
    await p.keyboard.press('Space')
    check(`${tema}/${idioma}: fuente se abre con Space`, (await fuente.getAttribute('open')) !== null)
    const ft = await fuente.innerText()
    check(`${tema}/${idioma}: fuente declara Auction y exclusiones diagnosticadas`,
      /Auction/.test(ft) && /0/.test(ft) && /i:2589/.test(ft))

    // Contabilidad previa: plegable, etiquetada todos los canales, fuera de la referencia.
    const contab = p.locator('[data-testid="tsm-contabilidad"]').first()
    check(`${tema}/${idioma}: contabilidad cerrada por defecto`, (await contab.getAttribute('open')) === null)
    await p.locator('[data-testid="tsm-contabilidad"] summary').first().focus()
    await p.keyboard.press('Enter')
    check(`${tema}/${idioma}: compras/expiradas/canceladas bajo todos los canales`,
      /todos los canales|all channels/.test(await contab.innerText()) && /60/.test(await contab.innerText()))
    check(`${tema}/${idioma}: sin compatibilidad acreditada con Auctionator`,
      /sin compatibilidad acreditada|no accredited compatibility/i.test(await panel.innerText()))
    await cerrar()
  }
}

// ---------------------------------------- búsqueda, paginación y ancho estrecho
{
  const { p, cerrar, panel } = await abrirMercado('claro', 'es')
  await importar(p, panel)
  await filas(p).first().waitFor()
  await panel.locator('input[aria-label="Buscar valoraciones"]').fill('i:2589:1:2')
  check('buscador por objeto filtra a la variante literal', await filas(p).count() === 1 &&
    /i:2589:1:2/.test(await filas(p).innerText()))
  await panel.locator('input[aria-label="Buscar valoraciones"]').fill('')
  const detallesFuente = p.locator('[data-testid="auctionator-panel"] details').first()
  await detallesFuente.locator('summary').focus()
  await p.keyboard.press('Enter')
  check('detalles de fuente/procedencia se abren con teclado', (await detallesFuente.getAttribute('open')) !== null)
  await p.setViewportSize({ width: 420, height: 900 })
  check('panel estrecho sin desbordar la página', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  check('lista con scroll local en estrecho', await p.locator('[data-testid="tsm-lista"]').evaluate((el) => getComputedStyle(el).overflowX === 'auto'))
  await cerrar()
}

// ---------------------------------------- reemplazo, corrección, recorte, borrado
{
  const { p, cerrar, panel } = await abrirMercado('claro', 'es')
  await importar(p, panel)
  await filas(p).first().waitFor()
  check('importación inicial: 150 unidades', /\b150\b/.test(await filas(p).first().innerText()))

  // Reemplazo: otra cantidad en el último día, sin duplicar filas.
  await p.evaluate((tsm) => { window.carpetaConcedida.files['TradeSkillMaster.lua'] = tsm }, fixtureTSM({ qtyUltimo: 70 }))
  await panel.getByRole('button', { name: 'Leer TradeSkillMaster.lua', exact: true }).click()
  await p.waitForFunction(() => /Importación TSM guardada/.test(document.body.innerText))
  await p.waitForFunction(() => /\b170\b/.test(document.querySelector('[data-testid="valoracion-fila"]').innerText))
  check('reemplazo actualiza unidades sin duplicar', await filas(p).count() === 2 && /\b170\b/.test(await filas(p).first().innerText()))

  // Corrección: cambiar el precio del día central mueve la mediana 140 → 160.
  await p.evaluate((tsm) => { window.carpetaConcedida.files['TradeSkillMaster.lua'] = tsm }, fixtureTSM({ precioDia: 300, qtyUltimo: 70 }))
  await panel.getByRole('button', { name: 'Leer TradeSkillMaster.lua', exact: true }).click()
  await p.waitForFunction(() => /1p 60c/.test(document.querySelector('[data-testid="valoracion-fila"]').innerText))
  check('corrección de precio recalcula la mediana descriptiva', /1p 60c/.test(await filas(p).first().innerText()))

  // Recorte: cuatro días distintos → evidencia insuficiente con motivo explícito.
  await p.evaluate((tsm) => { window.carpetaConcedida.files['TradeSkillMaster.lua'] = tsm }, fixtureTSM({ saltarDia: 26, precioDia: 300, qtyUltimo: 70 }))
  await panel.getByRole('button', { name: 'Leer TradeSkillMaster.lua', exact: true }).click()
  await p.waitForFunction(() => /sin evidencia suficiente/.test(document.body.innerText))
  check('recorte a 4 días marca insuficiente y muestra reason',
    /sin evidencia suficiente/.test(await filas(p).first().innerText()) &&
    /insufficient-days/.test(await filas(p).first().innerText()))

  check('muestra insuficiente conserva mediana descriptiva disponible',
    /1p 70c/.test(await filas(p).first().innerText()))
  const metodo = filas(p).first().locator('[data-testid="valoracion-metodo"]')
  await metodo.locator('summary').click()
  check('método explica ponderación por unidades e igual peso entre días',
    /unidades/.test(await metodo.innerText()) && /mismo peso/.test(await metodo.innerText()))
  const fuente = filas(p).first().locator('[data-testid="valoracion-fuente"]')
  await fuente.locator('summary').click()
  check('histórico descriptivo disponible además de ventana, sin llamarlo seguimiento',
    /Histórico completo/.test(await fuente.innerText()) && /i:2589/.test(await fuente.innerText()))
  check('sincronización secundaria cerrada por defecto',
    await panel.locator('[data-testid="tsm-sincronizacion"]').count() === 1 &&
    await panel.locator('[data-testid="tsm-sincronizacion"]').getAttribute('open') === null)

  // Borrado: sin filas, sin datos TSM residuales.
  await panel.getByRole('button', { name: 'Borrar historial TSM', exact: true }).click()
  await panel.getByRole('button', { name: 'Confirmar borrado TSM', exact: true }).click()
  await panel.getByText('Sin operaciones importadas', { exact: true }).waitFor()
  check('borrado retira todas las valoraciones', await filas(p).count() === 0)
  await cerrar()
}

// ---------------------------------------- reloj avanza sin nueva importación
{
  const { p, cerrar, panel } = await abrirMercado('claro', 'es')
  await importar(p, panel)
  await filas(p).first().waitFor()
  const lecturasAntes = await p.evaluate(() => window.lecturas.length)
  const antes = await filas(p).first().innerText()
  check('última venta antes del avance', /hace 1 día/.test(antes))
  await p.clock.fastForward(8 * DAY * 1000)
  await p.waitForFunction(() => /hace 9 días/.test(document.querySelector('[data-testid="valoracion-fila"]').innerText))
  const despues = await filas(p).first().innerText()
  check('fecha/antigüedad se refrescan sin nueva importación', /hace 9 días/.test(despues))
  check('avance de reloj no reimporta', await p.evaluate((n) => window.lecturas.length === n, lecturasAntes))
  check('ventana vencida explica reason stale', /stale/.test(despues) && /sin evidencia suficiente/.test(despues))
  await cerrar()
}

// ---------------------------------------- detalle Auctionator sin cruce TSM
{
  const { p, cerrar, panel } = await abrirMercado('claro', 'es')
  await importar(p, panel)
  await filas(p).first().waitFor()
  await p.getByRole('button', { name: 'Leer Auctionator.lua', exact: true }).click()
  await p.waitForFunction(() => /Importación guardada/.test(document.body.innerText))
  await p.getByRole('button', { name: 'Paño de lino' }).first().click()
  await p.getByText('Último mínimo anunciado').first().waitFor()
  const detalle = p.locator('[data-testid="detalle-tsm"]')
  await detalle.waitFor()
  check('detalle declara sin compatibilidad acreditada',
    /sin compatibilidad acreditada/i.test(await detalle.innerText()))
  check('detalle muestra fecha/antigüedad y oferta máxima diaria, no stock',
    /2027-01-12|12\/01\/2027/.test(await texto(p)) && /oferta máxima diaria/i.test(await texto(p)) &&
    /\b30\b/.test(await texto(p)))
  check('detalle anuncia que son anuncios, no ventas', /anuncios, no ventas/.test(await texto(p)))
  const consulta = p.locator('[data-testid="detalle-tsm-consulta"]')
  check('consulta TSM separada cerrada por defecto', (await consulta.getAttribute('open')) === null)
  const antesDetalle = await detalle.innerText()
  check('detalle no trae cifras TSM por nombre de reino o ID base',
    await p.locator('[data-testid="detalle-tsm-valoracion"]').count() === 0 &&
    !/1p 40c|3p(?:\s|$)/.test(antesDetalle) &&
    await p.locator('[data-testid="detalle-tsm-reino"]').inputValue() === '' &&
    await p.locator('[data-testid="detalle-tsm-item"]').inputValue() === '')
  await p.locator('[data-testid="detalle-tsm-consulta"] summary').focus()
  await p.keyboard.press('Enter')
  check('consulta se abre con Enter', (await consulta.getAttribute('open')) !== null)
  check('sin preselección equivalente', (await p.locator('[data-testid="detalle-tsm-item"]').inputValue()) === '')
  await p.locator('[data-testid="detalle-tsm-reino"]').selectOption('Prueba')
  await p.locator('[data-testid="detalle-tsm-item"]').selectOption('i:2589:1:2')
  await p.locator('[data-testid="detalle-tsm-valoracion"]').waitFor()
  check('consulta explícita muestra solo la variante elegida',
    /i:2589:1:2/.test(await p.locator('[data-testid="detalle-tsm-valoracion"]').innerText()) &&
    !/1p 40c/.test(await p.locator('[data-testid="detalle-tsm-valoracion"]').innerText()))
  check('la consulta no crea equivalencia', /no crea equivalencia|sin equivalencia/.test(await consulta.innerText()))
  const anuncioAntes = await p.locator('[data-testid="detalle-anuncios"]').innerText()
  const lecturasAntes = await p.evaluate(() => window.lecturas.length)
  await p.clock.fastForward(8 * DAY * 1000)
  check('reloj del detalle actualiza anuncios y consulta TSM sin reimportar',
    await p.locator('[data-testid="detalle-anuncios"]').innerText() !== anuncioAntes &&
    /hace 10 días/.test(await p.locator('[data-testid="detalle-tsm-valoracion"]').innerText()) &&
    await p.evaluate((n) => window.lecturas.length === n, lecturasAntes))

  // El borrado invalida también la selección que habilitó la consulta separada.
  await panel.getByRole('button', { name: 'Borrar historial TSM', exact: true }).click()
  await panel.getByRole('button', { name: 'Confirmar borrado TSM', exact: true }).click()
  await panel.getByText('Sin operaciones importadas', { exact: true }).waitFor()
  check('borrar TSM retira la consulta del detalle',
    await p.locator('[data-testid="detalle-tsm-valoracion"]').count() === 0)
  await importar(p, panel)
  await filas(p).first().waitFor()
  check('reimportar tras borrar exige nueva selección manual TSM',
    await p.locator('[data-testid="detalle-tsm-valoracion"]').count() === 0 &&
    await p.locator('[data-testid="detalle-tsm-reino"]').inputValue() === '' &&
    await p.locator('[data-testid="detalle-tsm-item"]').inputValue() === '')
  await cerrar()
}

await a.terminar('tsm-valoracion')
console.log(`${a.estado.pasadas} checks`)
