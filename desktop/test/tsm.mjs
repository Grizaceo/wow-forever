// Chromium + actual generated plugin, synthetic TSM data only. No game files.
import { iniciar, exportarEstado, PERFILES, PREF } from './arnes.mjs'
const tx='itemString,stackSize,quantity,price,otherPlayer,player,time,source'
const ex='itemString,stackSize,quantity,player,time'
const fix=(qty=40)=>`TradeSkillMasterDB={ ["r@Prueba@internalData@csvSales"]=${JSON.stringify(tx+'\ni:2589,20,'+qty+',120,PRIVATE_BUYER,PRIVATE_PLAYER,1794800000,Auction')},["r@Prueba@internalData@csvBuys"]=${JSON.stringify(tx+'\ni:2589,10,10,80,PRIVATE_SELLER,PRIVATE_PLAYER,1794700000,Auction'+'\ni:2592,10,5,55,PRIVATE_SELLER,PRIVATE_PLAYER,1794600000,Auction')},["r@Prueba@internalData@csvExpired"]=${JSON.stringify(ex+'\ni:2589,20,60,PRIVATE_PLAYER,1794900000'+'\ni:2592,10,7,PRIVATE_PLAYER,1794800000')} }`
const auction='AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Prueba"]={version=2,["2589"]={m=140,h={["2500"]=140},a={["2500"]=5}}}}'
const a=await iniciar(); const {check}=a
let saved
for(const theme of ['claro','oscuro']){
  const {p,cerrar}=await a.abrir(theme,{perfil:PERFILES.cazadorHorda})
  await p.click('[data-tab="mercado"]')
  const panel=p.locator('[data-testid="tsm-panel"]')
  await panel.waitFor({timeout:10000})
  check(theme+': TSM disponible sin precios Auctionator',await panel.getByText('Sin operaciones importadas').count()===1)
  await p.evaluate(({tsm,auction})=>{window.carpetaConcedida={name:'SavedVariables',files:{'TradeSkillMaster.lua':tsm,'Auctionator.lua':auction}}},{tsm:fix(),auction})
  await panel.getByRole('button',{name:'Leer TradeSkillMaster.lua',exact:true}).click()
  await panel.getByText('Importación TSM guardada',{exact:true}).waitFor()
  check(theme+': compra/venta/expiración y nombre ES',/Paño de lino/.test(await panel.innerText()) && /40/.test(await panel.innerText()) && /60/.test(await panel.innerText()))
  check(theme+': privacidad sin compradores ni personajes',! /PRIVATE/.test(await panel.innerText()))
  await p.getByRole('button',{name:'Leer Auctionator.lua',exact:true}).click()
  await p.waitForFunction(()=>/Importación guardada/.test(document.body.innerText))
  check(theme+': TSM y Auctionator se muestran por separado',/se muestran por separado/i.test(await panel.innerText()))
  check(theme+': Auctionator no cruza cifras en la fila TSM',!/1p 40c/.test(await panel.innerText()))
  const listaTsm=panel.locator('[data-testid="tsm-lista"]')
  const fila2592=listaTsm.locator('[data-testid="tsm-solo-contabilidad"]').filter({hasText:'i:2592'})
  check(theme+': objeto sin ventas Auction sigue en la lista',await fila2592.count()===1)
  const cont2592=await fila2592.locator('[data-testid="tsm-contabilidad"]').textContent()
  check(theme+': compra de i:2592 formateada por Dinero',/2p 75c/.test(cont2592||''))
  const cont2589=await p.evaluate(()=>{
    const fila=[...document.querySelectorAll('[data-testid="valoracion-fila"]')].find(e=>e.textContent.includes('i:2589'))
    return fila?.parentElement?.querySelector('[data-testid="tsm-contabilidad"]')?.textContent||''
  })
  check(theme+': contabilidad de i:2589 sin cobre en bruto',!/4800c/.test(cont2589)&&/48p/.test(cont2589))
  check(theme+': contador cuenta la lista combinada',/2 objetos · ventana de 28 días/.test(await panel.innerText()))
  await panel.locator('input[aria-label="Buscar valoraciones"]').fill('2592')
  await panel.getByText('1 objetos · ventana de 28 días').waitFor()
  check(theme+': búsqueda por 2592 deja solo ese objeto',await listaTsm.locator('[data-testid="valoracion-fila"]').count()===0&&await fila2592.count()===1)
  await panel.locator('input[aria-label="Buscar valoraciones"]').fill('')
  await p.setViewportSize({ width: 1440, height: 900 })
  const auctionPanel = p.locator('[data-testid="auctionator-panel"]')
  let left = await auctionPanel.boundingBox(), right = await panel.boundingBox()
  check(theme+': Auctionator y TSM lado a lado y alineados arriba',right.x >= left.x + left.width && Math.abs(right.y - left.y) < 2)
  check(theme+': escaneo y lista de precios juntos a la izquierda',await auctionPanel.getByRole('button',{name:'Leer Auctionator.lua',exact:true}).count()===1 && await auctionPanel.getByText('Precios por reino',{exact:true}).count()===1)
  for (const width of [1000, 560]) {
    await p.setViewportSize({ width, height: 900 })
    left = await auctionPanel.boundingBox(); right = await panel.boundingBox()
    check(theme+': ancho '+width+' apila sin desbordar la página',right.y >= left.y + left.height && await p.evaluate(()=>document.documentElement.scrollWidth <= innerWidth))
  }
  const lista = panel.locator('[data-testid="tsm-lista"]')
  check(theme+': valoraciones con scroll local',await lista.evaluate(el=>getComputedStyle(el).overflowX==='auto'))
  await p.setViewportSize({ width: 1280, height: 900 })
  const before=await p.evaluate(()=>archivosData.get('tsm-a.json')||archivosData.get('tsm-b.json'))
  check(theme+': datos persistidos sin nombres',! /PRIVATE/.test(before))
  await panel.getByRole('button',{name:'Leer TradeSkillMaster.lua',exact:true}).click()
  await panel.getByText('TSM sin cambios',{exact:true}).waitFor()
  check(theme+': repetir no duplica',await panel.locator('[data-testid="valoracion-fila"]').count()===1)
  // Update source while a different tab is mounted; timer is plugin-scoped.
  await p.click('[data-tab="personaje"]')
  await p.evaluate(tsm=>{window.carpetaConcedida.files['TradeSkillMaster.lua']=tsm;window.sondeos.forEach(t=>t.fn())},fix(60))
  await p.waitForFunction(()=>[...archivosData].some(([k,v])=>k.startsWith('tsm-') && /"quantity":60,"unitPriceCopper":120/.test(v)))
  await p.click('[data-tab="mercado"]')
  await panel.getByText('60',{exact:true}).first().waitFor()
  check(theme+': seguimiento sigue fuera de Mercado',true)
  await p.evaluate(()=>{window.carpetaConcedida.files['TradeSkillMaster.lua']='TradeSkillMasterDB={';window.sondeos.forEach(t=>t.fn())})
  await panel.locator('[role="status"]').filter({hasText:'No se pudo'}).waitFor()
  check(theme+': truncado conserva filas',await panel.locator('[data-testid="valoracion-fila"]').count()===1)
  await p.evaluate(tsm=>{window.carpetaConcedida.files['TradeSkillMaster.lua']=tsm},fix(60))
  await panel.getByRole('button',{name:'Reabrir TSM',exact:true}).click()
  await panel.locator('[data-testid="valoracion-fila"]').first().waitFor()
  if(theme==='claro') saved=await exportarEstado(p)
  // Simulate write failure: explicit error, not a success toast.
  await p.evaluate(()=>window.fallarEscritura=true)
  await panel.getByRole('button',{name:'Borrar historial TSM',exact:true}).click()
  await panel.getByRole('button',{name:'Confirmar borrado TSM',exact:true}).click()
  await panel.locator('[role="status"]').filter({hasText:'No se pudo'}).waitFor()
  check(theme+': borrado fallido conserva operaciones',await panel.locator('[data-testid="valoracion-fila"]').count()===1)
  await p.evaluate(()=>window.fallarEscritura=false)
  await panel.getByRole('button',{name:'Borrar historial TSM',exact:true}).click()
  await panel.getByRole('button',{name:'Confirmar borrado TSM',exact:true}).click()
  await panel.getByText('Sin operaciones importadas',{exact:true}).waitFor()
  check(theme+': borrado confirmado pausa solo TSM',true)
  await cerrar()
}
const {p,cerrar}=await a.abrir('claro',saved)
await p.click('[data-tab="mercado"]');await p.locator('[data-testid="tsm-panel"] [data-testid="valoracion-fila"]').first().waitFor()
check('sesión nueva restaura TSM desde su archivo separado',await p.locator('[data-testid="tsm-panel"] [data-testid="valoracion-fila"]').count()===1)
await cerrar()
// A grant acquired for Auctionator discovers TSM too: no TSM button or second picker.
for(const theme of ['claro','oscuro']){
  const {p,cerrar}=await a.abrir(theme,{perfil:PERFILES.cazadorHorda})
  await p.click('[data-tab="mercado"]')
  await p.evaluate(({tsm,auction})=>{window.carpetaConcedida={name:'WoW',files:{
    'WTF/Account/SYNTHETIC/SavedVariables/TradeSkillMaster.lua':tsm,
    'WTF/Account/SYNTHETIC/SavedVariables/Auctionator.lua':auction,
    'WTF/Config.wtf':'MUST_NOT_READ',
  }}},{tsm:fix(),auction})
  await p.getByRole('button',{name:'Leer Auctionator.lua',exact:true}).click()
  await p.waitForFunction(()=>window.selectorAbierto===1)
  await p.evaluate(()=>window.sondeos.forEach(t=>t.fn()))
  const panel=p.locator('[data-testid="tsm-panel"]')
  await panel.locator('[data-testid="valoracion-fila"]').first().waitFor()
  check(theme+': TSM descubierto sin seleccionar archivo ni segunda carpeta',await p.evaluate(()=>window.selectorAbierto===1))
  check(theme+': ubicación anidada recordada',await p.evaluate(pref=>JSON.parse(localStorage.getItem(pref+'tsm-location')).path==='WTF/Account/SYNTHETIC/SavedVariables/TradeSkillMaster.lua',PREF))
  check(theme+': nunca lee Config.wtf ni bak',await p.evaluate(()=>window.lecturas.every(p=>!p.endsWith('Config.wtf')&&!p.endsWith('.bak'))))
  await cerrar()
}
await a.terminar()
