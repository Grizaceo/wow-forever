// Lectura de Auctionator.lua con ctx.files (carpeta concedida por el usuario). Probado en
// standalone/tests/desktop-browser.mjs en el commit 74e10f1: solo lee dentro del permiso.
// Reads Auctionator.lua ONLY from a folder the user grants with the app's own
// folder picker (ctx.files.requestFolder). Hermes remembers the grant per plugin
// and the user can revoke it in Capabilities -> Plugins -> Folder access.
// Nothing outside the granted folder is listed or read; no raw desktop bridge.
// The user should pick WTF/Account/<account>/SavedVariables; a bounded walk
// inside the grant also finds the file if they picked a parent folder.
const AUCTION_FILE='Auctionator.lua', AUCTION_MARK='AUCTIONATOR_PRICE_DATABASE', WALK_DIRS=80, WALK_DEPTH=4;
const SKIP_DIRS=['Interface','Data','Cache','Logs','.git'];
import HunterIdentity from '../../standalone/market-identity.js';
import { safeSyncPath, listingCompleta } from './sync-path.js';

/* Guard de adquisición: la topología de servidores NO está verificada (task 1).
   Ninguna ruta, nombre de cuenta, reino, región o facción puede promover un
   escaneo Auctionator a procedencia conocida. No instalamos addons ni leemos
   datos privados del juego: solo el archivo que el usuario concedió. */
export const ACQUISITION_PROVENANCE=Object.freeze({
  method:'auctionator-raw', confidence:'unknown', comparable:false,
  reason:'server-topology-unverified', exporter:'none-verified',
});
export const verifiedExporter=()=>null;
export function classifyAcquisition(hit){
  const identity=HunterIdentity.unknownIdentity('auctionator-raw');
  return { status:hit?.status||'unknown', identity, provenance:{...ACQUISITION_PROVENANCE},
    usableForComparison:false,
    warnings:['Topología de servidores no verificada: no se infiere región, reino, reglas ni canal desde la ruta.'] };
}
const withGuard=r=>(r&&typeof r==='object')
  ? {...r, provenance:{...ACQUISITION_PROVENANCE}, comparable:false,
     identity:r.status==='ok'?HunterIdentity.unknownIdentity('auctionator-raw'):undefined,
     usableForComparison:false}
  : r;
