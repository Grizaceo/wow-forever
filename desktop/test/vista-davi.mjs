// Prueba de «Preguntar a DAVI» con el arnés: el botón está en las tres pestañas, la vista
// previa lleva solo el contexto elegido, los conmutadores excluyen/incluyen perfil y
// precios, y al confirmar inserta con host.composer.insertText(null, texto, {mode:'block'}).
// Si no se puede insertar, cae al portapapeles; si eso falla, el texto queda seleccionable.
//   CHROMIUM_PATH=… node desktop/test/vista-davi.mjs
import { iniciar, PERFILES } from './arnes.mjs'

// Mercado mínimo con un ítem (Paño de lino 2589) y su historial de un día.
const MERCADO = {
  storage: { 'market-pointer': { slot: 'a', revision: 1 } },
  archivos: { 'market-a.json': JSON.stringify({ revision: 1, values: {
    realm: 'Prueba',
    snapshot: { schemaVersion: 1, sourceVersion: 8, importedAt: '2026-11-10T12:00:00.000Z', warnings: [],
      realms: [{ name: 'Prueba', items: [
        { sourceKey: '2589', itemId: 2589, unitPriceCopper: 120, observedDay: 2140,
          history: [{ day: 2140, low: 120, high: 130, available: 20 }] },
      ] }] } },
  }) },
}

const a = await iniciar()
const { check } = a
const panelDe = (p) => p.locator('section').filter({ has: p.locator('#wf-davi-pregunta') })
const textoDe = async (panel) => panel.locator('textarea').inputValue()

/* ---------------------------------------------------------- 1) Personaje */
{
  const { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.paladinHorda })
  const antes = await p.evaluate(() => Object.keys(localStorage).sort())
  await p.getByRole('button', { name: 'Preguntar a DAVI' }).click()
  await p.getByText('Vista previa').first().waitFor()
  const panel = panelDe(p)
  const texto = await textoDe(panel)
  check('personaje: el botón abre el panel con solo el perfil', /Horda/.test(texto) && /nivel 24/.test(texto) && /Paladín/.test(texto), texto.slice(0, 140))
  check('personaje: la pregunta viene precargada', (await p.locator('#wf-davi-pregunta').inputValue()).includes('personaje'))
  check('personaje: dice que el perfil no es el juego en vivo', /no es el estado del juego en vivo/.test(texto))
  check('personaje: avisa que no incluye Auctionator.lua', /No se incluye el historial completo/.test(texto))
  check('personaje: la procedencia va en el texto', /data\/personaje\.json/.test(texto))
  check('personaje: no inserta nada antes de confirmar', await p.evaluate(() => !window.insertadas || window.insertadas.length === 0))
  check('personaje: no hay conmutador de precios sin mercado', await panel.getByText('Incluir precios y ofertas').count() === 0)

  await panel.getByText('Incluir el perfil').click()
  await p.waitForTimeout(50)
  const sinPerfil = await textoDe(panel)
  check('personaje: quitar el perfil quita el nivel de la vista previa', !/nivel 24/.test(sinPerfil) && /Pregunta a DAVI/.test(sinPerfil))
  check('personaje: al quitar el perfil quedan límites y procedencia', /no es el estado del juego en vivo/.test(sinPerfil) && /data\/personaje\.json/.test(sinPerfil))

  await p.locator('#wf-davi-pregunta').fill('¿Subo herrería o minería?')
  await p.waitForTimeout(50)
  check('personaje: la pregunta se edita en la vista previa', (await textoDe(panel)).includes('¿Subo herrería o minería?'))

  await panel.getByText('Incluir el perfil').click()
  await p.waitForTimeout(50)
  await panel.getByRole('button', { name: 'Insertar en el chat' }).click()
  await p.waitForFunction(() => window.insertadas && window.insertadas.length === 1)
  const ins = await p.evaluate(() => window.insertadas[0])
  check('personaje: inserta con null + mode block y el contexto', ins.sessionId === null && ins.opts?.mode === 'block'
    && /nivel 24/.test(ins.text) && /¿Subo herrería/.test(ins.text), ins)
  check('personaje: no usó el portapapeles al poder insertar', await p.evaluate(() => !window.copiados))
  check('personaje: tras insertar, el botón queda deshabilitado', await panel.getByRole('button', { name: 'Insertar en el chat' }).isDisabled())
  await p.waitForTimeout(200)
  check('personaje: no inserta dos veces', await p.evaluate(() => window.insertadas.length === 1))
  const despues = await p.evaluate(() => Object.keys(localStorage).sort())
  check('personaje: no escribió almacenamiento nuevo', JSON.stringify(antes) === JSON.stringify(despues), { antes, despues })
  await cerrar()
}

