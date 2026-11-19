/* Almacén durable del plugin (ctx.storage + carpeta de datos propia). Mismas claves y
   archivos que la versión anterior (build, market-pointer, price-history-pointer,
   market-{a,b}.json, price-history-{a,b}.json): el progreso y los precios ya guardados se
   leen sin migración. Validación pura; nada fuera de las APIs del SDK. */
import HunterHistory from '../../standalone/market-history.js'
import HunterIdentity from '../../standalone/market-identity.js'
const MAX_MARKET=4*1024*1024, MAX_BUILD=128*1024, MAX_HISTORY=4*1024*1024;
const ownKeys=(o,allowed)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>allowed.includes(k));
const int=(n,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const text=(s,max=300)=>typeof s==='string'&&s.length<=max;
// Compact history store written by market-history.js: rows are
// [day,low] | [day,low,available] | [day,low,high,available] with strictly
// increasing days per item. Kept in sync with HunterHistory.validStore.
export function validHistoryStore(s){
  if(s&&s.v===2)return HunterHistory.validStoreV2(s);
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
  const v2=s.schemaVersion===2;
  const allowed=v2
    ? ['schemaVersion','sourceVersion','importedAt','realms','warnings','observation','cutoffDay']
    : ['schemaVersion','sourceVersion','importedAt','realms','warnings'];
  if(!ownKeys(s,allowed))return false;
  if(!v2&&s.schemaVersion!==1||s.sourceVersion!==8)return false;
  if(!text(s.importedAt,60)||!Number.isFinite(Date.parse(s.importedAt)))return false;
  if(!Array.isArray(s.warnings)||s.warnings.length>1000||!s.warnings.every(w=>text(w,1000)))return false;
  if(v2){
    const o=s.observation;
    if(!ownKeys(o,['scope','fromDay','toDay','capturedAt'])||
       !((o.scope==='fresh-scan'&&int(o.fromDay,0,100000)&&int(o.toDay,o.fromDay,100000))||
         (o.scope==='legacy'&&o.fromDay===null&&o.toDay===null))||
       !text(o.capturedAt,60)||!Number.isFinite(Date.parse(o.capturedAt)))return false;
    if(s.cutoffDay!==undefined&&!int(s.cutoffDay,0,100000))return false;
  }
  if(!Array.isArray(s.realms)||s.realms.length<1||s.realms.length>100)return false;
  const validHist=h=>ownKeys(h,['day','low','high','available'])&&int(h.day,0,100000)&&int(h.low,1)&&
    int(h.high,h.low)&&(h.available===null||int(h.available));
  const validItem=i=>ownKeys(i,['sourceKey','itemId','unitPriceCopper','observedDay','history',...(v2?['available','confirmed']:[])])&&
    (i.available===undefined||i.available===null||int(i.available))&&(i.confirmed===undefined||typeof i.confirmed==='boolean')&&
    text(i.sourceKey,300)&&(i.itemId===null||int(i.itemId,1))&&int(i.unitPriceCopper,1)&&
    (i.observedDay===null||int(i.observedDay,0,100000))&&
    Array.isArray(i.history)&&i.history.length<=10000&&i.history.every(validHist);
  const validRealm=r=>(ownKeys(r,['name','items'])||(v2&&ownKeys(r,['name','identity','items'])))&&
    text(r.name)&&(!v2||HunterIdentity.validateIdentity(r.identity).ok)&&
    Array.isArray(r.items)&&r.items.length<=100000&&r.items.every(validItem);
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
// El host limita writeText a 4 MiB (electron/plugin-files-ops.ts TEXT_MAX_BYTES).
// Un respaldo A/B completo puede superar ese tope (caso real: 5,27 MiB): se parte
// en trozos ≤3 MiB con manifiesto y el documento lógico se reensambla al leer.
// Los dobles de test DEBEN replicar el tope real o una suite verde miente.
const BACKUP_CHUNK_BYTES = 3 * 1024 * 1024
const BACKUP_PART_RE = /^pre-v2-backup\.part-\d{3}\.json$/
function backupParts(body) {
  const parts = []
  let start = 0, bytes = 0, i = 0
  while (i < body.length) {
    const cp = body.codePointAt(i)
    const units = cp > 0xffff ? 2 : 1
    const w = cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4
    if (bytes + w > BACKUP_CHUNK_BYTES && i > start) { parts.push(body.slice(start, i)); start = i; bytes = 0 }
    bytes += w
    i += units
  }
  parts.push(body.slice(start))
  return parts
}

export function createStore(ctx) {
  let queue=Promise.resolve(), cached=null, poisoned=false, v2active=false, v2slot=null;
  const serial=fn=>{const out=queue.then(fn);queue=out.catch(()=>{});return out;};
  async function load(){
    if(poisoned)throw new Error('Guardado sin confirmar; usá Reabrir para releer los datos.');
    if(cached)return cached;
    const build=(await ctx.storage.get('build'))??null;
    if(!validBuild(build))throw new Error('Progreso guardado inválido. No se sobrescribió.');
    const paired=await ctx.storage.get('market-v2-pointer');
    if(paired!==null&&paired!==undefined&&paired!==''){
      if(!ownKeys(paired,['slot','revision'])||!['a','b'].includes(paired.slot)||!int(paired.revision,1))throw Error('Índice v2 inválido.');
      const f=await ctx.files.readText('data',`market-v2-${paired.slot}.json`);
      let b;try{b=f?.ok&&JSON.parse(f.text)}catch{throw Error('Conjunto v2 ilegible.')}
      if(!validBundle(b)||b.revision!==paired.revision)throw Error('Conjunto v2 inválido.');
      v2active=true;v2slot=paired.slot;
      return cached={build,market:b.market,history:{store:b.history,revision:b.revision},revision:b.revision,
        hrevision:b.revision,slot:paired.slot,hslot:paired.slot,legacyMarket:false,legacyHistory:false};
    }
    v2active=false;v2slot=null;
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
    cached={build,market,revision,slot:pointer?.slot||'b',history,hrevision,hslot,
      legacyMarket:market?.snapshot===undefined||market.snapshot.schemaVersion===1,
      legacyHistory:history.store===undefined||history.store.v===1};
    return cached;
  }
  function validBundle(b) {
    return ownKeys(b,['version','revision','market','history']) && b.version===1 && int(b.revision,1) &&
      validMarket(b.market) && (!b.market.snapshot || b.market.snapshot.schemaVersion===2) &&
      validHistoryStore(b.history) && b.history.v===2;
  }
  function validBackup(b) {
    const pointer=p=>p===null||(ownKeys(p,['slot','revision'])&&['a','b'].includes(p.slot)&&int(p.revision,1));
    return ownKeys(b,['format','createdAt','pointers','slots'])&&b.format==='wow-forever/pre-v2'&&
      text(b.createdAt,60)&&Number.isFinite(Date.parse(b.createdAt))&&
      ownKeys(b.pointers,['market','priceHistory'])&&pointer(b.pointers.market)&&pointer(b.pointers.priceHistory)&&
      ownKeys(b.slots,['a','b'])&&['a','b'].every(s=>ownKeys(b.slots[s],['market','history'])&&
        ['market','history'].every(k=>b.slots[s][k]===null||typeof b.slots[s][k]==='string'));
  }
  // Respaldo lógico: archivo único o manifiesto + trozos (writeText del host ≤4 MiB).
  // Lanza si es legible pero inválido/incompleto: la única copia nunca se sobrescribe.
  async function readBackupDoc() {
    const m=await ctx.files.readText('data','pre-v2-backup.json');
    if(!m?.ok)return m;
    let doc;try{doc=JSON.parse(m.text)}catch{throw new Error('Respaldo previo ilegible; no se sobrescribió.');}
    if(doc?.format==='wow-forever/pre-v2-chunked'){
      if(!ownKeys(doc,['format','createdAt','parts'])||!Array.isArray(doc.parts)||!doc.parts.length||doc.parts.length>64)throw new Error('Respaldo previo inválido; no se sobrescribió.');
      let text='';
      for(const name of doc.parts){
        if(typeof name!=='string'||!BACKUP_PART_RE.test(name))throw new Error('Respaldo previo inválido; no se sobrescribió.');
        const p=await ctx.files.readText('data',name);
        if(!p?.ok||typeof p.text!=='string')throw new Error('Respaldo previo incompleto; no se sobrescribió.');
        text+=p.text;
      }
      try{doc=JSON.parse(text)}catch{throw new Error('Respaldo previo ilegible; no se sobrescribió.');}
    }
    if(!validBackup(doc))throw new Error('Respaldo previo inválido; no se sobrescribió.');
    return {ok:true,doc};
  }
  async function persistV2(s, market, history) {
    const slot = v2slot === 'a' ? 'b' : 'a'
    const revision = Math.max(s.revision, s.hrevision) + 1
    const bundle = { version: 1, revision, market, history }
    if (!validBundle(bundle)) throw Error('Conjunto v2 inválido')
    const path = `market-v2-${slot}.json`, text = JSON.stringify(bundle)
    if (new TextEncoder().encode(text).length > 4 * 1024 * 1024) throw Error('Conjunto v2 demasiado grande')
    const w = await ctx.files.writeText('data', path, text)
    if (!w?.ok) throw Error('No se pudo guardar el conjunto v2')
    const check = await ctx.files.readText('data', path)
    if (!check?.ok || check.text !== text) throw Error('El conjunto v2 no pasó lectura de confirmación')
    const pointer = {slot,revision}
    try {
      await ctx.storage.set('market-v2-pointer', pointer)
      if (JSON.stringify(await ctx.storage.get('market-v2-pointer')) !== JSON.stringify(pointer)) throw Error('Lectura del puntero diferente')
    } catch (e) { poisoned = true; cached = null; throw Error('No se pudo confirmar el conjunto v2; reabrir para recuperar: ' + e.message) }
    v2active = true; v2slot = slot
    cached = { ...s, market:structuredClone(market), history:{store:structuredClone(history),revision}, revision, hrevision:revision, slot, hslot:slot, legacyMarket:false, legacyHistory:false }
    return { ok:true, revision, hrevision:revision }
  }
  return {
    read:()=>serial(async()=>{const s=await load();return structuredClone({build:s.build,market:s.market,history:s.history,revision:s.revision,legacyMarket:s.legacyMarket,legacyHistory:s.legacyHistory});}),
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
      if(v2active){
        if(value.values.snapshot&&value.values.snapshot.schemaVersion!==2)throw Error('No se puede degradar v2; restaurá el respaldo primero.');
        return persistV2(s,value.values,Object.keys(value.values).length?s.history.store:{v:2,scopes:{}});
      }
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
      if(v2active){if(value.store.v!==2)throw Error('No se puede degradar historial v2.');return persistV2(s,s.market,value.store);}
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
    }),
    // Respaldo durable de A/B ANTES de cualquier escritura v2. Si ya existe un
    // respaldo legible, nunca se sobrescribe: es la única copia de los datos
    // originales ante un índice incierto o una migración incompleta.
    backupForMigration:()=>serial(async()=>{
      const existing=await readBackupDoc();
      if(existing?.ok)return {ok:true,alreadyBackedUp:true};
      if(existing?.error&&!['not_found','not-found'].includes(existing.error))throw Error('No se pudo comprobar el respaldo previo.');
      await load();
      const slots={a:{market:null,history:null},b:{market:null,history:null}};
      for(const slot of ['a','b']){
        for(const [kind,prefix] of [['market','market-'],['history','price-history-']]){
          const f=await ctx.files.readText('data',`${prefix}${slot}.json`);
          if(!f?.ok&&f?.error&&!['not_found','not-found'].includes(f.error))throw Error('No se pudo leer un slot para el respaldo.');
          slots[slot][kind]=f?.ok&&typeof f.text==='string'?f.text:null;
        }
      }
      const pointers={
        market:(await ctx.storage.get('market-pointer'))??null,
        priceHistory:(await ctx.storage.get('price-history-pointer'))??null,
      };
      const body=JSON.stringify({format:'wow-forever/pre-v2',createdAt:new Date().toISOString(),pointers,slots});
      const confirm=async(name,text)=>{
        const w=await ctx.files.writeText('data',name,text);
        if(!w?.ok)throw new Error('No se pudo crear el respaldo previo a v2. No se escribió.'+(w?.error?` [${w.error}] ${w.message||''}`.trim():''));
        const r=await ctx.files.readText('data',name);
        if(!r?.ok||r.text!==text)throw new Error('No se confirmó el respaldo previo a v2. No se escribió.');
      };
      if(new TextEncoder().encode(body).length<=BACKUP_CHUNK_BYTES){
        await confirm('pre-v2-backup.json',body);
        return {ok:true,alreadyBackedUp:false};
      }
      // Respaldo >4 MiB: trozos confirmados primero, manifiesto al final (el
      // manifiesto es el punto de commit; sin él, el próximo intento rehace todo).
      const parts=backupParts(body),names=[];
      for(let i=0;i<parts.length;i++){
        const name=`pre-v2-backup.part-${String(i).padStart(3,'0')}.json`;
        await confirm(name,parts[i]);names.push(name);
      }
      await confirm('pre-v2-backup.json',JSON.stringify({format:'wow-forever/pre-v2-chunked',createdAt:new Date().toISOString(),parts:names}));
      const assembled=await readBackupDoc();
      if(!assembled?.ok)throw new Error('No se confirmó el respaldo previo a v2. No se escribió.');
      return {ok:true,parts:names.length,alreadyBackedUp:false};
    }),
    // Confirmación conjunta de snapshot v2 + store v2, con la misma disciplina
    // A/B, readback byte-exacto yMove de índice que las escrituras clásicas.
    commitV2:value=>serial(async()=>{
      const p=value||{};
      if(!ownKeys(p,['market','store','revision','hrevision'])||!validMarket(p.market)||
         p.market.snapshot?.schemaVersion!==2||!validHistoryStore(p.store)||p.store.v!==2||
         !int(p.revision)||!int(p.hrevision))throw new Error('Estado v2 inválido; no se escribió.');
      const backup=await readBackupDoc();
      if(!backup?.ok)throw new Error('Falta el respaldo previo a v2; no se escribió.');
      const s=await load();
      if(p.revision!==s.revision||p.hrevision!==s.hrevision)throw new Error('El mercado cambió en otra vista. Usá Reabrir antes de guardar.');
      return persistV2(s,p.market,p.store);
    }),
    // Rollback explícito: restaura los bytes originales de A/B y los punteros.
    rollbackToBackup:()=>serial(async()=>{
      const b=await readBackupDoc();
      if(!b?.ok)throw new Error('No hay respaldo previo a v2 para restaurar.');
      const doc=b.doc;
      for(const slot of ['a','b']){
        for(const [kind,prefix] of [['market','market-'],['history','price-history-']]){
          const text=doc.slots[slot]?.[kind];
          if(typeof text!=='string')continue;
          const w=await ctx.files.writeText('data',`${prefix}${slot}.json`,text);
          if(!w?.ok)throw new Error('No se pudo restaurar el respaldo. No se modificó el índice.');
          const r=await ctx.files.readText('data',`${prefix}${slot}.json`);
          if(!r?.ok||r.text!==text)throw new Error('No se confirmó el respaldo. No se modificó el índice.');
        }
      }
      for(const [key,pointer] of [['market-pointer',doc.pointers?.market],['price-history-pointer',doc.pointers?.priceHistory]]){
        try{await ctx.storage.set(key,pointer);
          if(JSON.stringify(await ctx.storage.get(key))!==JSON.stringify(pointer))throw Error('no confirmado');
        }catch(e){poisoned=true;cached=null;throw e;}
      }
      try{await ctx.storage.set('market-v2-pointer',null);if((await ctx.storage.get('market-v2-pointer'))!=null)throw Error('restauración sin confirmar')}catch(e){poisoned=true;cached=null;throw e;}
      cached=null;poisoned=false;v2active=false;v2slot=null;
      return {ok:true};
    })
  };
}
