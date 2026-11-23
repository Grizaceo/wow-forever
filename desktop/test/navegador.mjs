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

// 3) Clase: hueco de entrenadores dicho; hechizos listados con su alcance declarado.
await p.click('[data-tab="clase"]')
// El contrato P0 cambió la etiqueta: ya no hay «Hechizos de entrenador». Se localiza
// por `data-tarjeta` (contrato estable) y se comprueba la semántica, no solo que
// la tarjeta exista: los hechizos son DE CLASE (no por facción) y el hueco de
// entrenadores (sí por facción) se dice con su motivo.
await p.locator('[data-tarjeta="clase-hechizos"]').waitFor()
const tarjetaHechizos = p.locator('[data-tarjeta="clase-hechizos"]')
const tarjetaEntrenadores = p.locator('[data-tarjeta="clase-entrenadores"]')
const textoEntrenadores = await tarjetaEntrenadores.innerText()
check('Paladín de la Horda: el hueco de entrenadores se dice', /Sin datos:/i.test(textoEntrenadores) &&
  /Motivo declarado:/i.test(textoEntrenadores))
const textoHechizos = await tarjetaHechizos.innerText()
check('lista hechizos de clase, no de entrenador', await tarjetaHechizos.locator('tbody tr').count() > 0 &&
  /hechizos de clase/i.test(textoHechizos) && /no por facción/i.test(textoHechizos))
check('la columna de nombres se titula Hechizo, no Clase', await p.getByRole('columnheader', { name: 'Hechizo', exact: true }).count() === 1)
await cerrar()

// 4) Navegación en dos niveles, idioma por defecto y vistas en claro y oscuro.
const principales = ['personaje', 'mercado', 'otros']
const ids = (p, nombre) => p.getByRole('tablist', { name: nombre, exact: true }).getByRole('tab')
  .evaluateAll(els => els.map(e => e.dataset.tab))
