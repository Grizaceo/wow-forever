// Prueba de la sección Profesiones con el arnés: entrenadores de la facción del
// perfil, skill guardado que cambia las recetas aprendibles, costos con mercado
// precargado, otra profesión del perfil y ambos temas sin errores.
//   PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/vista-profesiones.mjs
import { iniciar, PERFILES, PREF, TEMAS } from './arnes.mjs'

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

const a = await iniciar()
const { check } = a
const cuentaAprendibles = (p) => p.evaluate(() => {
  const m = /Aprendibles ahora \((\d+)\)/.exec(document.body.innerText)
  return m ? Number(m[1]) : null
})

// 1) Paladín no-muerto (Herrería + Minería) en tema claro con mercado: entrenadores
//    de la Horda primero (las del perfil encabezan el selector).
let { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.paladinHorda, ...MERCADO })
await p.click('[data-tab="profesiones"]')
await p.getByText('Entrenadores').first().waitFor()
check('Herrería es la profesión por defecto (primera del perfil)', await p.evaluate(() =>
  document.querySelector('#wf-profesion').value === '164'))
check('ve entrenadores de la Horda (Herrería)', await p.getByText('Brikk Keencraft').count() > 0
  && await p.getByText('Karn Stonehoof').count() > 0)
// Snarl (herrería) está en Orgrimmar, no en Azshara: el NPC va a la zona más chica que lo contiene.
check('los entrenadores muestran zona y coordenadas', await p.getByText('Orgrimmar').count() > 0
  && await p.getByText('79.6%, 23.3%').count() > 0 && await p.getByText('Cima del Trueno').count() > 0)
check('la tarjeta de plan existe y se marca como estimación', await p.getByText('Plan de subida').count() > 0
  && await p.getByText(/Estimación/).count() > 0)

// 2) El skill guardado cambia las recetas aprendibles.
const antes = await cuentaAprendibles(p)
await p.fill('#wf-skill-164', '300')
await p.waitForFunction(() => /Aprendibles ahora \(4\d\d\)/.test(document.body.innerText) || document.body.innerText.includes('Aprendibles ahora (3'))
const despues = await cuentaAprendibles(p)
check('cambiar el skill cambia las aprendibles', antes !== null && despues !== null && antes !== despues,
  { antes, despues })
check('el skill quedó guardado en ctx.storage', await p.evaluate((k) =>
  JSON.parse(localStorage.getItem(k)) === 300, PREF + 'skill-164'))
await p.fill('#wf-skill-164', '1')
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
await p.click('[data-tab="profesiones"]')
await p.getByText('Sin precios de mercado').waitFor()
await p.getByRole('button', { name: 'Importar precios en Mercado' }).click()
await p.waitForTimeout(80)
check('sin mercado, el botón navega a la pestaña Mercado', await p.evaluate(() =>
  document.querySelector('[data-tab="mercado"]').getAttribute('aria-selected') === 'true'))
await cerrar()

// 5) Chamán enano con Alquimia (perfil del arnés): entrenadores de la Alianza.
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.chamanAlianza }))
await p.click('[data-tab="profesiones"]')
await p.getByText('Entrenadores').first().waitFor()
check('Alquimia por defecto y entrenadores de la Alianza', await p.evaluate(() =>
  document.querySelector('#wf-profesion').value === '171')
  && await p.getByText('Alchemist Mallory').count() > 0)
await cerrar()

// 6) Temas claro y oscuro: la sección se pinta y el color de dificultad sigue al tema.
for (const tema of ['claro', 'oscuro']) {
  ;({ p, cerrar } = await a.abrir(tema, { perfil: PERFILES.cazadorHorda }))
  await p.click('[data-tab="profesiones"]')
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

await a.terminar('vista-profesiones')
