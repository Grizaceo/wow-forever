// Prueba de las secciones Ruta y Dungeons en el arnés de navegador (arnes.mjs):
//   PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/vista-ruta-dungeons.mjs
// Cubre: esqueleto generado por facción, capa curada por continente persistida en
// build.realm, huecos de inicio/zona, filtros y botín útil de dungeons, los 9 de
// Forever con hueco de botín, el tilde persistente en build.gear y ambos temas.
import { abrirVista, iniciar, PERFILES, PREF } from './arnes.mjs'

const a = await iniciar()
const { check } = a

const leerBuild = (p) => p.evaluate((k) => {
  const crudo = localStorage.getItem(k)
  if (!crudo) return {}
  try { return JSON.parse(JSON.parse(crudo)) } catch { return {} }
}, PREF + 'build')

// ---------------------------------------------------------------- 1) Ruta — Cazador de la Horda nivel 30
let { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda })
await abrirVista(p, 'ruta')
await p.locator('[data-zona="1441"]').waitFor()
check('ruta: zona ~30 (Mil Agujas 1441) en el esqueleto', await p.locator('[data-zona="1441"]').count() === 1)
check('ruta: Desolace (1443) en el esqueleto', await p.locator('[data-zona="1443"]').count() === 1)
check('ruta: Durotar (1411, 1-10) no aparece al 30', await p.locator('[data-zona="1411"]').count() === 0)
check('ruta: misiones de la banda agrupadas por zona/dungeon', await p.locator('[data-grupo]').count() > 3)
check('ruta: banda curada Kalimdor con la actual resaltada',
  await p.locator('details[open]').getByText(/Shimmering Flats/).count() > 0
  && await p.locator('details[open]').getByText('estás acá').count() > 0)
// tilde de un paso curado -> build.steps
const primerPaso = p.locator('details[open] [data-paso] input[type="checkbox"]').first()
check('ruta: la banda actual tiene pasos curados', await primerPaso.count() === 1)
await primerPaso.check()
await p.waitForFunction(() => {
  const el = document.querySelector('details[open] [data-paso] input[type="checkbox"]')
  return el && el.checked
})
const bPaso = await leerBuild(p)
check('ruta: paso tildado persiste en build.steps', Array.isArray(bPaso.steps) && bPaso.steps.length > 0, bPaso.steps)
// cambio de continente -> build.realm
await p.getByRole('radio', { name: 'Reinos del Este' }).click()
await p.locator('details[open]').getByText(/Grom'gol/).first().waitFor()
check('ruta: banda de Reinos del Este al cambiar de continente', await p.locator('details[open]').getByText(/Grom'gol/).count() > 0)
const bRealm = await leerBuild(p)
check('ruta: realm=ek persistido en build', bRealm.realm === 'ek', bRealm.realm)
await cerrar()

// ---------------------------------------------------------------- 2) Ruta — Mago Cielonato nivel 12 (huecos)
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.magoCielonato }))
await abrirVista(p, 'ruta')
await p.getByText('Zonas a tu nivel').waitFor()
check('ruta: hueco de zona inicial para Skyborne (raza sin inicio)',
  await p.getByText(/zona de inicio para tu raza/).count() > 0)
check('ruta: hueco de zonas nuevas de Forever sin niveles',
  await p.getByText(/Zonas sin rango de niveles en los datos/).count() > 0)
check('ruta: sin capa curada para el mago (no hay guía de clase 8)',
  await p.getByText('Ruta curada').count() === 0)
await cerrar()

// ---------------------------------------------------------------- 3) Dungeons — Paladín no-muerto nivel 24
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.paladinHorda }))
await abrirVista(p, 'dungeons')
await p.locator('[data-dungeon="43"]').waitFor()
check('dungeons: Wailing Caverns (17-24) en rango del 24', await p.locator('[data-dungeon="43"]').count() === 1)
check('dungeons: Scarlet Monastery entra justo en rango (29-5=24)', await p.locator('[data-dungeon="189"]').count() === 1)
check('dungeons: Molten Core fuera del filtro "en mi rango"', await p.locator('[data-dungeon="409"]').count() === 0)
check('dungeons: misiones de dungeon de la facción (WC, Horda)',
  await p.locator('[data-dungeon="43"]').getByText('Leaders of the Fang').count() > 0)
