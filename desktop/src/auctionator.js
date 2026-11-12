// Lectura de Auctionator.lua con ctx.files (carpeta concedida por el usuario). Probado en
// standalone/tests/desktop-browser.mjs en el commit 74e10f1: solo lee dentro del permiso.
// Reads Auctionator.lua ONLY from a folder the user grants with the app's own
// folder picker (ctx.files.requestFolder). Hermes remembers the grant per plugin
// and the user can revoke it in Capabilities -> Plugins -> Folder access.
// Nothing outside the granted folder is listed or read; no raw desktop bridge.
// The user should pick WTF/Account/<account>/SavedVariables; a bounded walk
// inside the grant also finds the file if they picked a parent folder.
const AUCTION_FILE='Auctionator.lua', AUCTION_MARK='AUCTIONATOR_PRICE_DATABASE', WALK_DIRS=80, WALK_DEPTH=4;
let auctionBusy=false;
export const filesApi=ctx=>{const f=ctx?.files;return f&&typeof f.requestFolder==='function'&&typeof f.readText==='function'&&typeof f.list==='function'&&typeof f.folders==='function'?f:null;};
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
async function findInFolder(files,folder){
  const direct=await readAuction(files,folder,AUCTION_FILE).catch(()=>null);
  if(direct)return direct;
  const queue=[{rel:'',depth:0}],found=[];let seen=0;
  while(queue.length&&seen<WALK_DIRS&&found.length<10){
    const {rel,depth}=queue.shift();seen++;
    const l=await files.list(folder.id,rel).catch(()=>null);
    if(!l?.ok)continue;
    for(const e of l.entries||[]){
      if(e.isDirectory){if(depth<WALK_DEPTH)queue.push({rel:e.path,depth:depth+1});}
      else if(e.name===AUCTION_FILE)found.push(e.path);
    }
  }
  let best=null;
  for(const rel of found){const hit=await readAuction(files,folder,rel).catch(()=>null);if(hit&&(!best||hit.byteSize>best.byteSize))best=hit;}
  return best;
}
export async function leerAuctionator(ctx,req={}){
  if(auctionBusy)return {status:'busy'};
  const files=filesApi(ctx);if(!files)return {status:'unavailable'};
  auctionBusy=true;
  try{
    if(!req.pick){
      const granted=await files.folders().catch(()=>[]);
      for(const folder of Array.isArray(granted)?granted:[]){
        const hit=await findInFolder(files,folder).catch(()=>null);
        if(hit)return {...hit,stored:true};
      }
    }
    const picked=await files.requestFolder();
    if(!picked?.ok||!picked.folder)return {status:'cancelled'};
    const hit=await findInFolder(files,picked.folder).catch(()=>null);
    if(!hit)return {status:'error',error:'invalid',message:'No hay un Auctionator.lua con precios en esa carpeta. Elegí WTF/Account/<tu cuenta>/SavedVariables.'};
    return hit;
  }finally{auctionBusy=false;}
}
