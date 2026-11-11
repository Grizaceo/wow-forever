/* Almacén durable del plugin (ctx.storage + carpeta de datos propia). Mismas claves y
   archivos que la versión anterior (build, market-pointer, price-history-pointer,
   market-{a,b}.json, price-history-{a,b}.json): el progreso y los precios ya guardados se
   leen sin migración. Validación pura; nada fuera de las APIs del SDK. */
const MAX_MARKET=4*1024*1024, MAX_BUILD=128*1024, MAX_HISTORY=4*1024*1024;
const ownKeys=(o,allowed)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>allowed.includes(k));
const int=(n,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const text=(s,max=300)=>typeof s==='string'&&s.length<=max;
// Compact history store written by market-history.js: rows are
// [day,low] | [day,low,available] | [day,low,high,available] with strictly
// increasing days per item. Kept in sync with HunterHistory.validStore.
export function validHistoryStore(s){
  if(!ownKeys(s,['v','realms'])||s.v!==1)return false;
  const realms=s.realms;
  if(!realms||typeof realms!=='object'||Array.isArray(realms))return false;
  const rn=Object.keys(realms);if(rn.length>100)return false;
  let total=0;
  for(const name of rn){
    if(!text(name))return false;
    const r=realms[name];
    if(!ownKeys(r,['items']))return false;
    const items=r.items;
    if(!items||typeof items!=='object'||Array.isArray(items))return false;
    const keys=Object.keys(items);if(keys.length>100000)return false;
    for(const k of keys){
      if(!text(k))return false;
      const rows=items[k];
      if(!Array.isArray(rows)||rows.length>10000)return false;
      total+=rows.length;if(total>400000)return false;
      let prev=-1;
      for(const row of rows){
        if(!Array.isArray(row)||row.length<2||row.length>4)return false;
        if(!int(row[0],0,100000)||!int(row[1],1))return false;
        if(row[0]<=prev)return false;prev=row[0];
        if(row.length===2)continue;
        if(row.length===3){if(row[2]!==null&&!int(row[2]))return false;continue;}
        if(!int(row[2],row[1])||(row[3]!==null&&!int(row[3])))return false;
      }
    }
  }
  return true;
}
export function validMarket(m){
  if(!ownKeys(m,['snapshot','realm','bundledScan'])||JSON.stringify(m).length>MAX_MARKET)return false;
  if(m.realm!==undefined&&!text(m.realm))return false;
  if(m.bundledScan!==undefined&&!/^[a-f0-9]{64}$/.test(m.bundledScan))return false;
  const s=m.snapshot;
  if(s===undefined)return m.realm===undefined;
  if(!ownKeys(s,['schemaVersion','sourceVersion','importedAt','realms','warnings']))return false;
  if(s.schemaVersion!==1||s.sourceVersion!==8)return false;
  if(!text(s.importedAt,60)||!Number.isFinite(Date.parse(s.importedAt)))return false;
  if(!Array.isArray(s.warnings)||s.warnings.length>1000||!s.warnings.every(w=>text(w,1000)))return false;
  if(!Array.isArray(s.realms)||s.realms.length<1||s.realms.length>100)return false;
  const validHist=h=>ownKeys(h,['day','low','high','available'])&&int(h.day,0,100000)&&int(h.low,1)&&
    int(h.high,h.low)&&(h.available===null||int(h.available));
  const validItem=i=>ownKeys(i,['sourceKey','itemId','unitPriceCopper','observedDay','history'])&&
    text(i.sourceKey,300)&&(i.itemId===null||int(i.itemId,1))&&int(i.unitPriceCopper,1)&&
    (i.observedDay===null||int(i.observedDay,0,100000))&&
    Array.isArray(i.history)&&i.history.length<=10000&&i.history.every(validHist);
  const validRealm=r=>ownKeys(r,['name','items'])&&text(r.name)&&Array.isArray(r.items)&&
    r.items.length<=100000&&r.items.every(validItem);
  if(!s.realms.every(validRealm))return false;
  return m.realm===undefined||s.realms.some(r=>r.name===m.realm);
}
export function validBuild(b){
  if(b===null)return true;
  if(!text(b,MAX_BUILD))return false;
  // Forward-compatible: the guide owns the envelope; unknown keys are ignored
  // by consumers, so only the JSON-object shape is enforced here.
  try{const v=JSON.parse(b);return v!==null&&typeof v==='object'&&!Array.isArray(v);}catch{return false;}
}
export function createStore(ctx){
  let queue=Promise.resolve(), cached=null, poisoned=false;
  const serial=fn=>{const out=queue.then(fn);queue=out.catch(()=>{});return out;};
  async function load(){
    if(poisoned)throw new Error('Guardado sin confirmar; usá Reabrir para releer los datos.');
    if(cached)return cached;
    const build=(await ctx.storage.get('build'))??null;
    if(!validBuild(build))throw new Error('Progreso guardado inválido. No se sobrescribió.');
    const pointer=await ctx.storage.get('market-pointer');
    let market={},revision=0;
    if(pointer!==null&&pointer!==undefined){
      if(!ownKeys(pointer,['slot','revision'])||!['a','b'].includes(pointer.slot)||!int(pointer.revision,1))throw new Error('Índice de mercado inválido. No se sobrescribió.');
      const file=await ctx.files.readText('data',`market-${pointer.slot}.json`);
      if(!file?.ok)throw new Error('No se pudo leer el mercado de Hermes. No se sobrescribió.'+(file?.error?` [${file.error}] ${file.message||''}`.trim():''));
      let record;try{record=JSON.parse(file.text);}catch{throw new Error('Mercado guardado ilegible. No se sobrescribió.');}
      if(record.revision!==pointer.revision||!validMarket(record.values))throw new Error('Mercado guardado inválido. No se sobrescribió.');
      market=record.values;revision=pointer.revision;
    }
    // History is rebuildable derived data: a corrupt file must not brick the
    // plugin, so failures degrade to an empty store instead of throwing.
    let history={},hrevision=0,hslot='b';
    try{
      const hpointer=await ctx.storage.get('price-history-pointer');
      if(hpointer!==null&&hpointer!==undefined){
        if(!ownKeys(hpointer,['slot','revision'])||!['a','b'].includes(hpointer.slot)||!int(hpointer.revision,1))throw new Error('bad pointer');
        const file=await ctx.files.readText('data',`price-history-${hpointer.slot}.json`);
        if(!file?.ok)throw new Error('missing');
        const record=JSON.parse(file.text);
        if(record.revision!==hpointer.revision||!validHistoryStore(record.store))throw new Error('bad record');
        history={store:record.store,revision:hpointer.revision};hrevision=hpointer.revision;hslot=hpointer.slot;
      }
    }catch(e){console.warn('[wow-hunter-guide] historial ilegible, se reinicia vacío:',e&&e.message);history={};hrevision=0;hslot='b';}
    cached={build,market,revision,slot:pointer?.slot||'b',history,hrevision,hslot};return cached;
  }
  return {
    read:()=>serial(async()=>{const s=await load();return structuredClone({build:s.build,market:s.market,history:s.history,revision:s.revision});}),
    // Reabrir: drop the cached snapshot and the poisoned latch, then re-read
    // durable state from disk. Queued like every op, so it cannot race a write.
    reset:()=>serial(async()=>{cached=null;poisoned=false;}),
    build:value=>serial(async()=>{
      if(!validBuild(value))throw new Error('Progreso inválido o demasiado grande.');
      const s=await load();
      try{await ctx.storage.set('build',value);if((await ctx.storage.get('build'))!==value)throw new Error('No se confirmó el progreso.');}
      catch(e){poisoned=true;throw e;}
      s.build=value;return true;
    }),
    market:value=>serial(async()=>{
      if(!ownKeys(value,['values','revision'])||!int(value.revision)||!validMarket(value.values))throw new Error('Scan inválido o demasiado grande para Hermes (máximo 4 MiB normalizado).');
      const s=await load();
      if(value.revision!==s.revision)throw new Error('El mercado cambió en otra vista. Usá Reabrir antes de guardar.');
      const slot=s.slot==='a'?'b':'a', revision=s.revision+1;
      const body=JSON.stringify({revision,values:value.values});
      if(new TextEncoder().encode(body).length>MAX_MARKET)throw new Error('Scan normalizado supera 4 MiB. Se conserva el anterior.');
      const wrote=await ctx.files.writeText('data',`market-${slot}.json`,body);
      if(!wrote?.ok)throw new Error('No se pudo guardar el scan. Se conserva el anterior.'+(wrote?.error?` [${wrote.error}] ${wrote.message||''}`.trim():''));
      const read=await ctx.files.readText('data',`market-${slot}.json`);
      if(!read?.ok||read.text!==body)throw new Error('No se confirmó el scan. Se conserva el anterior.'+(read?.error?` [${read.error}] ${read.message||''}`.trim():''));
      const pointer={slot,revision};
      try{await ctx.storage.set('market-pointer',pointer);if(JSON.stringify(await ctx.storage.get('market-pointer'))!==JSON.stringify(pointer))throw new Error('No se confirmó el índice.');}
      catch(e){poisoned=true;throw e;}
      s.market=structuredClone(value.values);s.revision=revision;s.slot=slot;
      return {revision};
    }),
    history:value=>serial(async()=>{
      if(!ownKeys(value,['store','revision'])||!int(value.revision)||!validHistoryStore(value.store))throw new Error('Historial inválido o demasiado grande para Hermes (máximo 4 MiB).');
      const s=await load();
      if(value.revision!==s.hrevision)throw new Error('El historial cambió en otra vista. Usá Reabrir antes de guardar.');
      const slot=s.hslot==='a'?'b':'a', revision=s.hrevision+1;
      const body=JSON.stringify({revision,store:value.store});
      if(new TextEncoder().encode(body).length>MAX_HISTORY)throw new Error('Historial supera 4 MiB. Se conserva el anterior.');
      const wrote=await ctx.files.writeText('data',`price-history-${slot}.json`,body);
      if(!wrote?.ok)throw new Error('No se pudo guardar el historial. Se conserva el anterior.'+(wrote?.error?` [${wrote.error}] ${wrote.message||''}`.trim():''));
      const read=await ctx.files.readText('data',`price-history-${slot}.json`);
      if(!read?.ok||read.text!==body)throw new Error('No se confirmó el historial. Se conserva el anterior.'+(read?.error?` [${read.error}] ${read.message||''}`.trim():''));
      const pointer={slot,revision};
      try{await ctx.storage.set('price-history-pointer',pointer);if(JSON.stringify(await ctx.storage.get('price-history-pointer'))!==JSON.stringify(pointer))throw new Error('No se confirmó el índice de historial.');}
      catch(e){poisoned=true;throw e;}
      s.history={store:structuredClone(value.store),revision};s.hrevision=revision;s.hslot=slot;
      return {revision};
    })
  };
}
