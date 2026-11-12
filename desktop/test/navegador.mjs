// Prueba general de la página (shell, perfil, migración, pestañas, temas). Cada sección tiene
// además su propio desktop/test/vista-*.mjs con el mismo arnés.
//   PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/navegador.mjs
import path from 'node:path'
import { iniciar, PERFILES, PREF } from './arnes.mjs'

const a = await iniciar()
const { check } = a

// 1) Estado de la guía anterior: Chamán de la Alianza nivel 33. Debe migrarse sin perder nada.
let { p, cerrar } = await a.abrir('claro', { build: JSON.stringify({ v: 3, cls: 'shaman', fac: 'alliance', lvl: 33, owned: ['x'] }) })
check('registra barra lateral, ruta y paleta', await p.evaluate(() => ['nav', 'routes', 'palette'].every((x) => registrado.some((v) => v.area === x))))
check('la ruta es /wow-forever', await p.evaluate(() => registrado.find((v) => v.area === 'nav').data.path === '/wow-forever'))
await p.getByText('Raza').first().waitFor()
check('migra clase, facción y nivel de la guía anterior', await p.evaluate(() => /Enano · Chamán · Nv 33 · Alianza/.test(document.body.innerText)))
check('avisa que la raza se supuso', await p.getByText('no guardaba tu raza').count() === 1)
check('el progreso anterior sigue intacto', await p.evaluate((k) => JSON.parse(JSON.parse(localStorage.getItem(k))).owned[0] === 'x', PREF + 'build'))

// 2) Paladín no-muerto (combinación nueva de Forever).
await p.selectOption('#wf-faccion', 'horda')
await p.selectOption('#wf-clase', '2')
await p.waitForFunction(() => document.querySelector('#wf-raza') && document.querySelector('#wf-raza').value === '5')
await p.fill('#wf-nivel', '24')
await p.waitForFunction(() => /Guardado/.test(document.body.innerText))
const perfil = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), PREF + 'perfil')
check('guarda un perfil válido de una combinación nueva', perfil.raza === 5 && perfil.clase === 2 && perfil.faccion === 'horda' && perfil.nivel === 24, perfil)
check('marca la combinación como nueva de Forever', await p.getByText('Combinación nueva de Forever').count() > 0)
await p.getByRole('button', { name: 'Copiar perfil para el agente' }).click()
await p.getByText('Copiado. Pégalo en el chat de Hermes.').waitFor()
check('copia el perfil para el agente con ctx.os.writeClipboard', await p.evaluate(() =>
  window.copiado === 'Mi personaje de WoW Forever (plugin wow-forever): Horda · No-muerto (Undead, raza 5) · Paladín (Paladin, clase 2) · nivel 24'), await p.evaluate(() => window.copiado))

// 3) Clase: hueco de entrenadores dicho; hechizos listados.
await p.click('[data-tab="clase"]')
await p.getByText('Hechizos de entrenador').waitFor()
check('Paladín de la Horda: el hueco de entrenadores se dice', await p.getByText('Sin datos:').count() > 0)
check('lista hechizos de entrenador', await p.locator('table tbody tr').count() > 0)
check('la columna de nombres se titula Hechizo, no Clase', await p.getByRole('columnheader', { name: 'Hechizo', exact: true }).count() === 1)
await cerrar()

// 4) Cada pestaña se pinta sin errores, en claro y oscuro; idioma inglés.
for (const tema of ['claro', 'oscuro']) {
  ;({ p, cerrar } = await a.abrir(tema, { perfil: PERFILES.cazadorHorda }))
  const pestanas = await p.locator('[role="tab"]').evaluateAll((els) => els.map((e) => e.dataset.tab))
  check(tema + ': con Cazador de la Horda hay guía curada', pestanas.includes('guia'), pestanas)
  for (const id of pestanas) {
    await p.click(`[data-tab="${id}"]`)
    await p.waitForTimeout(80)
    check(tema + ': pestaña ' + id + ' se pinta', await p.evaluate(() => document.body.innerText.length > 40) && !(await p.locator('[role="alert"]').count()))
  }
  check(tema + ': no ensucia window con globales de la guía', await p.evaluate(() =>
    ['HunterMarket', 'HunterHistory', 'HunterDeals', 'HunterChart', 'HunterFarm', 'HunterDropData', 'HunterMarketCatalog',
     'GUIDE_HUNTER', 'GUIDE_WARRIOR', 'GUIDE_SHAMAN', 'GUIDE_LEGACY'].every((k) => !(k in window))))
  if (process.env.CAPTURAS) await p.screenshot({ path: path.join(process.env.CAPTURAS, 'wow-forever-' + tema + '.png') })
  await cerrar()
}
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.magoCielonato }))
await p.getByRole('radio', { name: 'EN' }).click()
check('en inglés: la interfaz y los nombres cambian', await p.evaluate(() => /High Order Skyborne · Mage/.test(document.body.innerText) && /Character/.test(document.body.innerText)))
check('Cielonato sin guía curada: no aparece la pestaña', await p.locator('[data-tab="guia"]').count() === 0)
await cerrar()

await a.terminar('desktop')
