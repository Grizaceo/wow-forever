// Chromium + React: el sondeo pertenece al plugin, no a la pestaña Mercado.
import { iniciar, exportarEstado, PERFILES, PREF } from './arnes.mjs'
const a = await iniciar(), {check} = a
const {p,cerrar} = await a.abrir('oscuro',{perfil:PERFILES.cazadorHorda})
const lua=(day,price)=>`AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Prueba"]={version=2,["2589"]={m=${price},h={["${day}"]=${price}},a={["${day}"]=5}}}}`
check('un timer por fuente (Auctionator, TSM y puente), de 30 segundos',await p.evaluate(()=>sondeos.length===3&&sondeos.every(t=>t.ms===30000)))
check('arranque sin permiso no muestra selector',await p.evaluate(()=>selectorAbierto===0))
await p.evaluate(fix=>{
 window.carpetaConcedida={name:'WoW',files:{'WTF/Account/cuenta/SavedVariables/Auctionator.lua':fix}}
 window.concedidas=[{id:'g1',name:'WoW'}]
 sondeos[0].fn()
},lua(2500,100))
await p.waitForFunction(k=>!!localStorage.getItem(k),PREF+'market-v2-pointer')
check('sin entrar a Mercado ya importa desde carpeta raíz',await p.evaluate(()=>document.querySelector('[data-tab="personaje"]').getAttribute('aria-selected')==='true'))
await p.click('[data-tab="mercado"]')
await p.getByText('Paño de lino',{exact:true}).first().waitFor()
check('Mercado se actualiza sin botón de importar',await p.locator('select[aria-label="Realm de subasta"]').inputValue()==='Prueba')
await p.waitForFunction(()=>document.querySelector('[data-testid="auctionator-auto-status"]').textContent.includes('ok'))
const rev=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).revision,PREF+'market-v2-pointer')
await p.evaluate(()=>sondeos[0].fn())
await p.waitForFunction(()=>document.querySelector('[data-testid="auctionator-auto-status"]').textContent.includes('unchanged'))
check('mismos bytes no reescriben snapshot',await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).revision,PREF+'market-v2-pointer')===rev)
await p.click('[data-tab="personaje"]')
await p.evaluate(fix=>{carpetaConcedida.files['WTF/Account/cuenta/SavedVariables/Auctionator.lua']=fix;sondeos[0].fn()},lua(2501,200))
await p.waitForFunction(({k,rev})=>JSON.parse(localStorage.getItem(k)).revision>rev,{k:PREF+'market-v2-pointer',rev})
await p.click('[data-tab="mercado"]')
await p.getByText('Paño de lino',{exact:true}).first().waitFor()
check('el histórico v2 acumula dos días al cambiar de pestaña',await p.evaluate(()=>{
 const b=leerMercadoDePrueba()
 const sc=Object.values(b.history.scopes).find(s=>s.realms?.Prueba?.items?.['2589'])
 const rows=sc?.realms?.Prueba?.items?.['2589']||[]
 return b.history.v===2&&rows.length===2&&rows[0][0]===2500&&rows[1][0]===2501
}))
const previo = await exportarEstado(p)
await p.getByRole('button',{name:'Borrar precios locales',exact:true}).click()
await p.getByRole('button',{name:'¿Confirmar borrado?',exact:true}).click()
await p.getByText('Mercado local borrado.').waitFor()
await p.evaluate(()=>sondeos[0].fn())
await p.waitForFunction(()=>document.querySelector('[data-testid="auctionator-auto-status"]').textContent.includes('paused'))
check('borrar pausa automático y vacía mercado e histórico v2',await p.evaluate(()=>{
 const b=leerMercadoDePrueba()
 return !b.market.snapshot&&Object.keys(b.history.scopes).length===0
}))
await p.getByText('Seguimiento automático · cada 30 s con Hermes abierto').click()
await p.getByText('Paño de lino',{exact:true}).first().waitFor()
check('se puede reanudar explícitamente',await p.evaluate(pref=>JSON.parse(localStorage.getItem(pref+'auctionator-auto'))===true,PREF))
await p.evaluate(()=>disposers.forEach(fn=>fn()))
const finalRev=await p.evaluate(k=>localStorage.getItem(k),PREF+'market-v2-pointer')
await p.evaluate(fix=>{carpetaConcedida.files['WTF/Account/cuenta/SavedVariables/Auctionator.lua']=fix;sondeos[0].fn()},lua(2502,300))
await p.waitForTimeout(100)
check('descargar el plugin detiene nuevas importaciones',await p.evaluate(k=>localStorage.getItem(k),PREF+'market-v2-pointer')===finalRev)
check('no abrió selectores automáticamente',await p.evaluate(()=>selectorAbierto===0))
await cerrar()

// Dos arranques independientes: crecer desde un slot de un solo archivo y
// reabrir el nuevo sin acceso a la fuente (la lectura debe venir de disco).
const sv = 'SavedVariables/Auctionator.lua', n = 34118
const prices = Array.from({length: n - 1}, (_, i) =>
 `["${100000 + i}"]={m=41234,h={["2501"]=41000,["2502"]=41234},a={["2502"]=7}}`).join(',')
const exportGrande = lua(2502, 43210).replace(/}}$/, ',' + prices + '}}')
try {
 const grande = await a.abrir('oscuro', previo)
 const gp = grande.p, before = previo.storage['market-v2-pointer'].revision
 await gp.evaluate(({sv, fix})=>{
  window.carpetaConcedida={name:'WoW',files:{[sv]:fix}}
  window.concedidas=[{id:'g1',name:'WoW'}]
  sondeos[0].fn()
 },{sv,fix:exportGrande})
 await gp.waitForFunction(({k,before})=>JSON.parse(localStorage.getItem(k)).revision>before,{k:PREF+'market-v2-pointer',before})
 check('un export grande se guarda en partes y no abre el selector',await gp.evaluate(pref=>{
  const ptr=JSON.parse(localStorage.getItem(pref+'market-v2-pointer'))
  const m=JSON.parse(archivosData.get('market-v2-'+ptr.slot+'.json'))
  return selectorAbierto===0&&m.version===2&&m.revision===ptr.revision&&m.parts>1&&m.bytes>4*1024*1024
 },PREF))
 check('el conjunto guarda todos los precios y los días anteriores',await gp.evaluate(count=>{
  const b=leerMercadoDePrueba(), realm=b.market.snapshot.realms[0]
  const days=Object.values(b.history.scopes)[0].realms.Prueba.items['2589'].map(row=>row[0])
  return realm.items.length===count&&realm.items.find(i=>i.sourceKey==='2589')?.unitPriceCopper===43210&&days.join()==='2500,2501,2502'
 },n))
 const durable = await exportarEstado(gp)
 await grande.cerrar()
 const reopened = await a.abrir('oscuro', durable)
 await reopened.p.click('[data-tab="mercado"]')
 await reopened.p.getByText('Paño de lino',{exact:true}).first().waitFor()
 check('una sesión sin permiso reconstruye el slot grande y muestra el precio nuevo',
  await reopened.p.getByText('4o 32p 10c',{exact:true}).first().isVisible()&&
  await reopened.p.evaluate(()=>concedidas.length===0&&selectorAbierto===0))
 await reopened.cerrar()
} finally { await a.terminar('mercado-auto') }