check('dungeons: Deadmines (36) no muestra misiones de Alianza al no-muerto',
  await p.locator('[data-dungeon="36"] [data-mision]').count() === 0)
check('dungeons: botín generado con nombre y probabilidad',
  await p.locator('[data-dungeon="43"]').getByText('Venomstrike').count() > 0
  && await p.locator('[data-dungeon="43"]').getByText(/25%/).count() > 0)
// filtro "útil para mi clase": Venomstrike (arco) fuera, Leggings of the Fang (malla) queda
await p.getByRole('checkbox', { name: 'Solo útil para mi clase' }).check()
await p.waitForFunction(() => !document.querySelector('[data-dungeon="43"]')?.innerText.includes('Venomstrike'))
check('dungeons: filtro útil oculta Venomstrike (arco, sin competencia de paladín)',
  await p.locator('[data-dungeon="43"]').getByText('Venomstrike').count() === 0)
check('dungeons: filtro útil conserva Leggings of the Fang (malla)',
  await p.locator('[data-dungeon="43"]').getByText('Leggings of the Fang').count() > 0)
// raids
await p.getByRole('radio', { name: 'Raids' }).click()
await p.locator('[data-dungeon="409"]').waitFor()
check('dungeons: filtro raids muestra Molten Core', await p.locator('[data-dungeon="409"]').count() === 1)
check('dungeons: raids no incluye Wailing Caverns', await p.locator('[data-dungeon="43"]').count() === 0)
// todos -> aparecen los Forever con hueco de botín
await p.getByRole('radio', { name: 'Todos' }).click()
await p.locator('[data-dungeon="2959"]').waitFor()
check('dungeons: los 9 de Forever aparecen con "todos"', await p.locator('[data-dungeon^="29"], [data-dungeon^="30"]').count() >= 9)
await p.locator('[data-dungeon="2959"] > summary').click()
await p.locator('[data-dungeon="2959"]').getByText(/Sin datos/).waitFor()
check('dungeons Forever: hueco de niveles/jugadores/botín dicho',
  await p.locator('[data-dungeon="2959"]').getByText(/datos del servidor/).count() > 0)
check('dungeons Forever: jefes del cliente listados',
  await p.locator('[data-dungeon="2959"]').getByText('Lyn the Ignored').count() > 0)
await cerrar()

// ---------------------------------------------------------------- 4) Dungeons — Cazador: tilde persistente en build.gear
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda }))
await abrirVista(p, 'dungeons')
await p.locator('[data-dungeon="48"]').waitFor() // Blackfathom Deeps 20-34, en rango del 30
check('dungeons: BFD en rango del cazador 30', await p.locator('[data-dungeon="48"]').count() === 1)
const gid = await p.locator('[data-dungeon="48"] [data-loot]').first().getAttribute('data-loot')
check('dungeons: botín curado de la guía presente (clave d<i>|<nombre>)', /^d\d+\|.+/.test(gid || ''), gid)
await p.locator(`[data-loot="${gid}"] input[type="checkbox"]`).check()
await p.waitForFunction((g) => {
  const el = document.querySelector(`[data-loot="${g}"] input[type="checkbox"]`)
  return el && el.checked
}, gid)
const bGear = await leerBuild(p)
check('dungeons: tilde de botín persiste en build.gear', (bGear.gear || []).includes(gid), { gid, gear: bGear.gear })
await cerrar()

// ---------------------------------------------------------------- 5) Temas: ruta y dungeons en oscuro
;({ p, cerrar } = await a.abrir('oscuro', { perfil: PERFILES.cazadorHorda }))
await abrirVista(p, 'ruta')
await p.locator('[data-zona="1441"]').waitFor()
check('oscuro: ruta generada se pinta', await p.evaluate(() => document.body.innerText.length > 400))
await abrirVista(p, 'dungeons')
await p.locator('[data-dungeon="48"]').waitFor()
check('oscuro: dungeons se pintan', await p.evaluate(() => document.body.innerText.length > 400))
await cerrar()

await a.terminar('vista-ruta-dungeons')
