// Chromium + React: el sondeo pertenece al plugin, no a la pestaña Mercado.
import { iniciar, PERFILES, PREF } from './arnes.mjs'
const a = await iniciar(), {check} = a
const {p,cerrar} = await a.abrir('oscuro',{perfil:PERFILES.cazadorHorda})
const lua=(day,price)=>`AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Prueba"]={version=2,["2589"]={m=${price},h={["${day}"]=${price}},a={["${day}"]=5}}}}`
check('un timer por fuente, de 30 segundos',await p.evaluate(()=>sondeos.length===2&&sondeos.every(t=>t.ms===30000)))
check('arranque sin permiso no muestra selector',await p.evaluate(()=>selectorAbierto===0))
await p.evaluate(fix=>{
 window.carpetaConcedida={name:'WoW',files:{'WTF/Account/cuenta/SavedVariables/Auctionator.lua':fix}}
 window.concedidas=[{id:'g1',name:'WoW'}]
 sondeos[0].fn()
},lua(2500,100))
await p.waitForFunction(k=>!!localStorage.getItem(k),PREF+'market-pointer')
check('sin entrar a Mercado ya importa desde carpeta raíz',await p.evaluate(()=>document.querySelector('[data-tab="personaje"]').getAttribute('aria-selected')==='true'))
await p.click('[data-tab="mercado"]')
await p.getByText('Paño de lino',{exact:true}).first().waitFor()
check('Mercado se actualiza sin botón de importar',await p.locator('select[aria-label="Realm de subasta"]').inputValue()==='Prueba')
await p.waitForFunction(()=>document.querySelector('[data-testid="auctionator-auto-status"]').textContent.includes('ok'))
const rev=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).revision,PREF+'market-pointer')
await p.evaluate(()=>sondeos[0].fn())
await p.waitForFunction(()=>document.querySelector('[data-testid="auctionator-auto-status"]').textContent.includes('unchanged'))
check('mismos bytes no reescriben snapshot',await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).revision,PREF+'market-pointer')===rev)
await p.click('[data-tab="personaje"]')
await p.evaluate(fix=>{carpetaConcedida.files['WTF/Account/cuenta/SavedVariables/Auctionator.lua']=fix;sondeos[0].fn()},lua(2501,200))
await p.waitForFunction(({k,rev})=>JSON.parse(localStorage.getItem(k)).revision>rev,{k:PREF+'market-pointer',rev})
await p.click('[data-tab="mercado"]')
await p.getByText('Paño de lino',{exact:true}).first().waitFor()
check('el histórico acumula dos días al cambiar de pestaña',await p.evaluate(pref=>{
 const pointer=JSON.parse(localStorage.getItem(pref+'price-history-pointer'))
 const record=JSON.parse(localStorage.getItem('archivo.price-history-'+pointer.slot+'.json'))
 return record.store.realms.Prueba.items['2589'].length===2
},PREF))
await p.getByRole('button',{name:'Borrar precios locales',exact:true}).click()
await p.getByRole('button',{name:'¿Confirmar borrado?',exact:true}).click()
await p.getByText('Mercado local borrado.').waitFor()
await p.evaluate(()=>sondeos[0].fn())
await p.waitForFunction(()=>document.querySelector('[data-testid="auctionator-auto-status"]').textContent.includes('paused'))
check('borrar pausa automático y no resucita precios',await p.evaluate(pref=>{
 const ptr=JSON.parse(localStorage.getItem(pref+'market-pointer'))
 return !JSON.parse(localStorage.getItem('archivo.market-'+ptr.slot+'.json')).values.snapshot
},PREF))
await p.getByText('Seguimiento automático · cada 30 s con Hermes abierto').click()
await p.getByText('Paño de lino',{exact:true}).first().waitFor()
check('se puede reanudar explícitamente',await p.evaluate(pref=>JSON.parse(localStorage.getItem(pref+'auctionator-auto'))===true,PREF))
await p.evaluate(()=>disposers.forEach(fn=>fn()))
const finalRev=await p.evaluate(k=>localStorage.getItem(k),PREF+'market-pointer')
await p.evaluate(fix=>{carpetaConcedida.files['WTF/Account/cuenta/SavedVariables/Auctionator.lua']=fix;sondeos[0].fn()},lua(2502,300))
await p.waitForTimeout(100)
check('descargar el plugin detiene nuevas importaciones',await p.evaluate(k=>localStorage.getItem(k),PREF+'market-pointer')===finalRev)
check('no abrió selectores automáticamente',await p.evaluate(()=>selectorAbierto===0))
await cerrar(); await a.terminar('mercado-auto')