/* ---------------------------------------------------------- Inserción pendiente */
{
  const { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.paladinHorda })
  await p.evaluate(() => { window.insertarDemora = true })
  const abrir = p.getByRole('button', { name: 'Preguntar a DAVI', exact: true })
  await abrir.click()
  const panel = panelDe(p)
  await panel.getByRole('button', { name: 'Insertar en el chat', exact: true }).click()
  await p.waitForFunction(() => typeof window.resolverInsercion === 'function')
  check('pendiente: no permite reabrir ni reiniciar el bloqueo', await abrir.isDisabled())
  check('pendiente: no permite cerrar ni editar el texto en tránsito',
    await panel.getByRole('button', { name: 'Cerrar', exact: true }).isDisabled()
    && await p.locator('#wf-davi-pregunta').isDisabled())
  check('pendiente: bloquea los conmutadores del contexto', await panel.getByRole('checkbox').first().isDisabled())
  await p.evaluate(() => window.resolverInsercion())
  await p.waitForFunction(() => document.body.innerText.includes('Insertado en el chat.'))
  check('pendiente: solo hubo una inserción', await p.evaluate(() => window.insertadas.length === 1))
  await cerrar()
}

/* ---------------------------------------------------------- 2) Profesiones */
{
  const { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.paladinHorda, ...MERCADO })
  await p.click('[data-tab="profesiones"]')
  await p.getByText('Entrenadores').first().waitFor()
  await p.selectOption('#wf-profesion', '129')
  await p.waitForFunction(() => document.body.innerText.includes('Venda de lino'))
  await p.locator('tr').filter({ hasText: 'Venda de lino' }).filter({ hasText: '1p 20c' }).click()
  await p.getByRole('button', { name: 'Preguntar a DAVI' }).click()
  await p.getByText('Vista previa').first().waitFor()
  const panel = panelDe(p)
  const texto = await textoDe(panel)
  check('profesiones: adjunta la profesión y la receta elegida', /Primeros auxilios/.test(texto) && /Receta: Venda de lino/.test(texto), texto.slice(0, 200))
  check('profesiones: adjunta solo los reactivos de esa receta', /Reactivo: 1 × Paño de lino/.test(texto))
  check('profesiones: con mercado adjunta el costo de la subasta', /Costo de reactivos: 1p 20c/.test(texto))
  check('profesiones: dice que no son ventas', /no ventas/.test(texto))
  check('profesiones: precios con reino e importación verificables', /Reino: Prueba/.test(texto) && /2026-11-10T12:00:00.000Z/.test(texto))
  check('profesiones: fecha observada del reactivo, no fecha inventada', /2589.*2140/.test(texto))
  check('profesiones: no vuelca el historial bruto', !/low|high/.test(texto))

  await panel.getByText('Incluir precios y ofertas').click()
  await p.waitForTimeout(50)
  const sinPrecios = await textoDe(panel)
  check('profesiones: quitar precios quita el costo y deja la receta', !/Costo de reactivos/.test(sinPrecios) && /Reactivo: 1 × Paño de lino/.test(sinPrecios))

  // La instantánea se congela al abrir: cambiar la profesión con el panel abierto no la toca.
  const congelada = await textoDe(panel)
  await p.selectOption('#wf-profesion', '164')
  await p.waitForTimeout(120)
  check('profesiones: la vista previa es una copia fija al abrir', (await textoDe(panel)) === congelada)
  await cerrar()
}

/* ------------------------------------------- 3) Profesiones sin mercado */
{
  const { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.paladinHorda })
  await p.click('[data-tab="profesiones"]')
  await p.getByText('Entrenadores').first().waitFor()
  await p.selectOption('#wf-profesion', '129')
  await p.waitForFunction(() => document.body.innerText.includes('Venda de lino'))
  await p.locator('tr').filter({ hasText: 'Venda de lino' }).first().click()
  await p.getByRole('button', { name: 'Preguntar a DAVI' }).click()
  await p.getByText('Vista previa').first().waitFor()
  const panel = panelDe(p)
  const texto = await textoDe(panel)
  check('profesiones sin mercado: no hay bloque de precios', !/Costo de reactivos/.test(texto) && await panel.getByText('Incluir precios y ofertas').count() === 0)
  check('profesiones sin mercado: la receta y los reactivos siguen ahí', /Receta: Venda de lino/.test(texto) && /Reactivo: 1 × Paño de lino/.test(texto))
  await cerrar()
}

