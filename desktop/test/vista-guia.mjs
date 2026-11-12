// Prueba de la sección Guía curada + Legacy (mismo arnés que navegador.mjs).
//   PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/vista-guia.mjs
import { iniciar, PERFILES, PREF } from './arnes.mjs'

const a = await iniciar()
const { check } = a

// Build semilla: claves conocidas + desconocidas que deben sobrevivir.
const SEMILLA = JSON.stringify({
  spec: 'bm', pref: 'any', eng: true, realm: 'kalimdor', cur: '', customDps: 0,
  owned: [], gear: [], steps: [], farm: null, avatar: null, name: '', simc: null,
  lvl: 99, tab: 'rec', wf: 'all', mf: 'all', mdg: false, who: false,
  claveFutura: { oro: 777, notas: ['x'] }, listaPropia: ['a', 'b'],
})
const leerBuildGuardado = (p) => p.evaluate((k) => {
  const s = JSON.parse(localStorage.getItem(k))
  return s ? JSON.parse(s) : null
}, PREF + 'build')
const esperarBuild = async (p, pred) => {
  for (let i = 0; i < 60; i++) {
    const b = await leerBuildGuardado(p)
    if (b && pred(b)) return b
    await p.waitForTimeout(100)
  }
  return null
}

// ---------------------------------------------------------------- 1) Cazador Horda, tema claro
let { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda, build: SEMILLA })
await p.click('[data-tab="guia"]')
await p.getByText('Senda del Cazador').waitFor()
check('cazador horda: guía abre con ficha del perfil', await p.evaluate(() =>
  document.querySelector('.ficha') && /Cazador/.test(document.querySelector('.ficha').innerText)
  && !/\bHunter\b/.test(document.querySelector('.ficha').innerText)))
check('el nivel de la ficha sale del perfil, no del build (99→30)', await p.evaluate(() =>
  document.querySelector('.ficha-lvl') && document.querySelector('.ficha-lvl').innerText.includes('30') &&
  !document.querySelector('.ficha-lvl').innerText.includes('99')))
check('subpestañas Recomendador/Armas/Macros/Extras', await p.evaluate(() =>
  ['Recomendador', 'Armas', 'Macros', 'Extras'].every((x) =>
    [...document.querySelectorAll('[role="radio"]')].some((r) => r.textContent === x))))
check('el recomendador muestra hitos y la advertencia de aprox', await p.evaluate(() =>
  /Hitos cercanos|Recomendaciones/.test(document.body.innerText)))
check('bloques marcados como Curado', await p.locator('text=Curado').count() > 3)

// Armas: Venomstrike es el loot de Wailing Caverns (d1) → tildarla sincroniza gear.
await p.getByRole('radio', { name: 'Armas' }).click()
await p.locator('input[data-wid="venomstrike"]').waitFor()
check('tabla de armas con columnas y ~ en dps aprox', await p.evaluate(() =>
  /Arma/.test(document.body.innerText) && /Fuente/.test(document.body.innerText) && /~/.test(document.body.innerText)))
await p.locator('input[data-wid="venomstrike"]').check()
await esperarBuild(p, (b) => Array.isArray(b.owned) && b.owned.includes('venomstrike') && b.gear.includes('d1|Venomstrike'))
const b1 = await leerBuildGuardado(p)
check('tildar Venomstrike persiste owned+gear y conserva claves desconocidas', !!b1 &&
  b1.owned.includes('venomstrike') && b1.gear.includes('d1|Venomstrike') &&
  b1.claveFutura && b1.claveFutura.oro === 777 && Array.isArray(b1.listaPropia) &&
  b1.lvl === 30 && b1.spec === 'bm')
check('la fila queda marcada owned', await p.locator('tr.owned input[data-wid="venomstrike"]').count() === 1)

// Macros: copiar llena window.copiado vía ctx.os.writeClipboard.
await p.getByRole('radio', { name: 'Macros' }).click()
await p.getByText('Macros meta').waitFor()
await p.locator('button', { hasText: 'copiar' }).first().click()
await p.waitForFunction(() => typeof window.copiado === 'string' && window.copiado.length > 0)
check('copiar macro llena window.copiado con el código', await p.evaluate(() =>
  window.copiado.startsWith('#')))

// Extras: AH + tips + aviso del servidor Forever.
await p.getByRole('radio', { name: 'Extras' }).click()
await p.waitForTimeout(120)
check('extras: compras AH, tips y aviso Forever', await p.evaluate(() =>
  /Forever/.test(document.body.innerText) && /tips/i.test(document.body.innerText)))

// Legacy con el cazador: clase resaltada + gather con su Skinning.
await p.click('[data-tab="legacy"]')
await p.getByText('Legacy — puntos de cuenta').waitFor()
check('legacy del cazador: hitos Novice/Experienced/Master Cazador', await p.evaluate(() =>
  /Novice Cazador/.test(document.body.innerText) && /Master Cazador/.test(document.body.innerText)))
check('legacy muestra Progress Track, challenges, perks y escasos', await p.evaluate(() =>
  /Progress Track/.test(document.body.innerText) && /Legacy Challenges/.test(document.body.innerText) &&
  /Bountiful Harvest/.test(document.body.innerText) && /Pristine Leather/.test(document.body.innerText)))
check('legacy marca las zonas de su nivel', await p.evaluate(() =>
  /Pristine Hide/.test(document.body.innerText) && /tier 2/.test(document.body.innerText)))
