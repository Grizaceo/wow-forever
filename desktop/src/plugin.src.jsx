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

const RUTA = '/wow-forever'

export default {
  id: 'wow-hunter-guide',
  name: 'WoW Forever',
  version: '1.1.0',
  description: 'Guía offline de WoW Forever para cualquier raza, clase y profesión, y mercado con tus precios de Auctionator. Solo lee Auctionator.lua de la carpeta que concedas.',
  defaultEnabled: true,
  register(ctx) {
    const almacen = createStore(ctx)
    ctx.registerMany([
      { id: 'nav', area: SIDEBAR_NAV_AREA, order: 73, data: { path: RUTA, label: 'WoW Forever', codicon: 'target' } },
      { id: 'route', area: ROUTES_AREA, data: { path: RUTA }, render: () => <App ctx={ctx} almacen={almacen} /> },
      { id: 'open', area: PALETTE_AREA, data: { id: 'wow-forever.open', label: 'WoW Forever: abrir guía y mercado',
        keywords: ['wow', 'forever', 'guía', 'auctionator', 'profesiones'], run: () => host.navigate(RUTA) } },
    ])
  },
}
