// Sesiones del contador WoWForeverFarm en Mercado → Farmeo: lectura desde la
// carpeta concedida, tabla con predicho vs real, estilo calibrado, export del
// contexto del agente y «Preguntar al agente». Claro y oscuro; fixtures sintéticos.
import { iniciar, PERFILES } from './arnes.mjs'

const a = await iniciar()
const AUCT = 'AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Prueba"]={version=2,' +
  '["7069"]={m=3999,h={["2140"]=3999},l={["2140"]=3999},a={["2140"]=400}},' +
  '["4234"]={m=200,h={["2140"]=200},l={["2140"]=200},a={["2140"]=9000}}}}'
const FARM = `WoWForeverFarmDB = {
["version"] = 1,
["sessions"] = {
{
["v"] = 1, ["start"] = 1795500000, ["stop"] = 1795503600, ["level"] = 38, ["class"] = "HUNTER", ["faction"] = "Horde",
["active"] = 3600, ["paused"] = 0, ["combat"] = 1600, ["looting"] = 240, ["fights"] = 80, ["deaths"] = 0,
["kills"] = { [11578] = 80, },
["killBy"] = { ["target"] = 80, ["cleu"] = 0, ["loot"] = 0, },
["corpses"] = { [11578] = 70, },
["items"] = { [11578] = { [7069] = 66, }, },
["skins"] = {}, ["skinItems"] = {}, ["gather"] = {}, ["gatherItems"] = {}, ["other"] = {},
["money"] = { ["loot"] = 0, ["merchant"] = 0, ["other"] = 0, },
["coinsBy"] = {}, ["zones"] = { [1443] = 3600, }, ["path"] = "1443:50.0,25.0",
["ammo"] = {}, ["bags"] = {},
["methods"] = { ["loot"] = true, ["target"] = true, },
}, -- [1]
},
["current"] = { ["v"] = 1, ["start"] = 1795600000, ["state"] = "running", ["active"] = 60, },
["ui"] = {},
}
`
for (const tema of ['claro', 'oscuro']) {
  const { p, cerrar } = await a.abrir(tema, {
    perfil: { ...PERFILES.cazadorHorda, nivel: 38 },
    storage: { 'farm-settings': { pvp: true, prof: {}, horas: 2, tope: 'k5' } },
  })
  try {
    await p.click('[data-tab="mercado"]')
    await p.evaluate(([au, fa]) => { window.carpetaConcedida = { name: 'SavedVariables', files: { 'Auctionator.lua': au, 'WoWForeverFarm.lua': fa } } }, [AUCT, FARM])
    await p.getByRole('button', { name: 'Leer Auctionator.lua' }).first().click()
    await p.locator('[data-farm-camp]').first().waitFor()
    await p.locator('[data-testid="farm-leer-sesiones"]').click()
    await p.locator('[data-testid="farm-sesion-fila"]').first().waitFor()
    const fila = await p.locator('[data-testid="farm-sesion-fila"]').first().innerText()
    a.check(`${tema}: lee la sesión de WoWForeverFarm.lua`, await p.locator('[data-testid="farm-sesion-fila"]').count() === 1)
    a.check(`${tema}: la fila muestra ritmo, pelea, reparto del tiempo y predicción`,
      /\b80\b/.test(fila) && /20 s/.test(fila) && /44% · 7% · 49%/.test(fila) && /[+-]\d+%/.test(fila), fila)
    a.check(`${tema}: avisa de la sesión abierta en el juego`, /sesión abierta/.test(await p.locator('[data-testid="farm-sesiones-estado"]').innerText()))
    a.check(`${tema}: tu estilo se calibra con 80 muertes`, /80 muertes en 1 sesiones/.test(await p.locator('[data-testid="farm-estilo"]').innerText()))
    await p.waitForFunction(() => archivosData.has('farmeo-agente.json'), null, { timeout: 10000 })
    const exp = JSON.parse(await p.evaluate(() => archivosData.get('farmeo-agente.json')))
    a.check(`${tema}: contexto del agente escrito sin nombres ni ruta`,
      exp.schema === 1 && exp.sesiones[0].muertes === 80 && exp.estilo.fuente === 'sesiones' && !JSON.stringify(exp).includes('1443:50.0') && exp.plan && exp.plan.tramos.length >= 1,
      exp)
    await p.locator('[data-testid="farm-sesiones"]').locator('..').getByRole('button', { name: 'Preguntar al agente' }).first().click()
    const vista = await p.locator('textarea[aria-label]').first().inputValue()
    a.check(`${tema}: «Preguntar al agente» lleva plan, estilo y sesiones`, /Plan de sesión/.test(vista) && /Tu estilo/.test(vista) && /Sesión/.test(vista) && /Torbellino|Whirlwind/.test(vista), vista)
  } finally { await cerrar() }
}
await a.terminar('farm-sesiones')