let auctionBusy=false;
export const filesApi=ctx=>{const f=ctx?.files;return f&&typeof f.requestFolder==='function'&&typeof f.readText==='function'&&typeof f.list==='function'?f:null;};
export const dataUrlBytes=url=>{const b64=String(url).slice(String(url).indexOf(',')+1);const bin=atob(b64);const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes;};
const MARK_BYTES=new TextEncoder().encode(AUCTION_MARK);
export function contieneBytes(bytes,aguja){
  const n=aguja.length;
  outer:for(let i=0;i+n<=bytes.length;i++){for(let j=0;j<n;j++)if(bytes[i+j]!==aguja[j])continue outer;return true;}
  return false;
}
// Auctionator keeps every realm except the current one as a CBOR blob inside a Lua
// string, and WoW writes those bytes raw (>= 0x80, control bytes): the file is not
// UTF-8. readText decodes it as UTF-8 and replaces those bytes, which breaks the CBOR
// («cbor trailing data»). readDataUrl returns the exact bytes (up to 16 MiB), so it
// goes first; readText is only the fallback for a host without readDataUrl.
export async function readAuction(files,folder,rel){
  if(!safeSyncPath(rel))return null;
  let bytes=null;
  if(typeof files.readDataUrl==='function'){
    const d=await files.readDataUrl(folder.id,rel);
    if(d?.ok&&typeof d.url==='string')bytes=dataUrlBytes(d.url);
  }
  if(!bytes){
    const r=await files.readText(folder.id,rel);
    if(r?.ok&&typeof r.text==='string')bytes=new TextEncoder().encode(r.text);
  }
  if(!bytes||!contieneBytes(bytes,MARK_BYTES))return null;
  return {status:'ok',bytes,path:folder.name+'/'+rel,byteSize:bytes.length};
}
// La lectura directa en la raíz es sólo UN candidato: no puede devolver antes
// de completar el listado. Si no hay `list` (SDK antiguo), es el único modo y
// se mantiene como fallback exacto sin caminar.
async function findInFolder(files,folder){
  const direct=await readAuction(files,folder,AUCTION_FILE).catch(()=>null);
  if(typeof files.list!=='function')return direct;
  const found=new Set();
  if(direct)found.add(AUCTION_FILE);
  const queue=[{rel:'',depth:0}],seen=new Set();
  while(queue.length&&seen.size<WALK_DIRS){
    const {rel,depth}=queue.shift();
    if(seen.has(rel))continue;
    seen.add(rel);
    const l=await files.list(folder.id,rel).catch(()=>null);
    if(!listingCompleta(l))return {status:'error',error:'limit',message:'La carpeta es demasiado amplia o el listado está incompleto. Elegí WTF/Account/<tu cuenta>/SavedVariables.'};
    for(const e of l.entries){
      if(!safeSyncPath(e.path)||typeof e.name!=='string'||!e.name||
         (rel&&!e.path.startsWith(rel+'/'))||
         e.path.split('/').at(-1)!==e.name)
        return {status:'error',error:'invalid-path',message:'El listado del permiso devolvió una ruta no segura; no se leyó esa ruta.'};
      if(e.isDirectory){
        if(SKIP_DIRS.includes(e.name))continue;
        if(depth>=WALK_DEPTH||queue.length+seen.size>=WALK_DIRS)
          return {status:'error',error:'limit',message:'La carpeta es demasiado amplia. Elegí WTF/Account/<tu cuenta>/SavedVariables.'};
        queue.push({rel:e.path,depth:depth+1});
      }else if(e.name===AUCTION_FILE)found.add(e.path);
    }
  }
  if(queue.length)return {status:'error',error:'limit',message:'La búsqueda no se completó dentro del permiso. Elegí WTF/Account/<tu cuenta>/SavedVariables.'};
  const hits=[];
  for(const rel of found){
    const hit=rel===AUCTION_FILE&&direct?direct:await readAuction(files,folder,rel).catch(()=>null);
    if(hit)hits.push(hit);
  }
  // Un archivo suelto en la raíz no gana sobre una cuenta anidada: ambas
  // opciones son candidatas y la ambigüedad se resuelve con otra concesión.
  if(hits.length>1)return {status:'error',error:'ambiguous',message:'Hay varios Auctionator.lua (incluida una copia en la raíz). Elegí la carpeta SavedVariables de la cuenta que querés seguir.'};
  return hits[0]||null;
}
async function leerAuctionatorRaw(ctx,req={}){
  if(auctionBusy)return {status:'busy'};
  const files=filesApi(ctx);if(!files)return {status:'unavailable'};
  auctionBusy=true;
  try{
    if(!req.pick){
      if(req.silent&&typeof files.folders!=='function')return {status:'unavailable'};
      const granted=typeof files.folders==='function'?await files.folders():[];
      let preferred=await ctx?.storage?.get?.('auctionator-folder');
      const available=Array.isArray(granted)?granted:[];
      if(preferred&&!available.some(f=>f.id===preferred)){
        preferred=null;
        await ctx?.storage?.set?.('auctionator-folder',null);
      }
      const folders=available.filter(f=>!preferred||f.id===preferred);
      const hits=[];
      for(const folder of folders){
        const hit=await findInFolder(files,folder);
        if(hit?.status==='error')return hit;
        if(hit)hits.push({...hit,stored:true});
      }
      if(hits.length>1)return {status:'error',error:'ambiguous',message:'Hay varias carpetas con precios. Elegí otra carpeta y seleccioná SavedVariables de tu cuenta.'};
      if(hits.length)return hits[0];
      if(req.silent)return folders.length ? {status:'error',error:'missing',message:'No se encontró Auctionator.lua. Los precios están en WTF/Account/<tu cuenta>/SavedVariables, no en Interface/AddOns.'} : {status:'no-folder'};
    }
    const picked=await files.requestFolder();
    if(!picked?.ok||!picked.folder)return {status:'cancelled'};
    const hit=await findInFolder(files,picked.folder);
    if(!hit)return {status:'error',error:'invalid',message:'No hay un Auctionator.lua con precios en esa carpeta. Elegí WTF/Account/<tu cuenta>/SavedVariables.'};
    if(hit.status==='ok')await ctx?.storage?.set?.('auctionator-folder',picked.folder.id);
    return hit;
  }finally{auctionBusy=false;}
}
// API pública: todo resultado (éxito, error o cancelación) queda sellado como
// desconocido y no comparable. Ningún llamador puede promoverlo sin una fuente
// aislada verificada explícita (market-source.js).
export async function leerAuctionator(ctx,req={}){return withGuard(await leerAuctionatorRaw(ctx,req));}