check('sin desborde horizontal (1400px)', await p.evaluate(() =>
  document.scrollingElement.scrollWidth <= 1400))
await cerrar()

// ---------------------------------------------------------------- 2) Mismo cazador en tema oscuro
;({ p, cerrar } = await a.abrir('oscuro', { perfil: PERFILES.cazadorHorda, build: SEMILLA }))
await p.click('[data-tab="guia"]')
await p.getByText('Senda del Cazador').waitFor()
await p.getByRole('radio', { name: 'Armas' }).click()
await p.locator('input[data-wid="venomstrike"]').waitFor()
await p.getByRole('radio', { name: 'Macros' }).click()
await p.getByText('Macros meta').waitFor()
check('oscuro: guía, armas y macros se pintan', await p.evaluate(() =>
  document.body.innerText.length > 500))
check('oscuro: sin desborde horizontal', await p.evaluate(() =>
  document.scrollingElement.scrollWidth <= 1400))
await cerrar()

// ---------------------------------------------------------------- 3) /simc: importación completa
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda, build: SEMILLA }))
await p.click('[data-tab="guia"]')
await p.getByText('Importar /simc').click()
await p.locator('textarea').fill(
  'hunter="Fixture"\nlevel=28\nrace=troll\nserver=camwow_us1_pvp\n' +
  'professions=skinning=200\n# Barbarian War Axe (28)\nmain_hand=,id=3201\n' +
  '# Venomstrike (24)\nranged=,id=6469\n' +
  '# character_stats=health:700/mana:1600/strength:50/agility:90/stamina:58/intellect:85/spirit:72\n' +
  '# weapon_damage=mainhand:90:110:3.3/ranged:76:94:2.18')
await p.getByRole('button', { name: 'Importar', exact: true }).click()
await p.getByText('Importado:').waitFor()
const bSim = await leerBuildGuardado(p)
check('/simc: arma de la tabla → cur+owned+gear, nivel y stats', !!bSim &&
  bSim.cur === 'venomstrike' && bSim.owned.includes('venomstrike') &&
  bSim.gear.includes('d1|Venomstrike') && bSim.lvl === 28 &&
  bSim.name === 'Fixture' && bSim.simc && bSim.simc.weapon &&
  bSim.simc.stats && bSim.simc.stats.character_stats && bSim.simc.stats.character_stats.health[0] === '700')
check('/simc: el nivel se aplica al perfil validado', await p.evaluate((k) => {
  const per = JSON.parse(localStorage.getItem(k)); return per && per.nivel === 28
}, PREF + 'perfil'))
// El SimC card es un <details> cerrado (como en index): se abre y se revisa dentro.
await p.locator('summary', { hasText: 'Tu personaje — datos reales' }).click()
check('/simc: snapshot con arma real, stats y profesiones', await p.evaluate(() =>
  /Venomstrike/.test(document.body.innerText) && /skinning 200/.test(document.body.innerText) &&
  /700/.test(document.body.innerText)))
check('/simc: conservó claves desconocidas', !!bSim && bSim.claveFutura.oro === 777)
await cerrar()

// ---------------------------------------------------------------- 4) Chamán Alianza; Guerrero sin guía curada
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.chamanAlianza, build: SEMILLA }))
await p.click('[data-tab="guia"]')
await p.getByText('Senda del Chamán').waitFor()
check('chamán alianza: guía de la facción correcta', await p.evaluate(() =>
  /Chamán/.test((document.querySelector('.ficha') || document.body).innerText)))
await cerrar()

const GUERRERO_H = { v: 1, faccion: 'horda', raza: 2, clase: 1, nivel: 35, profesiones: [171], secundarias: [], reino: 'Prueba' }
const GUERRERO_A = { v: 1, faccion: 'alianza', raza: 1, clase: 1, nivel: 35, profesiones: [171], secundarias: [], reino: 'Prueba' }
// La guía curada de Guerrero se retiró en la 2.0.0 (nombraba ítems y jefes que no existen):
// el Guerrero no tiene pestaña de guía curada y su progreso anterior sigue intacto.
for (const [nom, per] of [['horda', GUERRERO_H], ['alianza', GUERRERO_A]]) {
  ;({ p, cerrar } = await a.abrir('claro', { perfil: per, build: SEMILLA }))
  await p.getByText('Raza').first().waitFor()
  check('guerrero ' + nom + ': sin pestaña de guía curada', await p.locator('[data-tab="guia"]').count() === 0)
  await cerrar()
}

// ---------------------------------------------------------------- 5) Legacy con el Mago Cielonado (sin guía)
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.magoCielonato, build: SEMILLA }))
check('mago cielonado: sin pestaña guía', await p.locator('[data-tab="guia"]').count() === 0)
await p.click('[data-tab="legacy"]')
await p.getByText('Legacy — puntos de cuenta').waitFor()
check('legacy del mago: hitos con su clase', await p.evaluate(() =>
  /Novice Mago/.test(document.body.innerText) && /Master Mago/.test(document.body.innerText)))
check('legacy del mago: recolección, escasos y profesiones del perfil', await p.evaluate(() =>
  /Bountiful Harvest/.test(document.body.innerText) && /Pristine Leather/.test(document.body.innerText) &&
  /Skinning/.test(document.body.innerText)))
await cerrar()

await a.terminar('vista-guia')
