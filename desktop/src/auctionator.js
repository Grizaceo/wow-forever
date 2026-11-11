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
const dataUrlText=url=>{const b64=String(url).slice(String(url).indexOf(',')+1);const bin=atob(b64);const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return new TextDecoder('utf-8').decode(bytes);};
async function readAuction(files,folder,rel){
  let r=await files.readText(folder.id,rel);
  let text=r?.ok&&typeof r.text==='string'?r.text:null;
  // readText stops at 4 MiB; a big realm DB can exceed it, readDataUrl allows 16 MiB.
  if(!text&&r?.error==='too-large'&&typeof files.readDataUrl==='function'){
    const d=await files.readDataUrl(folder.id,rel);
    if(d?.ok&&typeof d.url==='string')text=dataUrlText(d.url);
  }
  if(!text||!text.includes(AUCTION_MARK))return null;
  return {status:'ok',text,path:folder.name+'/'+rel,byteSize:text.length};
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
