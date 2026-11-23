// Chromium + React, fixtures sintéticos: nunca abre SavedVariables del usuario.
import { iniciar, PERFILES } from './arnes.mjs'

const a = await iniciar()
const fixture = 'AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Prueba"]={version=2,' +
  '["2091"]={m=17100,h={["2140"]=17100},l={["2140"]=17100},a={["2140"]=20}},' +
  '["7069"]={m=3999,h={["2140"]=3999},l={["2140"]=3999},a={["2140"]=20}}}}'
for (const tema of ['claro', 'oscuro']) {
  const { p, cerrar } = await a.abrir(tema, {
    perfil: { ...PERFILES.cazadorHorda, nivel: 38 },
    storage: { 'farm-settings': { comp: 'low', pvp: true, gph: 5, session: 2, prof: {} } },
  })
  try {
    await p.click('[data-tab="mercado"]')
    await p.evaluate(fix => { window.carpetaConcedida = { name: 'SavedVariables', files: { 'Auctionator.lua': fix } } }, fixture)
    await p.getByRole('button', { name: 'Leer Auctionator.lua' }).first().click()
    await p.locator('[data-farm-route]').first().waitFor()
    const routes = p.locator('[data-farm-route]')
    a.check(`${tema}: tabla explica las dos rutas`, await routes.count() === 2)
    const air = routes.filter({ hasText: '37 entre alternativas' })
    a.check(`${tema}: Air muestra alternativas sin sumarlas`, await air.count() === 1 && /2 campamentos alternativos/.test(await air.innerText()) && /sin drops paralelos/.test(await air.innerText()))
    a.check(`${tema}: viaje y supuestos visibles`, /~(?:11|22) min/.test(await air.innerText()) && /sin calibrar/.test(await air.innerText()) && /desbloqueo no verificado/.test(await air.innerText()), await air.innerText())
    await p.getByRole('button', { name: /Aire elemental|Elemental Air/i }).first().click()
    a.check(`${tema}: detalle reutiliza la explicación`, await routes.count() > 2)
    await p.getByRole('button', { name: 'Cerrar', exact: true }).first().click()
    await p.setViewportSize({ width: 480, height: 900 })
    a.check(`${tema}: explicación permite partir líneas en panel estrecho`, await air.evaluate(e => getComputedStyle(e).whiteSpace === 'normal' && getComputedStyle(e).overflowWrap === 'anywhere'))
  } finally { await cerrar() }
}
await a.terminar('farm-routing')