const elegir = (p, id) => p.click(`[data-tab="${id}"]`)
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda, idioma: null }))
await p.locator('#wf-raza').waitFor()
check('inglés por defecto y orden de navegación principal', (await p.getByRole('tablist', {name: 'Main sections'}).getByRole('tab').allTextContents()).join('|') === 'Character|Market|Others and Configuration')
await elegir(p, 'otros')
check('configuración abre desde Others', await p.getByRole('radio', { name: 'ES' }).isVisible())
await p.getByRole('radio', { name: 'ES' }).click()
const config = p.getByRole('tab', { name: 'Configuración', exact: true, selected: true })
await config.waitFor()
check('cambia el idioma en el lugar', (await ids(p, 'Secciones principales')).join() === principales.join())
await p.getByRole('button', { name: 'Recargar datos' }).click()
check('recargar datos no cambia la sección', await config.isVisible())
await cerrar()
for (const tema of ['claro', 'oscuro']) {
  ;({ p, cerrar } = await a.abrir(tema, { perfil: PERFILES.cazadorHorda }))
  await p.locator('#wf-raza').waitFor()
  check(tema + ': solo tres secciones principales', (await ids(p, 'Secciones principales')).join() === principales.join())
  for (const [grupo, etiqueta, hojas] of [
    ['personaje', 'Secciones de Personaje', ['perfil', 'ruta', 'clase', 'profesiones']],
    ['mercado', null, ['mercado']],
    ['otros', 'Otras secciones', ['dungeons', 'guia', 'legacy', 'configuracion']],
  ]) {
    await elegir(p, grupo)
    if (etiqueta) check(tema + ': orden interno de ' + grupo, (await ids(p, etiqueta)).join() === hojas.join())
    for (const id of hojas) {
      if (etiqueta) await elegir(p, id)
      const tab = p.locator(`[data-tab="${id}"]`)
      const panel = p.locator(`[id="${await tab.getAttribute('aria-controls')}"]`)
      check(tema + ': ' + id + ' activa un panel visible', await tab.getAttribute('aria-selected') === 'true' && await panel.isVisible() && !(await panel.locator('[role="alert"]').count()))
    }
  }
  check(tema + ': no ensucia window con globales de la guía', await p.evaluate(() =>
    ['HunterMarket', 'HunterHistory', 'HunterDeals', 'HunterChart', 'HunterFarm', 'HunterDropData', 'HunterMarketCatalog',
     'GUIDE_HUNTER', 'GUIDE_WARRIOR', 'GUIDE_SHAMAN', 'GUIDE_LEGACY'].every((k) => !(k in window))))
  await p.setViewportSize({ width: 375, height: 700 })
  check(tema + ': la navegación cabe en ventana angosta', await p.getByRole('tablist').evaluateAll(lists => lists.every(el => el.scrollWidth <= el.clientWidth + 1)))
  if (process.env.CAPTURAS) {
    await p.screenshot({ path: path.join(process.env.CAPTURAS, 'wow-forever-' + tema + '-angosto.png') })
    await p.setViewportSize({ width: 1050, height: 720 })
    await elegir(p, 'personaje')
    await p.screenshot({ path: path.join(process.env.CAPTURAS, 'wow-forever-' + tema + '.png') })
  }
  await cerrar()
}
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.magoCielonato, idioma: 'en', storage: { pestana: 'guia' } }))
await p.getByRole('radio', { name: 'EN' }).waitFor()
check('guía guardada no disponible: cae en Settings sin perder el grupo', await p.getByRole('tab', { name: 'Settings', selected: true }).count() === 1 && await p.locator('[data-tab="guia"]').count() === 0)
await cerrar()
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda, storage: { pestana: 'guia' } }))
await p.getByRole('tab', { name: 'Guía curada', selected: true }).waitFor()
check('restaura subpestaña antigua dentro de su nuevo grupo', await p.getByRole('tab', { name: 'Otros y configuración', selected: true }).count() === 1)
await elegir(p, 'personaje')
await elegir(p, 'ruta')
await p.evaluate(() => { window.raiz.render(null) })
await p.getByRole('tab').first().waitFor({ state: 'detached' })
await p.evaluate(() => window.montar())
await p.getByRole('tab', { name: 'Ruta', selected: true }).waitFor()
check('restaura la subpestaña elegida al volver a montar', await p.getByRole('tab', { name: 'Personaje', selected: true }).count() === 1)
if (process.env.HERMES_SDK_TABS === '1') {
  const ruta = p.getByRole('tab', { name: 'Ruta', exact: true })
  await ruta.focus()
  await ruta.press('ArrowRight')
  await p.getByRole('tab', { name: 'Clase', exact: true, selected: true }).waitFor()
  const personaje = p.getByRole('tab', { name: 'Personaje', exact: true })
  await personaje.focus()
  await personaje.press('ArrowRight')
  await p.getByRole('tab', { name: 'Mercado', exact: true, selected: true }).waitFor()
  check('el teclado cambia pestañas dentro de cada nivel del SDK real', await p.getByRole('tablist').count() === 1)
}
await cerrar()
;({ p, cerrar } = await a.abrir('claro', { storage: { pestana: 'mercado' } }))
await p.getByText('Completa tu perfil de personaje para usar el Mercado.').waitFor()
check('Mercado sin perfil sigue visible en segundo lugar', (await ids(p, 'Secciones principales')).join() === principales.join())
await p.getByRole('button', { name: 'Personaje', exact: true }).click()
await p.locator('#wf-raza').waitFor()
check('Mercado sin perfil vuelve a la ficha con un clic', await p.getByRole('tab', { name: 'Perfil', exact: true, selected: true }).isVisible())
await cerrar()

// 5) La clave heredada de la 1.0.0 (`auction-path`) se borra sola al cargar el
//    plugin, sin tocar el LevelDB de Hermes ni las claves vivas del SDK.
;({ p, cerrar } = await a.abrir('claro', {
  raw: { 'wow-hunter-guide.auction-path': '/home/x/WTF/SavedVariables/Auctionator.lua' },
  storage: { pestana: 'personaje' },
}))
check('borra la clave heredada `auction-path` al cargar el plugin', await p.evaluate(() =>
  localStorage.getItem('wow-hunter-guide.auction-path') === null))
check('la limpieza no toca las claves vivas del plugin', await p.evaluate((k) => localStorage.getItem(k) !== null, PREF + 'pestana'))
await cerrar()

await a.terminar('desktop')
