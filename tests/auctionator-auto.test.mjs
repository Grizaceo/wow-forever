import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerAuctionator } from '../desktop/src/auctionator.js'

const text = 'AUCTIONATOR_PRICE_DATABASE = { ["__dbversion"] = 8 }'
const base = () => ({
  folders: async () => [], readText: async () => ({ ok: false }),
  list: async () => ({ ok: true, entries: [] }),
  requestFolder: async () => { throw new Error('selector inesperado') },
})
test('el sondeo silencioso sin permisos nunca abre el selector', async () => {
  assert.equal((await leerAuctionator({ files: base() }, { silent: true })).status, 'no-folder')
})
test('un permiso sin archivo tampoco abre un selector en segundo plano', async () => {
  const files = base(); files.folders = async () => [{ id: 'g1', name: 'AddOns' }]
  const r = await leerAuctionator({ files }, { silent: true })
  assert.equal(r.status, 'error')
  assert.match(r.message, /SavedVariables/)
})
test('preferencia revocada permite descubrir la nueva carpeta concedida', async () => {
  const files=base(), storage=new Map([['auctionator-folder','vieja']])
  files.folders=async()=>[{id:'nueva',name:'SavedVariables'}]
  files.readText=async()=>({ok:true,text})
  const r=await leerAuctionator({files,storage:{get:async k=>storage.get(k),set:async(k,v)=>storage.set(k,v)}},{silent:true})
  assert.equal(r.status,'ok'); assert.notEqual(storage.get('auctionator-folder'),'vieja')
})
test('host sin folders permite el selector manual pero no abre ninguno en silencio', async () => {
  const files=base(); delete files.folders; let picks=0
  files.requestFolder=async()=>{picks++;return {ok:true,folder:{id:'g',name:'SavedVariables'}}}
  files.readText=async()=>({ok:true,text})
  assert.equal((await leerAuctionator({files},{silent:true})).status,'unavailable'); assert.equal(picks,0)
  assert.equal((await leerAuctionator({files},{pick:true})).status,'ok'); assert.equal(picks,1)
})
test('búsqueda incompleta no acepta el primer archivo aunque ya lo encontró', async () => {
  const files=base(); files.folders=async()=>[{id:'g',name:'WoW'}]
  files.readText=async(_id,rel)=>rel==='primero/Auctionator.lua'?{ok:true,text}:{ok:false}
  files.list=async(_id,rel)=>({ok:true,entries:rel ? (rel==='primero'?[{name:'Auctionator.lua',path:'primero/Auctionator.lua',isDirectory:false}]:[]) :
    ['primero',...Array.from({length:90},(_,i)=>'d'+i)].map(path=>({name:path,path,isDirectory:true}))})
  assert.equal((await leerAuctionator({files},{silent:true})).error,'limit')
})
test('varias cuentas son ambiguas: no se elige el archivo más grande', async () => {
  const files = base(); files.folders = async () => [{ id: 'g1', name: 'Account' }]
  files.list = async () => ({ ok: true, entries: ['A', 'B'].map(n => ({ name: 'Auctionator.lua', path: n + '/Auctionator.lua', isDirectory: false })) })
  files.readText = async (_id, rel) => rel.includes('/') ? { ok: true, text } : { ok: false }
  assert.equal((await leerAuctionator({ files }, { silent: true })).error, 'ambiguous')
})
