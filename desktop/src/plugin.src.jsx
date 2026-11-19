// wow-forever — mitad Desktop. Fuente de desktop/plugin.js (se genera con `npm run build`
// en desktop/). Solo usa la superficie del SDK: barra lateral, ruta, paleta, ctx.storage y
// ctx.files (su carpeta de datos y la carpeta que el usuario concede para Auctionator.lua).
//
// El id interno sigue siendo 'wow-hunter-guide' a propósito: Hermes guarda ctx.storage, la
// carpeta de datos y los permisos de carpeta por id de plugin. Con el mismo id, el progreso,
// los precios importados y el permiso ya concedido pasan intactos a esta versión.
import { host, PALETTE_AREA, ROUTES_AREA, SIDEBAR_NAV_AREA } from '@hermes/plugin-sdk'
import { createStore } from './almacen.js'
import { App } from './app.jsx'
import { createMarketSync, startMarketSync } from './mercado-auto.js'
import { createTsmSync, startTsmSync } from './tsm-sync.js'
import { createBridgeSync, startBridgeSync } from './bridge-sync.js'

const RUTA = '/wow-forever'

export default {
  id: 'wow-hunter-guide',
  name: 'WoW Forever',
  version: '2.0.0',
  description: 'Guía offline de WoW Forever para cualquier raza, clase y profesión, y mercado con tus precios de Auctionator. Lee Auctionator.lua y contabilidad TradeSkillMaster.lua solo desde carpetas autorizadas.',
  defaultEnabled: true,
  register(ctx) {
    const almacen = createStore(ctx)
    const sincronizador = createMarketSync(ctx, almacen)
    startMarketSync(ctx, sincronizador)
    const ventas = createTsmSync(ctx)
    startTsmSync(ctx, ventas)
    const puente = createBridgeSync(ctx, sincronizador)
    startBridgeSync(ctx, puente)
    ctx.registerMany([
      { id: 'nav', area: SIDEBAR_NAV_AREA, order: 73, data: { path: RUTA, label: 'WoW Forever', codicon: 'target' } },
      { id: 'route', area: ROUTES_AREA, data: { path: RUTA }, render: () => <App ctx={ctx} almacen={almacen} sincronizador={sincronizador} ventas={ventas} puente={puente} /> },
      { id: 'open', area: PALETTE_AREA, data: { id: 'wow-forever.open', label: 'WoW Forever: abrir guía y mercado',
        keywords: ['wow', 'forever', 'guía', 'auctionator', 'profesiones'], run: () => host.navigate(RUTA) } },
    ])
  },
}