/* -------------------------------------------------------------- 4) Mercado */
{
  const { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.paladinHorda, ...MERCADO })
  await p.click('[data-tab="mercado"]')
  await p.getByText('Paño de lino').first().waitFor()
  check('mercado: sin ítem de detalle no hay botón', await p.getByRole('button', { name: 'Preguntar a DAVI' }).count() === 0)
  await p.getByRole('button', { name: 'Paño de lino' }).first().click()
  await p.getByText('Historial diario').first().waitFor()
  check('mercado: con un ítem de detalle aparece el botón', await p.getByRole('button', { name: 'Preguntar a DAVI' }).count() === 1)
  await p.getByRole('button', { name: 'Preguntar a DAVI' }).click()
  await p.getByText('Vista previa').first().waitFor()
  const panel = panelDe(p)
  const texto = await textoDe(panel)
  check('mercado: identifica el ítem y su día observado', /Paño de lino/.test(texto) && /Día observado:/.test(texto), texto.slice(0, 200))
  check('mercado: trae el último mínimo y la oferta máxima', /Último mínimo anunciado:/.test(texto) && /Oferta máxima diaria observada: 20/.test(texto))
  check('mercado: distingue ofertas de ventas', /ofertas anunciadas/.test(texto) && /no ventas/.test(texto))
  check('mercado: dice que la referencia es Classic, no Forever', /no verificada en Forever/.test(texto))
  check('mercado: cita la procedencia y el import', /Auctionator\.lua/.test(texto) && /Importado: 2026-11-10/.test(texto))
  check('mercado: no vuelca el historial bruto', !/low|high|available/.test(texto))

  await panel.getByText('Incluir precios y ofertas').click()
  await p.waitForTimeout(50)
  const sinPrecios = await textoDe(panel)
  check('mercado: quitar precios quita el precio y deja la identidad', !/Último mínimo anunciado/.test(sinPrecios) && /Paño de lino/.test(sinPrecios) && /Día observado:/.test(sinPrecios))
  await panel.getByText('Incluir precios y ofertas').click()
  await p.waitForTimeout(50)
  await panel.getByRole('button', { name: 'Insertar en el chat' }).click()
  await p.waitForFunction(() => window.insertadas && window.insertadas.length === 1)
  const ins = await p.evaluate(() => window.insertadas[0])
  check('mercado: inserta el contexto del ítem', ins.sessionId === null && ins.opts?.mode === 'block' && /Paño de lino/.test(ins.text) && /no ventas/.test(ins.text), ins)
  await cerrar()
}

/* ------------------------------------------------- 5) Fallback de portapapeles */
{
  const { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.paladinHorda })
  await p.evaluate(() => { window.insertarOk = false })
  await p.getByRole('button', { name: 'Preguntar a DAVI' }).click()
  await p.getByText('Vista previa').first().waitFor()
  const panel = panelDe(p)
  const texto = await textoDe(panel)
  await panel.getByRole('button', { name: 'Insertar en el chat' }).click()
  await p.getByText('el texto quedó en el portapapeles').first().waitFor()
  check('fallback: insertText=false cae al portapapeles', (await p.evaluate(() => window.copiado)).includes('nivel 24'), await p.evaluate(() => window.copiado))
  check('fallback: avisa que pegue en el chat', await p.getByText(/Pégalo en el chat/).count() > 0)
  check('fallback: no insertó en el chat', await p.evaluate(() => window.insertadas.length === 1))
  await cerrar()
}
{
  const { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.paladinHorda })
  await p.evaluate(() => { window.insertarLanza = true })
  await p.getByRole('button', { name: 'Preguntar a DAVI' }).click()
  await p.getByText('Vista previa').first().waitFor()
  const panel = panelDe(p)
  await panel.getByRole('button', { name: 'Insertar en el chat' }).click()
  await p.getByText(/Pégalo en el chat/).first().waitFor()
  check('fallback: insertText que lanza también cae al portapapeles', (await p.evaluate(() => window.copiado)).includes('nivel 24'))
  await cerrar()
}
{
  const { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.paladinHorda })
  await p.evaluate(() => { window.insertarOk = false; window.portapapelesOk = false })
  await p.getByRole('button', { name: 'Preguntar a DAVI' }).click()
  await p.getByText('Vista previa').first().waitFor()
  const panel = panelDe(p)
  await panel.getByRole('button', { name: 'Insertar en el chat' }).click()
  await p.getByText('Selecciona el texto de la vista previa').first().waitFor()
  check('manual: si tampoco copia, pide copia manual', await p.getByText(/cópialo a mano/).count() > 0)
  check('manual: el texto sigue seleccionable', await panel.locator('textarea').evaluate((el) => getComputedStyle(el).userSelect === 'text'))
  check('manual: no insertó y el portapapeles quedó marcado como fallido', await p.evaluate(() => window.insertadas.length === 1 && window.copiados === 1))
  await cerrar()
}

/* ------------------------------------------------------------ 6) Inglés */
{
  const { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.paladinHorda })
  await p.getByRole('radio', { name: 'EN' }).click()
  await p.getByRole('button', { name: 'Ask DAVI' }).click()
  await p.getByText('Preview').first().waitFor()
  const panel = panelDe(p)
  const texto = await textoDe(panel)
  check('inglés: el botón y la vista previa salen en inglés', /What should I do with my character/.test(texto) && /Hand-entered profile/.test(texto))
  await panel.getByRole('button', { name: 'Insert into chat' }).click()
  await p.waitForFunction(() => window.insertadas && window.insertadas.length === 1)
  check('inglés: inserta igual', await p.evaluate(() => window.insertadas.length === 1))
  await cerrar()
}

await a.terminar('vista-davi')
