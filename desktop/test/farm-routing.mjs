// Farmeo v2 en la vista Mercado: columna con el campamento completo, detalle con
// campamentos del ítem y plan de sesión con supuestos visibles, claro y oscuro.
// Chromium + React, fixtures sintéticos: nunca abre SavedVariables del usuario.
import { iniciar, PERFILES } from './arnes.mjs'

const a = await iniciar()
const fixture = 'AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Prueba"]={version=2,' +
  '["2091"]={m=17100,h={["2140"]=17100},l={["2140"]=17100},a={["2140"]=20}},' +
  '["7069"]={m=3999,h={["2140"]=3999},l={["2140"]=3999},a={["2140"]=20}}}}'
for (const tema of ['claro', 'oscuro']) {
  const { p, cerrar } = await a.abrir(tema, {
    perfil: { ...PERFILES.cazadorHorda, nivel: 38 },
    storage: { 'farm-settings': { pvp: true, prof: {}, horas: 2, tope: 'k5' } },
  })
  try {
    await p.click('[data-tab="mercado"]')
    await p.evaluate(fix => { window.carpetaConcedida = { name: 'SavedVariables', files: { 'Auctionator.lua': fix } } }, fixture)
    await p.getByRole('button', { name: 'Leer Auctionator.lua' }).first().click()
    await p.locator('[data-farm-camp]').first().waitFor()
    const celdas = p.locator('[data-farm-camp]')
    a.check(`${tema}: la columna muestra el campamento completo de cada ítem`, await celdas.count() === 2)
    const air = celdas.filter({ hasText: 'Desolace' })
    a.check(`${tema}: Elemental Air sale de un campamento de Desolace con su parte del oro`,
      await air.count() >= 1 && /% este ítem/.test(await air.first().innerText()) && /el campamento/.test(await air.first().innerText()),
      await celdas.allInnerTexts())
    await p.locator('[data-testid="farm-plan-tramo"]').first().waitFor()
    a.check(`${tema}: plan de sesión con tramos y supuestos declarados`,
      await p.locator('[data-testid="farm-plan-tramo"]').count() >= 1 &&
      /tope de venta 5 %/.test(await p.locator('[data-testid="farm-supuestos"]').first().innerText()))
    await p.getByRole('button', { name: /Aire elemental|Elemental Air/i }).first().click()
    await p.locator('[data-testid="detalle-campamento"]').first().waitFor()
    a.check(`${tema}: el detalle lista los campamentos del ítem`, await p.locator('[data-testid="detalle-campamento"]').count() >= 1)
    await p.getByRole('button', { name: 'Cerrar', exact: true }).first().click()
    await p.setViewportSize({ width: 480, height: 900 })
    a.check(`${tema}: la celda permite partir líneas en panel estrecho`, await air.first().evaluate(e => getComputedStyle(e).whiteSpace === 'normal' && getComputedStyle(e).overflowWrap === 'anywhere'))
  } finally { await cerrar() }
}
await a.terminar('farm-routing')
