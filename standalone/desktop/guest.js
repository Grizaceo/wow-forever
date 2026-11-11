/* Runs only inside the opaque, offline document. No Hermes SDK in this realm. */
(() => {
  'use strict';
  const {nonce, initial, standaloneUrl}=window.HunterDesktopConfig;
  const channel='wow-hunter-guide/v1', pending=new Map();
  let nextId=0, build=initial.build||null, market=initial.market||{}, revision=initial.revision||0;
  function request(op,value){
    return new Promise((resolve,reject)=>{
      const id=++nextId;
      // Never guess whether a timed-out write committed: block subsequent saves
      // until the page is reopened and its durable state has been read again.
      const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Sin respuesta de Hermes; usá Reabrir antes de guardar otra vez.'));},20000);
      pending.set(id,{resolve,reject,timer});
      parent.postMessage({channel,nonce,id,op,value},'*');
    });
  }
  addEventListener('message',e=>{
    const m=e.data;
    if(e.source!==parent||m?.channel!==channel||m.nonce!==nonce||!Number.isSafeInteger(m.id))return;
    const p=pending.get(m.id);if(!p)return;
    pending.delete(m.id);clearTimeout(p.timer);
    if(m.ok)p.resolve(m.value);else p.reject(new Error(m.error||'No se pudo guardar en Hermes.'));
  });
  let buildQueue=Promise.resolve(), saveFailed=false;
  const status=(text,bad=false)=>{
    let el=document.getElementById('hermesSaveStatus');
    if(!el){el=document.createElement('div');el.id='hermesSaveStatus';el.role='status';el.style.cssText='position:sticky;top:0;z-index:100;padding:8px 16px;background:var(--panel,#18201b);color:var(--text,#e3e8dc);font:13px system-ui';document.body.prepend(el);}
    el.textContent=text;el.dataset.failed=String(bad);
  };
  function saveBuild(value){
    status('Guardando progreso en Hermes…');
    buildQueue=buildQueue.then(async()=>{
      if(saveFailed)throw new Error('Hay un guardado sin confirmar; usá Reabrir.');
      await request('build',value);
      status('Progreso guardado localmente en Hermes.');
    }).catch(e=>{saveFailed=true;status(e.message+' Los últimos cambios podrían no estar guardados.',true);});
  }
  // Hydrated before the original application's very first read/render.
  Object.defineProperty(window,'localStorage',{value:{
    getItem:key=>key==='wowhunter-build-v2'?build:null,
    setItem:(key,value)=>{if(key!=='wowhunter-build-v2')throw new Error('Clave no admitida');build=String(value);saveBuild(build);},
    removeItem:key=>{if(key==='wowhunter-build-v2'){build=null;saveBuild(null);}}
  }});
  window.HunterStandaloneUrl=standaloneUrl;
  // Disk read of the game's Auctionator.lua via user-granted folders (ctx.files).
  if(initial.auction)window.HunterAuctionDisk={read:opts=>request('auction',{action:'read',...(opts||{})})};
  Object.defineProperty(navigator,'clipboard',{value:{writeText:text=>request('clipboard',String(text))}});
  window.HunterConfirm=text=>new Promise(resolve=>{
    const d=document.createElement('dialog'), p=document.createElement('p'), yes=document.createElement('button'), no=document.createElement('button');
    p.textContent=text;yes.textContent='Confirmar';no.textContent='Cancelar';
    yes.className=no.className='btn';d.style.cssText='max-width:440px;background:#18201b;color:#e3e8dc;border:1px solid #728166;border-radius:12px;padding:20px';
    d.append(p,no,yes);document.body.append(d);
    const done=v=>{d.close();d.remove();resolve(v);};
    yes.onclick=()=>done(true);no.onclick=()=>done(false);d.oncancel=e=>{e.preventDefault();done(false);};d.showModal();no.focus();
  });
  // The existing UI keeps its transactional contract; only the storage door
  // changes. The parent acknowledges after file write, readback and pointer.
  let marketFailed=false;
  window.HunterMarketStorage={transaction:async(mode,action)=>{
    if(marketFailed)throw new Error('Usá Reabrir para recuperar el estado guardado.');
    const values=structuredClone(market), reads=[];let result, aborted=false;
    const store={
      get:key=>{const req={};reads.push(()=>req.onsuccess?.({target:{result:structuredClone(values[key])}}));return req;},
      put:(value,key)=>{values[key]=structuredClone(value);},
      delete:key=>{delete values[key];}
    };
    action(store,v=>{result=v;},{abort:()=>{aborted=true;}});
    for(const read of reads)read();
    if(aborted)throw new Error('Transacción abortada.');
    if(mode==='readwrite'){
      try{const saved=await request('market',{values,revision});revision=saved.revision;market=values;}
      catch(e){marketFailed=true;throw e;}
    }
    return result;
  }};
  // Accumulated price history: same transactional contract over its own slot
  // files (price-history-*.json) and pointer, independent revision counter.
  let historyFailed=false, histStore=initial.history?.store??null, histRevision=initial.history?.revision||0;
  window.HunterMarketHistory={transaction:async(mode,action)=>{
    if(historyFailed)throw new Error('Usá Reabrir para recuperar el estado guardado.');
    const values={store:structuredClone(histStore)}, reads=[];let result,aborted=false;
    const store={
      get:key=>{const req={};reads.push(()=>req.onsuccess?.({target:{result:structuredClone(values[key])}}));return req;},
      put:(value,key)=>{values[key]=structuredClone(value);},
      delete:key=>{delete values[key];}
    };
    action(store,v=>{result=v;},{abort:()=>{aborted=true;}});
    for(const read of reads)read();
    if(aborted)throw new Error('Transacción abortada.');
    if(mode==='readwrite'){
      try{const saved=await request('history',{store:values.store,revision:histRevision});histRevision=saved.revision;histStore=values.store;}
      catch(e){historyFailed=true;throw e;}
    }
    return result;
  }};
  addEventListener('beforeunload',()=>{for(const p of pending.values())clearTimeout(p.timer);});
})();
