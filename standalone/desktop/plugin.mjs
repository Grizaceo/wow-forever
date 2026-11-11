import React,{useEffect,useMemo,useRef,useState} from 'react';
import {SIDEBAR_NAV_AREA,ROUTES_AREA,PALETTE_AREA,host} from '@hermes/plugin-sdk';
/* HUNTER_BUNDLE */
/* HUNTER_STORE */
const h=React.createElement, PATH='/wow-hunter-guide', CHANNEL='wow-hunter-guide/v1';
const safeJSON=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
// Reads Auctionator.lua ONLY from a folder the user grants with the app's own
// folder picker (ctx.files.requestFolder). Hermes remembers the grant per plugin
// and the user can revoke it in Capabilities -> Plugins -> Folder access.
// Nothing outside the granted folder is listed or read; no raw desktop bridge.
// The user should pick WTF/Account/<account>/SavedVariables; a bounded walk
// inside the grant also finds the file if they picked a parent folder.
const AUCTION_FILE='Auctionator.lua', AUCTION_MARK='AUCTIONATOR_PRICE_DATABASE', WALK_DIRS=80, WALK_DEPTH=4;
let auctionBusy=false;
const filesApi=ctx=>{const f=ctx?.files;return f&&typeof f.requestFolder==='function'&&typeof f.readText==='function'&&typeof f.list==='function'&&typeof f.folders==='function'?f:null;};
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
async function auctionScan(ctx,req={}){
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
export default {
  id:'wow-hunter-guide',name:'WoW Forever',version:'1.1.0',
  description:'Guía offline de WoW Forever y mercado Auctionator local. Solo lee Auctionator.lua de la carpeta que concedas.',
  defaultEnabled:true,
  register(ctx){
    const store=createStore(ctx);
    function Page(){
      const frame=useRef(null),[initial,setInitial]=useState(null),[error,setError]=useState(''),[reload,setReload]=useState(0);
      const nonce=useMemo(()=>crypto.randomUUID(),[reload]);
      const auction=!!filesApi(ctx);
      useEffect(()=>{let active=true;setInitial(null);setError('');store.read().then(v=>{if(active)setInitial({...v,auction});}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[reload]);
      useEffect(()=>{
        if(!initial)return;
        let active=true,lastId=0;
        const handler=async e=>{
          const m=e.data,target=frame.current?.contentWindow;
          // Opaque origin on purpose. Bind BOTH source window and per-mount nonce.
          // Guest ids are a monotonic sequence: a watermark rejects replays
          // without a set that can saturate and wedge every later save.
          if(!target||e.source!==target||e.origin!=='null'||m?.channel!==CHANNEL||m.nonce!==nonce||!Number.isSafeInteger(m.id)||m.id<1||m.id<=lastId)return;
          if(!['build','market','history','clipboard','auction'].includes(m.op))return;
          lastId=m.id;let reply;
          try{
            let value;
            if(m.op==='build')value=await store.build(m.value);
            if(m.op==='market')value=await store.market(m.value);
            if(m.op==='history')value=await store.history(m.value);
            if(m.op==='auction')value=await auctionScan(ctx,m.value||{});
            if(m.op==='clipboard'){
              if(typeof m.value!=='string'||m.value.length>128*1024)throw new Error('Texto de portapapeles inválido.');
              if(!(await ctx.os.writeClipboard(m.value)))throw new Error('No se pudo copiar al portapapeles.');value=true;
            }
            reply={ok:true,value};
          }catch(e){console.error('[wow-hunter-guide] '+m.op+' failed:',e);reply={ok:false,error:e.message||'Error de persistencia local.'};}
          if(active&&frame.current?.contentWindow===target)target.postMessage({channel:CHANNEL,nonce,id:m.id,...reply},'*');
        };
        window.addEventListener('message',handler);return()=>{active=false;window.removeEventListener('message',handler);};
      },[initial,nonce]);
      const srcDoc=useMemo(()=>initial?HUNTER_HTML.replace('/*HUNTER_BOOT*/',()=>`window.HunterDesktopConfig=${safeJSON({nonce,initial,standaloneUrl:HUNTER_STANDALONE})};\n${HUNTER_GUEST}`):'',[initial,nonce]);
      return h('div',{style:{display:'flex',flexDirection:'column',height:'100%',minHeight:0}},
        h('div',{style:{display:'flex',gap:12,alignItems:'center',padding:'8px 16px',borderBottom:'1px solid var(--border)',fontSize:12}},
          h('strong',null,'WoW Forever'),h('span',{style:{flex:1,opacity:.75}},'Guía y precios locales · progreso independiente del navegador · sin conexión al juego'),
          h('button',{onClick:async()=>{await store.reset();setReload(v=>v+1);},style:{cursor:'pointer'}},'Reabrir')),
        error?h('div',{role:'alert',style:{padding:24}},error):initial?
          h('iframe',{ref:frame,title:'Senda del Cazador — WoW Forever',sandbox:'allow-scripts',srcDoc,style:{border:0,width:'100%',flex:1,minHeight:0,background:'#0f1713'}}):
          h('p',{role:'status',style:{padding:24}},'Cargando guía local…'));
    }
    ctx.registerMany([
      {id:'nav',area:SIDEBAR_NAV_AREA,order:73,data:{path:PATH,label:'WoW Forever',codicon:'target'}},
      {id:'route',area:ROUTES_AREA,data:{path:PATH},render:()=>h(Page)},
      {id:'open',area:PALETTE_AREA,data:{id:'wow-hunter-guide.open',label:'WoW Forever: abrir guía y mercado local',keywords:['wow','forever','guía','auctionator'],run:()=>host.navigate(PATH)}}
    ]);
  }
};
