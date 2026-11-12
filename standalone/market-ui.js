/* Local market UI. No network, game access, executable Lua or character data. */
(() => {
  'use strict';
  const DB_NAME='wowhunter-market-v1', STORE='market', PAGE_SIZE=50;
  const EPOCH=Date.UTC(2020,0,1), DAY=86400000;
  // El snapshot persistido conserva solo una ventana reciente por ítem (el
  // store acumulado tiene la serie completa); el presupuesto deja margen bajo
  // el límite de 4 MiB por archivo de ctx.files en Hermes Desktop.
  const SNAPSHOT_KEEP_DAYS=5, HISTORY_MAX_BYTES=4194304-4096;
  let snapshot=null, historyStore=null, histInfo=null, realmName='', root=null, level=12, query='', onlyFresh=false, onlySources=false, page=0, detailKey=null;
  let loading=true, job=null, message='Cargando el mercado guardado…', dbPromise=null;
  let opts=null, sortMode='price', onlyFarmable=false, mcache={key:'',map:new Map()};
  let onlyDeals=false, dealCache={key:'',map:new Map()};
  let statusListener=null;
  // Every imported/catalog string goes through esc before HTML interpolation;
  // unescaped interpolations below are validated integers or our static markup.
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today=()=>Math.floor((Date.now()-EPOCH)/DAY);
  const date=day=>Number.isSafeInteger(day)?new Date(EPOCH+day*DAY).toISOString().slice(0,10):'Sin fecha';
  const money=c=>`${Math.floor(c/10000)}g ${Math.floor(c%10000/100)}s ${c%100}c`;
  const catalog=()=>window.HunterMarketCatalog;
  const info=item=>item.itemId===null?null:catalog()?.items?.[String(item.itemId)];
  const itemName=item=>info(item)?.name|| (item.itemId===null?'Variante sin ID simple':`Ítem #${item.itemId}`);
  const realm=()=>snapshot?.realms.find(r=>r.name===realmName);
  const recent=item=>item.observedDay!==null&&item.observedDay<=today()&&today()-item.observedDay<=3;
  const age=item=>item.observedDay===null?'Sin fecha':item.observedDay>today()?'Fecha futura: comprobar':recent(item)?'Reciente (≤3 días)':'Antiguo (>3 días)';
  function snapshotStatus(){
    if(!snapshot)return null;
    const items=realm()?.items||[];let maxDay=null;
    for(const i of items)if(i.observedDay!=null&&(maxDay===null||i.observedDay>maxDay))maxDay=i.observedDay;
    return{importedAt:snapshot.importedAt,realm:realmName,items:items.length,maxDay};
  }
  const marketStatus=()=>{const s=snapshotStatus();return s?{...s,loading:false,histDays:histInfo?.days||0,histEntries:histInfo?.entries||0}:{loading,histDays:0,histEntries:0};};
  const farmOn=()=>!!(window.HunterFarm&&window.HunterDropData);
  const farmProfile=()=>{const o=opts||{};return{level:o.level??level,cls:o.cls||'hunter',fac:o.fac||'horde',spec:o.spec||'',pref:o.pref||'any',hubZones:o.hubZones||''};};
  const farmSettings=()=>opts?.farm||{comp:'auto',zoneComp:{},gph:5,prof:{skin:false,herb:false,mine:false},group:false,pvp:true,n:5,session:2};
  const metricKey=()=>{const o=opts||{};return JSON.stringify([o.level,o.cls,o.fac,o.spec,o.pref,o.hubZones,o.farm,realmName,snapshot?.importedAt||'']);};
  function metricOf(item){
    if(!farmOn()||!item.itemId)return null;
    const k=metricKey();
    if(mcache.key!==k)mcache={key:k,map:new Map()};
    if(!mcache.map.has(item.sourceKey))mcache.map.set(item.sourceKey,window.HunterFarm.itemMetrics(item,farmProfile(),farmSettings()));
    return mcache.map.get(item.sourceKey);
  }
  // dealInfo es pura por ítem; el cache se invalida al cambiar de import o realm.
  function dealOf(item){
    if(!window.HunterDeals||typeof window.HunterDeals.dealInfo!=='function')return null;
    const k=(snapshot?.importedAt||'')+'|'+realmName;
    if(dealCache.key!==k)dealCache={key:k,map:new Map()};
    if(!dealCache.map.has(item.sourceKey))dealCache.map.set(item.sourceKey,window.HunterDeals.dealInfo(item));
    return dealCache.map.get(item.sourceKey);
  }
  function dealBadge(i){
    const d=dealOf(i);
    if(!d||(d.kind!=='oferta'&&d.kind!=='sobreprecio'))return '';
    const pct=Math.round(Math.abs(d.discount)*100);
    const cls=d.kind==='oferta'?'deal':'pricy';
    const tip=`vs mediana ${money(d.medianaLow)} · ${d.days} días de muestra · confianza ${d.confidence} (approx)`;
    return `<span class="badge ${cls}" title="${esc(tip)}">${d.kind==='oferta'?'oferta':'caro'} ${d.discount>0?'−':'+'}${pct}%</span>`;
  }
  function farmCell(i){
    if(!farmOn())return '<span class="muted">—</span>';
    const m=metricOf(i),fmt=window.HunterFarm.fmt;
    if(!m||!i.itemId)return '<span class="muted">Sin ID</span>';
    const doubt=m.doubtful?' · precio dudoso (≤2 ofertas, tope 50× vendedor)':'';
    if(m.farmable&&m.best){
      const s=m.best;
      const kind=s.kind==='mob'?'':s.kind==='skin'?'Piel: ':s.kind==='pick'?'Pillosidad: ':s.kind==='object'?`${s.objKind||'objeto'}: `:s.kind==='rare-obs'?'Rareza observada: ':s.kind==='chest-obs'?'Cofre observado: ':'';
      const lvl=s.lvlMin!=null||s.lvlMax!=null?`nv ${s.lvlMin??'?'}–${s.lvlMax??'?'} `:'';
      const rank={normal:'normal',elite:'élite',rareelite:'élite rara',rare:'rara',boss:'jefe'}[s.rank]||'';
      const roi=m.roi==null?'':` · ROI ${m.roi>=0?'+':''}${Math.round(m.roi*100)}%`;
      return `${esc(kind+s.name)} · ${esc(fmt.zoneName(s.zoneKey))} · ${lvl}${rank?rank+' · ':''}${fmt.pct(s.chance)} · ~${esc(fmt.gph(m.gph))}/h${roi}${doubt} <span class="badge">farmeable</span>`;
    }
    if(m.sources.length){
      const inel=m.sources.filter(s=>!s.eligible).sort((a,b)=>(b.gph||0)-(a.gph||0))[0]||m.sources[0];
      return `No farmeable con tu ficha (${esc(inel.reason||'sin fuente elegible')})${doubt}`;
    }
    return 'Sin dato de drop';
  }
  function farmCtx(){
    return{profile:farmProfile(),settings:farmSettings(),items:realm()?.items||[],
      saveFarm:f=>{opts={...opts,farm:f};if(opts.saveFarm)opts.saveFarm(f);},refresh:syncFarm};
  }
  function syncFarm(){
    const fe=root?.querySelector('#farmRoot');
    if(fe&&window.HunterFarm)window.HunterFarm.render(fe,farmCtx());
    paintRows();
  }
  function openDB(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,1);
      let expired=false;
      const timer=setTimeout(()=>{expired=true;reject(new Error('storage'));},4000);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
      request.onsuccess=()=>{clearTimeout(timer);if(expired){request.result.close();return;}request.result.onversionchange=()=>{request.result.close();dbPromise=null;};resolve(request.result);};
      request.onerror=()=>{clearTimeout(timer);reject(new Error('storage'));};
    }).catch(e=>{dbPromise=null;throw e;});
    return dbPromise;
  }
  async function transaction(mode,action){
    if(window.HunterMarketStorage)return window.HunterMarketStorage.transaction(mode,action);
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,mode), store=tx.objectStore(STORE);
      let result;
      tx.oncomplete=()=>resolve(result);
      tx.onerror=tx.onabort=()=>reject(new Error('storage'));
      try{action(store,value=>{result=value;},tx);}catch(e){try{tx.abort();}catch(_){}reject(new Error('storage'));}
    });
  }
  function validSnapshot(s){
    return s?.schemaVersion===1&&s.sourceVersion===8&&typeof s.importedAt==='string'&&Number.isFinite(Date.parse(s.importedAt))&&
      Array.isArray(s.warnings)&&s.warnings.every(w=>typeof w==='string')&&Array.isArray(s.realms)&&s.realms.length>0&&s.realms.length<=100&&
      s.realms.every(r=>typeof r.name==='string'&&Array.isArray(r.items)&&r.items.length<=100000&&r.items.every(i=>
        typeof i.sourceKey==='string'&&(i.itemId===null||(Number.isSafeInteger(i.itemId)&&i.itemId>0))&&
        Number.isSafeInteger(i.unitPriceCopper)&&i.unitPriceCopper>0&&(i.observedDay===null||(Number.isSafeInteger(i.observedDay)&&i.observedDay>=0&&i.observedDay<=100000))&&
        Array.isArray(i.history)&&i.history.length<=10000&&i.history.every(h=>Number.isSafeInteger(h.day)&&h.day>=0&&h.day<=100000&&
          Number.isSafeInteger(h.low)&&h.low>0&&Number.isSafeInteger(h.high)&&h.high>=h.low&&(h.available===null||(Number.isSafeInteger(h.available)&&h.available>=0)))));
  }
  // El historial acumulado vive en su propio canal: clave 'history' del mismo
  // object store en IndexedDB, o la op 'history' de Hermes Desktop (archivos
  // price-history-*.json con el mismo patrón slot+read-back que el mercado).
  function histTx(mode,action){
    if(window.HunterMarketHistory)return window.HunterMarketHistory.transaction(mode,action);
    return transaction(mode,(store,done,tx)=>action({
      get:()=>store.get('history'),
      put:v=>store.put(v,'history'),
      delete:()=>store.delete('history')
    },done,tx));
  }
  async function loadHistoryStore(){
    try{
      const v=await histTx('readonly',(store,done)=>{store.get('store').onsuccess=e=>done(e.target.result);});
      return window.HunterHistory&&window.HunterHistory.validStore(v)?v:null;
    }catch(_){return null;}
  }
  async function persistHistory(store){
    const expected=JSON.stringify(store);
    await histTx('readwrite',(s,done,tx)=>{
      s.put(store,'store');
      s.get('store').onsuccess=e=>{if(JSON.stringify(e.target.result)!==expected)tx.abort();else done(true);};
    });
  }
  function computeHistInfo(store){
    if(!store||!window.HunterHistory)return null;
    const seen=new Set();let entries=0;
    for(const rn of Object.keys(store.realms||{}))for(const k of Object.keys(store.realms[rn].items||{}))
      for(const r of store.realms[rn].items[k]){entries++;seen.add(r[0]);}
    return{days:seen.size,entries};
  }
  // Commit de un import: el snapshot guardado queda con ventana reciente y el
  // store acumula la serie completa. Si el guardado del historial falla, el
  // scan igual queda persistido (la próxima importación reintenta el merge,
  // que es aditivo e idempotente).
  async function commitSnapshot(raw,name,bundledId){
    const H=window.HunterHistory;
    if(!H||typeof H.storeMerge!=='function'){await persist(raw,name,bundledId);snapshot=raw;return{histOk:true};}
    const shallow=H.trimSnapshotHistory(raw,SNAPSHOT_KEEP_DAYS);
    const base=historyStore||(snapshot?H.storeFromSnapshot(snapshot):H.emptyStore());
    const merged=H.fitStore(H.storeMerge(base,raw),HISTORY_MAX_BYTES);
    await persist(shallow,name,bundledId);
    let histOk=true;
    try{await persistHistory(merged);}catch(_){histOk=false;}
    if(histOk){historyStore=merged;histInfo=computeHistInfo(merged);}
    snapshot=H.applyStore(shallow,histOk?merged:historyStore);
    return{histOk};
  }
  async function restore(){
    try{
      const saved=await transaction('readonly',(store,done)=>{
        const values={};store.get('snapshot').onsuccess=e=>{values.snapshot=e.target.result;done(values);};
        store.get('realm').onsuccess=e=>{values.realm=e.target.result;done(values);};
        store.get('bundledScan').onsuccess=e=>{values.bundledScan=e.target.result;done(values);};
      });
      historyStore=await loadHistoryStore();
      histInfo=computeHistInfo(historyStore);
      if(saved.snapshot&&!validSnapshot(saved.snapshot))throw new Error('invalid');
      snapshot=saved.snapshot||null;
      if(snapshot&&historyStore&&window.HunterHistory)snapshot=window.HunterHistory.applyStore(snapshot,historyStore);
      realmName=snapshot?.realms.some(r=>r.name===saved.realm)?saved.realm:snapshot?.realms[0]?.name||'';
      message=snapshot?'Scan local restaurado. Los precios no son ventas.':'Elegí Auctionator.lua para importar precios locales.';
      const bundled=window.HunterMarketLocalScan;
      if(bundled&&bundled.id!==saved.bundledScan){
        if(!/^[a-f0-9]{64}$/.test(bundled.id)||!validSnapshot(bundled.snapshot))throw new Error('invalid');
        // Only once: later manual imports and a deliberate clear must win.
        if(snapshot&&Date.parse(snapshot.importedAt)>Date.parse(bundled.snapshot.importedAt)){
          await transaction('readwrite',store=>store.put(bundled.id,'bundledScan'));
        }else{
          const name=bundled.snapshot.realms[0].name;
          await commitSnapshot(bundled.snapshot,name,bundled.id);
          realmName=name;
          message='Scan reciente precargado y guardado localmente. Los precios no son ventas.';
        }
      }
    }catch(e){message='No se pudo leer el almacenamiento local. No se borró ningún dato; podés reintentar una importación.';}
    loading=false;paint();
  }
  async function persist(s,name,bundledId){
    // Read back within the same transaction: a mismatch aborts the replacement.
    const expected=JSON.stringify(s);
    await transaction('readwrite',(store,done,tx)=>{
      store.put(s,'snapshot');store.put(name,'realm');
      if(bundledId)store.put(bundledId,'bundledScan');
      store.get('snapshot').onsuccess=e=>{if(JSON.stringify(e.target.result)!==expected)tx.abort();else done(true);};
    });
  }
  function release(j){
    clearTimeout(j.timer);if(j.worker)j.worker.terminate();if(j.url)URL.revokeObjectURL(j.url);
  }
  function finish(j,text){if(job!==j)return;release(j);job=null;message=text;paint();}
  async function importFile(file,note){
    if(!file||loading||job)return;
    if(!window.HunterMarket||file.size===0||file.size>HunterMarket.MAX_BYTES){message='No se importó: archivo vacío, demasiado grande (máximo 8 MiB) o parser no disponible. Se conserva el scan anterior.';paint();return;}
    const j={committing:false,worker:null,url:null,timer:null};job=j;
    message='Leyendo y validando Auctionator.lua localmente…';paint();
    j.timer=setTimeout(()=>{if(!j.committing)finish(j,'No se importó: se agotó el tiempo de lectura. Se conserva el scan anterior.');},15000);
    try{
      // Paint acknowledgement before file IO and parsing; parsing is off the UI thread.
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const buffer=await file.arrayBuffer();if(job!==j)return;
      j.url=URL.createObjectURL(new Blob([HunterMarket.workerSource],{type:'application/javascript'}));
      j.worker=new Worker(j.url);
      j.worker.onerror=()=>finish(j,'No se importó: no se pudo procesar el archivo de forma segura. Se conserva el scan anterior.');
      j.worker.onmessage=async e=>{
        if(job!==j)return;
        const next=e.data?.snapshot;
        if(!e.data?.ok||!validSnapshot(next)){finish(j,'No se importó: datos inválidos, versión no compatible o archivo incompleto. Se conserva el scan anterior.');return;}
        release(j);j.committing=true;message='Validación terminada. Guardando el scan local…';paint();
        const selected=next.realms.some(r=>r.name===realmName)?realmName:next.realms[0].name;
        try{
          const res=await commitSnapshot(next,selected);
          if(job!==j)return;
          realmName=selected;page=0;detailKey=null;
          finish(j,(res.histOk?'Importación guardada y verificada en este navegador. Ningún dato salió del PC.':'Importación guardada; el historial acumulado no se pudo persistir y se reintentará en la próxima importación.')+(note?' · '+note:''));
        }catch(_){finish(j,'No se importó: no se pudo guardar (espacio o permisos del navegador). Se conserva el scan anterior.');}
      };
      j.worker.postMessage(buffer,[buffer]);
    }catch(_){finish(j,'No se importó: no se pudo leer el archivo. Se conserva el scan anterior.');}
  }
  function cancel(){if(job&&!job.committing)finish(job,'Importación cancelada. Se conserva el scan anterior.');}
  // Hermes desktop only: the parent auto-detects the game's Auctionator.lua
  // (or asks once via file picker) and returns its text for the same
  // worker/parser pipeline as a manual pick.
  async function diskImport(){
    if(!window.HunterAuctionDisk||loading||job)return;
    message='Leyendo Auctionator.lua de la carpeta concedida…';paint();
    let r;
    try{r=await window.HunterAuctionDisk.read();}
    catch(e){message='No se pudo leer desde el juego: '+(e.message||'error')+'. También podés importar el archivo a mano.';paint();return;}
    if(r?.status==='ok'&&typeof r.text==='string'&&r.text.length){
      importFile(new File([r.text],'Auctionator.lua',{type:'text/plain'}),' Auctionator.lua (carpeta concedida)'+(r.path?' · '+r.path:''));
      return;
    }
    if(r?.status==='cancelled'){message='Elección de archivo cancelada. El scan anterior se conserva.';paint();return;}
    message='No se pudo leer Auctionator.lua de la carpeta concedida'+(r?.message?' ('+r.message+')':'')+'. También podés importar el archivo a mano.';paint();
  }
  async function clear(){
    if(job||loading||!snapshot||!(window.HunterConfirm?await window.HunterConfirm('¿Borrar solo los precios importados de esta app? No se toca el juego ni tu personaje.'):window.confirm('¿Borrar solo los precios importados de esta app? No se toca el juego ni tu personaje.')))return;
    loading=true;message='Borrando solo el mercado local…';paint();
    try{
      // El historial se vacía antes que el scan: si el borrado del mercado
      // fallara después, no quedan días huérfanos que puedan resucitar.
      if(window.HunterMarketHistory&&window.HunterHistory)await histTx('readwrite',(s,done)=>{s.put(window.HunterHistory.emptyStore(),'store');done(true);});
      await transaction('readwrite',store=>{store.delete('snapshot');store.delete('realm');store.delete('history');});
      snapshot=null;historyStore=null;histInfo=null;realmName='';detailKey=null;page=0;message='Mercado local borrado. El juego y tu personaje no cambiaron.';
    }
    catch(_){message='No se pudo borrar. Se conservan los datos.';}
    loading=false;paint();
  }
  function sourceSummary(item){
    const data=info(item);
    if(!data?.sources?.length)return 'Sin fuente comprobada en el catálogo local';
    const sources=data.sources;
    const relevant=sources.filter(s=>s.levelMin!==null&&s.levelMin<=level&&s.levelMax!==null&&level<=s.levelMax);
    const s=(relevant[0]||sources[0]);
    return `${s.boss} · ${s.dungeon}${s.levelMin!==null&&s.levelMax!==null?` · rango de grupo ${s.levelMin}–${s.levelMax}`:''}${relevant.length?' · en tu rango':''} · venta y solo sin comprobar${sources.length>1?` · +${sources.length-1} fuentes`:''}`;
  }
  function matchingItems(){
    const q=query.trim().toLocaleLowerCase('es'),hasF=farmOn();
    let items=(realm()?.items||[]).filter(i=>(!onlyFresh||recent(i))&&(!onlySources||info(i)?.sources?.some(s=>
      s.levelMin!==null&&s.levelMax!==null&&s.levelMin<=level&&level<=s.levelMax))&&
      (!q||`${itemName(i)} ${i.sourceKey} ${info(i)?.sources?.map(s=>`${s.boss} ${s.dungeon} ${s.location}`).join(' ')||''}`.toLocaleLowerCase('es').includes(q))
    );
    if(onlyFarmable&&hasF)items=items.filter(i=>metricOf(i)?.farmable);
    if(onlyDeals)items=items.filter(i=>dealOf(i)?.kind==='oferta');
    const sk=(i,k)=>{const m=metricOf(i);return m&&m.farmable?(k==='roi'?(m.roi??-999):m.gph):-999;};
    const dk=i=>dealOf(i)?.score??-Infinity;
    if(sortMode==='deals'&&window.HunterDeals)items.sort((a,b)=>dk(b)-dk(a)||a.sourceKey.localeCompare(b.sourceKey));
    else if(sortMode==='roi'&&hasF)items.sort((a,b)=>sk(b,'roi')-sk(a,'roi')||a.sourceKey.localeCompare(b.sourceKey));
    else if(sortMode==='gph'&&hasF)items.sort((a,b)=>sk(b,'gph')-sk(a,'gph')||a.sourceKey.localeCompare(b.sourceKey));
    else items.sort((a,b)=>b.unitPriceCopper-a.unitPriceCopper||a.sourceKey.localeCompare(b.sourceKey));
    return items;
  }
  function paintRows(){
    if(!root?.isConnected)return;
    const body=root.querySelector('#marketRows'), count=root.querySelector('#marketCount');
    const items=matchingItems();page=Math.min(page,Math.max(0,Math.ceil(items.length/PAGE_SIZE)-1));
    const sortTxt=sortMode==='price'?'precio descendente, no rentabilidad':sortMode==='roi'?'orden por ROI estimado (approx)':sortMode==='gph'?'orden por oro/hora estimado (approx)':sortMode==='deals'?'mejores ofertas vs mediana histórica (approx)':'precio descendente';
    count.textContent=snapshot?`${items.length} de ${realm()?.items.length||0} claves · ${sortTxt} · página ${page+1}/${Math.max(1,Math.ceil(items.length/PAGE_SIZE))}`:'Sin scan importado';
    body.innerHTML=!snapshot?'<tr><td colspan="6">Todavía no importaste precios. Seleccioná tu Auctionator.lua para empezar.</td></tr>':!items.length?'<tr><td colspan="6">No hay resultados para estos filtros. Probá otro ID, nombre, boss o realm.</td></tr>':items.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map(i=>{
      const daily=i.history.find(h=>h.day===i.observedDay),m=metricOf(i);
      return `<tr data-market-key="${esc(i.sourceKey)}" data-roi="${m&&m.farmable?(m.roi??-999).toFixed(4):'-999'}" data-gph="${m?m.gph.toFixed(1):''}"><td><button class="market-item" type="button" data-key="${esc(i.sourceKey)}">${esc(itemName(i))}</button>${dealBadge(i)}<div class="tip">Clave ${esc(i.sourceKey)}</div></td><td class="market-money">${money(i.unitPriceCopper)}</td><td>${esc(date(i.observedDay))}<div class="tip">${esc(age(i))}</div></td><td>${daily?.available===null||daily?.available===undefined?'Sin datos':daily.available}</td><td class="market-source">${esc(sourceSummary(i))}</td><td class="market-farm">${farmCell(i)}</td></tr>`;
    }).join('');
    root.querySelector('#marketPrev').disabled=page===0;
    root.querySelector('#marketNext').disabled=(page+1)*PAGE_SIZE>=items.length;
    body.querySelectorAll('button[data-key]').forEach(b=>b.addEventListener('click',()=>{detailKey=b.dataset.key;paintDetail();root.querySelector('#marketDetail').focus();}));
    paintDetail();
  }
  function paintDetail(){
    const el=root.querySelector('#marketDetail'), item=realm()?.items.find(i=>i.sourceKey===detailKey);
    el.hidden=!item;if(!item){el.innerHTML='';return;}
    const sources=info(item)?.sources||[];
    const fmt=window.HunterFarm?.fmt,m=metricOf(item);
    const fss=m?m.sources.slice().sort((a,b)=>Number(b.eligible)-Number(a.eligible)||(b.gph||0)-(a.gph||0)).slice(0,10):[];
    el.innerHTML=`<h3>${esc(itemName(item))} · clave ${esc(item.sourceKey)}</h3>
      <p class="muted">Último mínimo anunciado: ${money(item.unitPriceCopper)}. No es mediana ni precio de venta. La fecha corresponde al último día de precio registrado, no a esta importación.${m?.doubtful?' Precio dudoso (≤2 ofertas, tope 50× vendedor para estimar farmeo).':''}</p>
      <h4>Fuentes documentadas para investigar</h4>
      ${sources.length?`<ul>${sources.map(s=>`<li>${esc(s.boss)} · ${esc(s.dungeon)} · ${esc(s.location)}${s.bossLevel!==null?` · boss nivel ${esc(s.bossLevel)}`:''}<div class="tip">${esc(s.reference)}</div></li>`).join('')}</ul>`:'<p class="muted">Sin fuente comprobada. El ID no permite inventar nombre, enemigo o drop.</p>'}
      ${fss.length?`<h4>Fuentes de farmeo</h4><ul>${fss.map(s=>`<li>${esc(fmt.srcLabel(s))} · ${esc(fmt.zoneName(s.zoneKey))}${s.eligible?` · ${fmt.pct(s.chance)} · ~${esc(fmt.gph(s.gph))}/h${s.roi!=null?` · ROI ${s.roi>=0?'+':''}${Math.round(s.roi*100)}%`:''}`:` — ${esc(s.reason||'no elegible')}`}</li>`).join('')}</ul>`:''}
      <p class="tip">Catálogo parcial: ${esc(catalog()?.source?.addon||'catálogo local no disponible')}. No prueba ligadura, probabilidad de drop, venta ni viabilidad en solitario. Rango de dungeon ≠ requisito de equipo. Las estimaciones de farmeo son aproximadas (sección Farmeo recomendado); no son ventas.</p>
      ${(()=>{const st=window.HunterHistory?window.HunterHistory.priceStats(item):null;if(!st||!st.diasMuestra)return'';const tend={sube:'al alza',baja:'a la baja',estable:'estable','sin-datos':'pocos datos'}[st.tendencia]||st.tendencia;return`<p class="tip">Historial acumulado (approx, sobre el mínimo diario): ${st.diasMuestra} día${st.diasMuestra===1?'':'s'} de muestra · mínimo ${money(st.minLow)} · mediana ${money(st.medianaLow)} · media ${money(st.avgLow)} · tendencia ${esc(tend)}.</p>`;})()}
      ${(()=>{const d=dealOf(item);if(!d||d.kind==='sin-datos')return'';const verdict={oferta:'oferta',sobreprecio:'sobreprecio',estable:'precio típico'}[d.kind];return`<p class="tip">Análisis de oferta (approx): ${esc(verdict)} — ${esc(d.reasons.join(' '))} Mediana ${money(d.medianaLow)} · mínimo ${money(d.minLow)} · ${d.days} días de muestra${d.available!=null?` · ${d.available} oferta${d.available===1?'':'s'} observada${d.available===1?'':'s'} ese día`:''}.</p>`;})()}
      ${(()=>{const ch=window.HunterChart?window.HunterChart.priceChart(item.history,{current:item.unitPriceCopper}):'';return ch?`<h4>Precio mínimo diario · approx</h4><div class="market-chart">${ch}</div>`:'';})()}
      <h4>Historial diario</h4><div class="table-scroll"><table><thead><tr><th>Día (UTC)</th><th>Mínimo diario</th><th>Máximo de mínimos</th><th>Máxima oferta diaria</th></tr></thead><tbody>
      ${item.history.length?item.history.slice().sort((a,b)=>b.day-a.day).map(h=>`<tr><td>${date(h.day)}</td><td>${money(h.low)}</td><td>${money(h.high)}</td><td>${h.available===null?'Sin datos':h.available}</td></tr>`).join(''):'<tr><td colspan="4">Sin historial fechado.</td></tr>'}</tbody></table></div>`;
  }
  function paint(){
    statusListener?.(marketStatus());
    if(!root?.isConnected)return;
    root.dataset.busy=String(loading||!!job);
    const busy=loading||!!job;
    root.innerHTML=`<div class="card key"><h3>Mercado local · Auctionator</h3>
      <p class="muted">Full scan en Auctionator → <b>/reload</b> → ${window.HunterAuctionDisk?'<b>Leer Auctionator.lua</b> (la primera vez elegís la carpeta <b>SavedVariables</b> de tu cuenta; Hermes recuerda el permiso y podés revocarlo en Capacidades → Plugins)':'elegí <b>SavedVariables/Auctionator.lua</b>'}. Solo lee datos de precios; nunca ejecuta el archivo ni toca el juego.</p>
      <div class="market-toolbar"><label class="market-file">Importar Auctionator.lua<input id="marketFile" type="file" accept=".lua" ${busy?'disabled':''}></label>${window.HunterAuctionDisk?`<button id="marketDisk" type="button" class="btn" ${busy?'disabled':''}>Leer Auctionator.lua</button>`:''}<button id="marketCancel" type="button" class="btn" ${!job||job.committing?'disabled':''}>Cancelar importación</button><button id="marketClear" type="button" class="btn danger" ${busy||!snapshot?'disabled':''}>Borrar precios locales</button></div>
      <p id="marketStatus" role="status" aria-live="polite">${esc(message)}</p>
      <details class="fold"><summary><span class="arrow">▶</span>Privacidad y formato del archivo</summary><div class="fbody"><p class="tip" style="margin:0">Solo datos de precios por realm. Sin cuentas, personajes ni rutas del archivo. Lua se interpreta como datos; nunca se ejecuta. Máximo 8 MiB. El scan no se incluye en enlaces de build.</p></div></details></div>
      <div class="card warn"><h3>Oferta anunciada, no ventas</h3><p class="muted">Los precios son mínimos unitarios en cobre; la cantidad es la máxima oferta diaria observada, no stock actual ni unidades vendidas. Un ítem caro no demuestra demanda. Antiguo = más de 3 días; cada ítem conserva su fecha, aunque lo importes hoy. La DB no demuestra que el scan haya sido completo.</p></div>
      <div class="card"><div class="market-toolbar"><label>Realm de subasta<select id="marketRealm" ${busy||!snapshot?'disabled':''}>${snapshot?snapshot.realms.map((r,i)=>`<option value="${i}" ${r.name===realmName?'selected':''}>${esc(r.name)}</option>`).join(''):'<option>Sin realm</option>'}</select></label>
      <label class="market-search">Buscar por nombre, ID o fuente<input id="marketSearch" type="search" maxlength="150" value="${esc(query)}" placeholder="ID, ítem, dungeon o boss"></label></div>
      <div class="market-toolbar"><label class="chk"><input id="marketFresh" type="checkbox" ${onlyFresh?'checked':''}>Solo precios recientes (≤3 días)</label><label class="chk"><input id="marketSources" type="checkbox" ${onlySources?'checked':''}>Fuentes de dungeon en mi rango (nivel ${level})</label><label class="chk"><input id="marketFarmable" type="checkbox" ${onlyFarmable?'checked':''}>Solo farmeables con tu ficha</label><label class="chk"><input id="marketDeals" type="checkbox" ${onlyDeals?'checked':''}>Solo ofertas (bajo la mediana histórica)</label><label>Ordenar<select id="marketSort"><option value="price" ${sortMode==='price'?'selected':''}>Precio</option><option value="deals" ${sortMode==='deals'?'selected':''}>Mejores ofertas</option><option value="roi" ${sortMode==='roi'?'selected':''}>ROI estimado</option><option value="gph" ${sortMode==='gph'?'selected':''}>Oro/hora estimado</option></select></label></div>
      <details class="fold"><summary><span class="arrow">▶</span>Cómo leer filtros y fuentes</summary><div class="fbody"><p class="tip" style="margin:0">Este filtro solo compara el nivel con el rango del grupo. No confirma solo, equipo suficiente ni que el ítem se pueda vender. Nombres y fuentes solo para IDs simples presentes en el catálogo local; las variantes se conservan sin mezclarlas.</p></div></details>
      ${snapshot?`<p class="tip">Importado: ${esc(new Date(snapshot.importedAt).toLocaleString('es'))} · formato DB ${snapshot.sourceVersion} · guardado solo en este navegador/origen.</p>${snapshot.warnings.map(w=>`<p class="tip">Aviso: ${esc(w)}</p>`).join('')}`:''}
      <p id="marketCount" class="tip" role="status"></p><div class="table-scroll"><table><thead><tr><th>Ítem / clave</th><th>Último mínimo por unidad</th><th>Último día (UTC)</th><th>Oferta máx. ese día</th><th>Fuente parcial, no recomendación de venta</th><th>Farmeo (mejor fuente, approx)</th></tr></thead><tbody id="marketRows"></tbody></table></div>
      <div class="market-toolbar market-pages"><button id="marketPrev" type="button" class="btn">Anterior</button><button id="marketNext" type="button" class="btn">Siguiente</button></div></div>
      <section id="farmRoot" class="card"></section>
      <div id="marketDetail" class="card" tabindex="-1" hidden></div>
      <p class="tip">Fuente de nombres y relaciones: ${esc(catalog()?.source?.addon||'catálogo local no disponible')}. ${esc(catalog()?.source?.coverage||'Sin catálogo: los precios siguen disponibles por ID.')}</p>`;
    root.querySelector('#marketFile').addEventListener('change',e=>importFile(e.target.files[0]));
    root.querySelector('#marketDisk')?.addEventListener('click',diskImport);
    root.querySelector('#marketCancel').addEventListener('click',cancel);
    root.querySelector('#marketClear').addEventListener('click',clear);
    root.querySelector('#marketRealm').addEventListener('change',async e=>{
      realmName=snapshot.realms[Number(e.target.value)].name;page=0;detailKey=null;paintRows();
      try{await transaction('readwrite',store=>store.put(realmName,'realm'));}catch(_){message='Realm seleccionado, pero no se pudo guardar la preferencia.';root.querySelector('#marketStatus').textContent=message;}
    });
    root.querySelector('#marketSearch').addEventListener('input',e=>{query=e.target.value;page=0;paintRows();});
    root.querySelector('#marketFresh').addEventListener('change',e=>{onlyFresh=e.target.checked;page=0;paintRows();});
    root.querySelector('#marketSources').addEventListener('change',e=>{onlySources=e.target.checked;page=0;paintRows();});
    root.querySelector('#marketFarmable').addEventListener('change',e=>{onlyFarmable=e.target.checked;page=0;paintRows();});
    root.querySelector('#marketDeals').addEventListener('change',e=>{onlyDeals=e.target.checked;page=0;paintRows();});
    root.querySelector('#marketSort').addEventListener('change',e=>{sortMode=e.target.value;page=0;paintRows();});
    root.querySelector('#marketPrev').addEventListener('click',()=>{page--;paintRows();});
    root.querySelector('#marketNext').addEventListener('click',()=>{page++;paintRows();});
    syncFarm();
  }
  window.HunterMarketUI={
    view:()=>'<section id="marketRoot" data-busy="true" aria-label="Mercado local"></section>',
    mount:(el,options)=>{root=el;opts=options||{};level=options.level;paint();if(loading&&!window.HunterMarketUI.started){window.HunterMarketUI.started=true;restore();}},
    status:()=>{if(loading&&!window.HunterMarketUI.started){window.HunterMarketUI.started=true;restore();}return marketStatus();},
    setStatusListener:fn=>{statusListener=typeof fn==='function'?fn:null;}
  };
})();
