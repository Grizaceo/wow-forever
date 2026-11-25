/* ENV: en la página standalone es `window` (como siempre); como módulo (bundle de Desktop,
   Node) es un objeto propio que el host llena con configure({...}): no toca el global. */
const ENV=(typeof module==='object'&&module&&module.exports)?{}:window;
/* market-farm.js — recomendador de farmeo offline (fases 2+3).
 * Motor puro + renderer sobre ENV.HunterDropData (público, GPL-3.0) y
 * ENV.HunterDropDataPrivate (opcional, puede ser null/undefined).
 * Sin red, sin fetch, sin datos del juego. Todo texto de dataset pasa por esc(). */
(() => {
'use strict';
const AH_CUT=0.05;
const KILL_SEC={normal:20,elite:45,rareelite:60,rare:30,boss:90};
const GATHER_SEC=10,TRAVEL_SEC={mob:15,object:45};
const RARE_K=0.2,RARE_ZONE_MAX=1,CHEST_OPEN_RATE=0.05,CHEST_ZONE_MAX=4;
const OUTLIER_VENDOR_MULT=50,OUTLIER_MAX_AVAIL=2;
// Mercado delgado: con ≤5 ofertas conocidas la subasta no se cuenta (se vende al vendedor).
const THIN_MAX_AVAIL=5,PRICE_WINDOW_DAYS=14;
const COMP={low:1,med:0.75,high:0.45},COMP_ORDER=['low','med','high'];
const COMP_LABEL={low:'baja',med:'media',high:'alta'};
const CLASS_BIT={warrior:1,hunter:4,shaman:64};
const CLS_NAME={hunter:'Cazador',warrior:'Guerrero',shaman:'Chamán'};
const WEAPON_SETS={hunter:[0,1,2,3,6,7,8,10,13,15,16,18],warrior:[0,1,2,3,4,5,6,7,8,10,13,15,16,18],shaman:[0,1,4,5,10,13,15]};
// Subclases de arma que marca la guía como "tu arma preferida" según pref.
const PREF_SUBS={hunter:{bow:[2],gun:[3]},shaman:{axe:[0,1],mace:[4,5],dagger:[15]},warrior:{'2h':[1,5,8,6,10],'1h':[0,4,7,13,15]}};
const MOB_KINDS={mob:1,skin:1,pick:1,'rare-obs':1};
const isRareKind=s=>s.kind==='rare-obs'||s.rank==='rare'||s.rank==='rareelite';
const EPOCH=Date.UTC(2020,0,1),DAY=86400000;
const today=()=>Math.floor((Date.now()-EPOCH)/DAY);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>`${Math.floor(c/10000)}g ${Math.floor(c%10000/100)}s ${c%100}c`;
const gphF=c=>{c=Math.round(c);const g=Math.floor(c/10000),s=Math.floor(c%10000/100);return g?`${g}g ${s}s`:`${s}s ${c%100}c`;};
const pctF=c=>c>=0.095?`${Math.round(c*100)}%`:`${(c*100).toFixed(1).replace(/\.0$/,'')}%`;

/* ===================== AUDITORÍA CUANTITATIVA: modelos explícitos ========
   Ninguna constante de acá es una calibración validada en juego: son
   supuestos declarados. Se exponen como API pública para que UI, docs y
   tests puedan rotularlos sin confundir oferta con venta ni margen unitario
   con retorno de capital. La vía de zona es la única que aplica L. */
const MODEL={
  risk:{heuristic:true,basis:'facción + PvP; sin datos de población'},
  competition:{heuristic:true,basis:'selección manual + hub de tu ruta de nivel; sin datos de población (la hora del reloj no cuenta)'},
  travel:{heuristic:true,basis:'flight paths Classic 1.12 aproximados + duración de sesión'},
  liquidity:{heuristic:true,basis:'proxy de profundidad de oferta anunciada; no mide volumen vendido'},
  outlier:{heuristic:true,basis:`freno conservador: ≤${OUTLIER_MAX_AVAIL} ofertas y >${OUTLIER_VENDOR_MULT}× vendedor; legitimidad no verificable offline`},
  usefulBonus:{heuristic:true,basis:'conteo de ítems útiles; solo información, no entra al puntaje (objetivo: oro)'},
  price:{heuristic:false,basis:`mediana de mínimos diarios de los últimos ${PRICE_WINDOW_DAYS} días; sin historial, último mínimo`},
  thin:{heuristic:true,basis:`≤${THIN_MAX_AVAIL} ofertas: sin canal de subasta, solo vendedor`},
  rare:{heuristic:true,basis:'RARE_K=0,2/h sólo si falta respawn; con dato se usa la cota física'},
  roi:{heuristic:false,basis:'retorno/coste unitario con coste imputado por tiempo; NO ROI sobre capital'},
  itemMetrics:{liquidityApplied:true,basis:'L se aplica igual que en la vía de zona; SIN DATOS = sin ajuste'},
  zoneEntry:{liquidityApplied:true,basis:'L se aplica en la vía de zona; SIN DATOS = sin ajuste'}
};
// H2: un jugador ocupa UN campamento a la vez. La rotación ponderada sólo se
// admite con pesos de tiempo declarados (no negativos, suma <= 1).
function validCampWeights(w){
  return Array.isArray(w)&&w.length===3&&w.every(x=>Number.isFinite(x)&&x>=0)&&w.reduce((a,b)=>a+b,0)<=1+1e-9;
}
function campAggregate(values,mode,weights){
  const v=(Array.isArray(values)?values:[]).filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>b-a);
  if(!v.length)return 0;
  if(mode!=='rotation')return v[0];
  const ok=validCampWeights(weights);
  return ok?weights.reduce((s,w,i)=>s+w*(v[i]||0),0):v[0];
}
// H7: clamp conservador. No afirma que el precio fuera erróneo: sólo que con
// ≤2 ofertas y un precio de vendedor conocido se prefiere el piso ×50 como referencia.
function clampOutlier(price,sell,available){
  const p=Number.isFinite(price)?price:0,s=Number.isFinite(sell)?sell:0;
  if(Number.isFinite(available)&&available>=0&&available<=OUTLIER_MAX_AVAIL&&s>0&&p>OUTLIER_VENDOR_MULT*s)
    return{price:OUTLIER_VENDOR_MULT*s,doubtful:true,clamped:true,rule:`≤${OUTLIER_MAX_AVAIL} ofertas y >${OUTLIER_VENDOR_MULT}× precio vendedor — freno conservador`};
  return{price:p,doubtful:false,clamped:false,rule:'sin clamp'};
}
// H6: L sin available es SIN DATOS (factor null => sin ajuste), nunca 0,15.
function liquidityInfo(item,day){
  const h=Array.isArray(item?.history)?item.history.find(x=>x.day===item.observedDay):null;
  const has=!!h&&h.available!=null,available=has?h.available:null;
  const recent=item?.observedDay!=null&&item.observedDay<=day&&day-item.observedDay<=3;
  if(!has)return{factor:null,available:null,recent,label:'SIN DATOS',basis:MODEL.liquidity.basis};
  let f=Math.min(1,Math.max(0.15,Math.log10(1+available)/Math.log10(21)));
  if(!recent)f*=0.5;
  return{factor:f,available,recent,label:'proxy-ofertas',basis:MODEL.liquidity.basis};
}
// Hallazgo "raros": con respawn conocido manda la cota física; sin él, 0,2/h
// queda explícitamente marcado como calibración aproximada.
function rareRate(src){
  const known=Number.isFinite(src?.respawnSec)&&src.respawnSec>0;
  const cap=(src?.spawns||0)*3600/(known?src.respawnSec:60);
  return known?{rate:cap,spawnCap:cap,approx:false,basis:'spawn-cap'}
              :{rate:RARE_K,spawnCap:cap,approx:true,basis:'RARE_K-heuristic'};
}
// H3: descompone la tasa en cota de ciclo y cota de spawns/respawn. El piso
// de 60 s sólo existe como fallback y se declara como aproximación.
function rateInfo(src,level){
  const known=Number.isFinite(src?.respawnSec)&&src.respawnSec>0;
  const resp=known?src.respawnSec:60,spawns=src?.spawns||0;
  const spawnCap=spawns*3600/resp;
  const basis=known?'spawn-cap':'respawn-fallback-60s';
  if(isRareKind(src)){
    const rr=rareRate(src);
    return{rate:rr.rate,cycleRate:null,spawnCap:rr.spawnCap,respawnKnown:known,approx:rr.approx,basis:rr.basis};
  }
  if(src?.kind==='object'||src?.kind==='chest-obs'){
    if(src.objKind==='chest'||src.kind==='chest-obs'){
      const rate=Math.min(CHEST_ZONE_MAX,CHEST_OPEN_RATE*spawns);
      return{rate,cycleRate:null,spawnCap:rate,respawnKnown:known,approx:true,basis:'chest-proxy'};
    }
    const cycleRate=3600/(GATHER_SEC+TRAVEL_SEC.object);
    return{rate:Math.min(cycleRate,spawnCap),cycleRate,spawnCap,respawnKnown:known,approx:!known,basis};
  }
  const rank=src?.rank||'normal';
  const lmin=src?.lvlMin==null?level:src.lvlMin,lmax=src?.lvlMax==null?level:src.lvlMax,mobAvg=(lmin+lmax)/2;
  const base=KILL_SEC[rank]||KILL_SEC.normal;
  const ks=base*(1+0.08*Math.max(0,mobAvg-level))*Math.max(0.5,1-0.03*Math.max(0,level-mobAvg));
  const cycleRate=3600/(ks+TRAVEL_SEC.mob);
  return{rate:Math.min(cycleRate,spawnCap),cycleRate,spawnCap,respawnKnown:known,approx:!known,basis};
}
// H8: bonus por conteo de útiles, AH-only, heurístico (no valor marginal).
function usefulBonusFor(n){
  const count=Number.isFinite(n)&&n>0?n:0;
  return{factor:Math.min(0.2,0.02*count),count,basis:'conteo-de-items-utiles',appliesTo:'ah-only',heuristic:true};
}
// H10: margen unitario != ROI de capital. Se reportan ambas razones.
function marginInfo(net,cost){
  const n=Number.isFinite(net)?net:0,c=Number.isFinite(cost)&&cost>0?cost:null;
  return{net:c==null?null:n-c,netOverCost:c==null?null:(n-c)/c,returnOverCost:c==null?null:n/c,
    label:'retorno/coste',note:'retorno sobre coste imputado por tiempo; no es ROI sobre capital',heuristic:false};
}
// H9: riesgo sin datos de población: siempre heurístico declarado.
function riskInfo(zfac,profileFac,settings){
  const own=profileFac==='alliance'?'alliance':'horde';
  let level='baja',mult=1,note='';
  if(zfac==='instance')level='baja';
  else if(zfac===own)level='baja';
  else if(zfac==='contested'){level='media';mult=0.85;note='Zona disputada: posible encuentro con la facción rival';}
  else if(zfac==='alliance'||zfac==='horde'){level='alta';mult=0.6;note='Territorio de la facción rival: riesgo alto';}
  if(settings?.pvp===false)mult=1;
  return{level,mult,note,heuristic:true,basis:MODEL.risk.basis};
}
const normTxt=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const normWords=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/).filter(Boolean);
// Tokens que identifican cada zona dentro del texto de bandas de la guía
// (las bandas mezclan ES/EN y abreviaturas: STV, EPL, WPL, 1K Needles).
const ZONE_TOKENS={
 'Durotar':['durotar'],'Mulgore':['mulgore'],'The Barrens':['barrens'],
 'Alterac Mountains':['alterac'],'Arathi Highlands':['arathi'],'Badlands':['badlands'],'Blasted Lands':['blasted'],
 'Tirisfal Glades':['tirisfal'],'Silverpine Forest':['silverpine'],
 'Western Plaguelands':['wpl','westernplaguelands'],'Eastern Plaguelands':['epl','easternplaguelands'],
 'Hillsbrad Foothills':['hillsbrad'],'The Hinterlands':['hinterlands'],
 'Dun Morogh':['morogh'],'Searing Gorge':['searing'],'Burning Steppes':['burningsteppes','burning'],
 'Elwynn Forest':['elwynn'],'Deadwind Pass':['deadwind'],'Duskwood':['duskwood'],'Loch Modan':['modan','lochmodan'],
 'Redridge Mountains':['redridge'],'Stranglethorn Vale':['stranglethorn','stv'],'Swamp of Sorrows':['sorrows','swampofsorrows'],
 'Westfall':['westfall'],'Wetlands':['wetlands'],'Teldrassil':['teldrassil'],'Darkshore':['darkshore'],
 'Ashenvale':['ashenvale'],'Thousand Needles':['needles','thousandneedles'],'Stonetalon Mountains':['stonetalon'],
 'Desolace':['desolace'],'Feralas':['feralas'],'Dustwallow Marsh':['dustwallow'],'Tanaris':['tanaris'],
 'Azshara':['azshara'],'Felwood':['felwood'],'Un\'Goro Crater':['ungoro'],'Silithus':['silithus'],
 'Winterspring':['winterspring'],'Moonglade':['moonglade']};
const ZONE_STOP=new Set(['the','of','mountains','mountain','isle','crater','vale','highlands','marsh','glades','forest','forests','pass','lair','keep','deeps','barrow']);
function zoneTokens(name){
  if(ZONE_TOKENS[name])return ZONE_TOKENS[name].map(normTxt);
  const words=normWords(name);
  const keep=words.filter(w=>w.length>=5&&!ZONE_STOP.has(w));
  return keep.length?keep:[normTxt(name)];
}
function zoneInHub(name,hub){
  const h=normTxt(hub);if(!h)return false;
  return zoneTokens(name).some(t=>t&&h.includes(t));
}

/* Traslado estimado ida y vuelta (min) al punto de venta más cercano por
   facción: [minutos, la facción tiene vuelo propio en la zona]. Basado en los
   flight paths de Classic 1.12 — aproximado; si Forever tiene FP custom en
   alguna zona el factor queda del lado conservador. Zonas ausentes = neutro. */
const TRAVEL={
 'Elwynn Forest':{h:[55,0],a:[8,1]},'Westfall':{h:[55,0],a:[10,1]},'Redridge Mountains':{h:[25,0],a:[12,1]},
 'Duskwood':{h:[35,0],a:[20,0]},'Loch Modan':{h:[40,0],a:[8,1]},'Wetlands':{h:[45,0],a:[10,1]},
 'Hillsbrad Foothills':{h:[30,0],a:[10,1]},'Swamp of Sorrows':{h:[40,0],a:[15,1]},'Tirisfal Glades':{h:[8,1],a:[45,0]},
 'Silverpine Forest':{h:[15,0],a:[50,0]},'Alterac Mountains':{h:[35,0],a:[35,0]},'Arathi Highlands':{h:[35,0],a:[30,0]},
 'Badlands':{h:[10,1],a:[25,0]},'Searing Gorge':{h:[30,0],a:[15,1]},'Burning Steppes':{h:[35,0],a:[25,0]},
 'Blasted Lands':{h:[40,0],a:[35,0]},'Western Plaguelands':{h:[40,0],a:[40,0]},'Eastern Plaguelands':{h:[45,0],a:[45,0]},
 'The Hinterlands':{h:[40,0],a:[35,0]},'Deadwind Pass':{h:[50,0],a:[50,0]},'Stranglethorn Vale':{h:[35,0],a:[35,0]},
 'Durotar':{h:[8,1],a:[45,0]},'Mulgore':{h:[8,1],a:[45,0]},'The Barrens':{h:[10,1],a:[12,1]},
 'Ashenvale':{h:[15,0],a:[12,1]},'Darkshore':{h:[50,0],a:[10,1]},'Teldrassil':{h:[55,0],a:[8,1]},
 'Thousand Needles':{h:[18,0],a:[20,0]},'Stonetalon Mountains':{h:[20,0],a:[22,0]},'Desolace':{h:[22,1],a:[25,1]},
 'Feralas':{h:[25,0],a:[25,0]},'Dustwallow Marsh':{h:[40,0],a:[15,1]},'Tanaris':{h:[30,0],a:[30,0]},
 'Azshara':{h:[30,0],a:[35,0]},'Felwood':{h:[35,0],a:[38,0]},'Un\'Goro Crater':{h:[40,0],a:[42,0]},
 'Silithus':{h:[45,0],a:[45,0]},'Winterspring':{h:[42,0],a:[45,0]},'Moonglade':{h:[30,0],a:[32,0]},
 'Dun Morogh':{h:[50,0],a:[8,1]}};
function travelFor(zname,fac,hubZones,sessionH){
  const t=TRAVEL[zname];if(!t)return{min:0,fp:true,hub:false,factor:1,approx:true,basis:MODEL.travel.basis};
  const side=fac==='alliance'?'a':'h',[min,fp]=t[side]||[0,1];
  const hub=zoneInHub(zname,hubZones),eff=Math.round(min*(hub?0.5:1));
  const hrs=Number(sessionH)||2,factor=eff>0?hrs/(hrs+eff/60):1;
  return{min:eff,fp:!!fp,hub,factor,approx:true,basis:MODEL.travel.basis};
}

/* ================= INDEX (lazy, una sola vez) ================= */
let IX=null;
function zoneSpawnPairs(main,others){
  const zm={};
  for(const p of others||[])if(p&&p[0])zm[p[0]]=p[1];
  if(main&&main[0])zm[main[0]]=main[1];
  return Object.entries(zm);
}
function index(){
  if(IX)return IX;
  const d=ENV.HunterDropData;
  const ix={hasData:!!(d&&d.zones&&d.mobs&&d.objects&&d.items),zones:d?.zones||{},mobs:d?.mobs||{},objects:d?.objects||{},items:d?.items||{},zoneByName:{},
    byZoneM:{},byZoneO:{},mobItems:{},objItems:{},mobZoneSpawns:{},objZoneSpawns:{},zoneItems:{},zoneSrcCache:new Map(),srcCache:new Map(),privItemSrc:{},privRaresByZone:{},privChestsByZone:{}};
  if(ix.hasData){
    for(const[zk,z]of Object.entries(ix.zones))if(z&&z[0])ix.zoneByName[z[0]]=zk;
    for(const[id,m]of Object.entries(ix.mobs)){
      const zm=Object.fromEntries(zoneSpawnPairs([m[4],m[5]],m[8]));ix.mobZoneSpawns[id]=zm;
      for(const zk of Object.keys(zm))if(zk)(ix.byZoneM[zk]=ix.byZoneM[zk]||new Set()).add(id);
    }
    for(const[id,o]of Object.entries(ix.objects)){
      const zm=Object.fromEntries(zoneSpawnPairs([o[2],o[3]],o[5]));ix.objZoneSpawns[id]=zm;
      for(const zk of Object.keys(zm))if(zk)(ix.byZoneO[zk]=ix.byZoneO[zk]||new Set()).add(id);
    }
    for(const[id,it]of Object.entries(ix.items))for(const s of it[10]||[]){
      const sid=String(s[1]);
      if(s[0]==='o')(ix.objItems[sid]=ix.objItems[sid]||new Set()).add(id);
      else if(s[0]==='m'||s[0]==='s'||s[0]==='p')(ix.mobItems[sid]=ix.mobItems[sid]||new Set()).add(id);
    }
    for(const[zk,set]of Object.entries(ix.byZoneM))for(const mid of set)for(const iid of ix.mobItems[mid]||[])(ix.zoneItems[zk]=ix.zoneItems[zk]||new Set()).add(iid);
    for(const[zk,set]of Object.entries(ix.byZoneO))for(const oid of set)for(const iid of ix.objItems[oid]||[])(ix.zoneItems[zk]=ix.zoneItems[zk]||new Set()).add(iid);
  }
  const p=ENV.HunterDropDataPrivate;
  if(p){
    for(const[nid,r]of Object.entries(p.rares||{})){
      const[name,level,spots,loot]=r||[];
      for(const[ui,spotN]of Object.entries(spots||{})){
        if(ui==='0')continue;const zk=String(ui);
        const ent={npcId:nid,name,level,spots:spotN,srcs:[]};
        for(const[iid,ch]of Object.entries(loot||{})){
          const src={kind:'rare-obs',id:nid,name,zoneKey:zk,lvlMin:level,lvlMax:level,rank:'rare',spawns:spotN,respawnSec:null,sides:'ah',chance:(ch||0)/100,avgCount:1,objKind:null,origin:'rarescanner'};
          ent.srcs.push({iid,src});
          (ix.privItemSrc[iid]=ix.privItemSrc[iid]||[]).push(src);
        }
        (ix.privRaresByZone[zk]=ix.privRaresByZone[zk]||[]).push(ent);
      }
    }
    for(const[oid,c]of Object.entries(p.containers||{})){
      const[name,spots,loot]=c||[];
      for(const[ui,spotN]of Object.entries(spots||{})){
        if(ui==='0')continue;const zk=String(ui);
        const ent={objId:oid,name,spots:spotN,srcs:[]};
        for(const[iid,ch]of Object.entries(loot||{})){
          const src={kind:'chest-obs',id:oid,name,zoneKey:zk,lvlMin:null,lvlMax:null,rank:null,spawns:spotN,respawnSec:null,sides:'ah',chance:(ch||0)/100,avgCount:1,objKind:'chest',origin:'rarescanner'};
          ent.srcs.push({iid,src});
          (ix.privItemSrc[iid]=ix.privItemSrc[iid]||[]).push(src);
        }
        (ix.privChestsByZone[zk]=ix.privChestsByZone[zk]||[]).push(ent);
      }
    }
  }
  for(const[zk,ents]of Object.entries(ix.privRaresByZone))for(const ent of ents)for(const e of ent.srcs)(ix.zoneItems[zk]=ix.zoneItems[zk]||new Set()).add(e.iid);
  for(const[zk,ents]of Object.entries(ix.privChestsByZone))for(const ent of ents)for(const e of ent.srcs)(ix.zoneItems[zk]=ix.zoneItems[zk]||new Set()).add(e.iid);
  IX=ix;return ix;
}
function pubNorm(s){
  const t=s[0],rid=String(s[1]);
  if(t==='o'){
    const o=IX.objects[rid];if(!o)return[];
    return zoneSpawnPairs([o[2],o[3]],o[5]).map(([zk,sp])=>({kind:'object',id:rid,name:o[0],zoneKey:zk,lvlMin:null,lvlMax:null,rank:null,spawns:sp,respawnSec:o[4],sides:'ah',chance:s[2]/100,avgCount:(s[3]+s[4])/2,objKind:o[1],origin:'cmangos'}));
  }
  const m=IX.mobs[rid];if(!m)return[];
  return zoneSpawnPairs([m[4],m[5]],m[8]).map(([zk,sp])=>({kind:t==='m'?'mob':t==='s'?'skin':'pick',id:rid,name:m[0],zoneKey:zk,lvlMin:m[1],lvlMax:m[2],rank:m[3],spawns:sp,respawnSec:m[6],sides:m[7]||'ah',chance:s[2]/100,avgCount:(s[3]+s[4])/2,objKind:null,origin:'cmangos'}));
}
function normSources(itemId){
  let c=IX.srcCache.get(itemId);if(c)return c;
  const out=[],dd=IX.items[itemId];
  if(dd)for(const s of dd[10]||[])out.push(...pubNorm(s));
  for(const s of IX.privItemSrc[itemId]||[])out.push(s);
  IX.srcCache.set(itemId,out);return out;
}
function zoneQualSrcs(zk){
  let m=IX.zoneSrcCache.get(zk);if(m)return m;
  m=new Map();
  for(const iid of IX.zoneItems[zk]||[]){
    const arr=[];
    for(const s of normSources(iid)){
      if(s.zoneKey!==zk)continue;
      if(s.chance>=0.005||isRareKind(s))arr.push(s);
    }
    if(arr.length)m.set(iid,arr);
  }
  IX.zoneSrcCache.set(zk,m);return m;
}

/* ================= SESIÓN de scan (cache por array de items) ================= */
let SESS=null;
function session(items){
  if(SESS&&SESS.items===items)return SESS;
  const scan=new Map(),liq=new Map(),info=new Map(),t=today();
  for(const it of items||[]){
    if(!it||!Number.isSafeInteger(it.itemId)||it.itemId<=0)continue;
    const iid=String(it.itemId);
    if(scan.has(iid))continue;
    scan.set(iid,it);
    const liqInfo=liquidityInfo(it,t);
    liq.set(iid,liqInfo.factor);
    const dd=IX.items[iid],cat=ENV.HunterMarketCatalog?.items?.[iid];
    info.set(iid,{name:cat?.name||dd?.[0]||`Ítem #${it.itemId}`,quality:dd?dd[1]:0,icls:dd?dd[2]:-1,sub:dd?dd[3]:-1,req:dd?dd[5]:0,allow:dd?dd[8]:-1});
  }
  SESS={items,scan,liq,info,drops:new Map(),vendorCache:new Map(),profCache:new Map()};
  return SESS;
}
function mobDrops(mid,zk,sess){
  const key='m'+mid+'|'+zk;let d=sess.drops.get(key);if(d)return d;
  d=[];
  for(const iid of IX.mobItems[mid]||[]){
    const it=sess.scan.get(iid);if(!it)continue;
    const srcs=normSources(iid).filter(x=>x.id===mid&&x.zoneKey===zk&&(x.kind==='mob'||x.kind==='skin'||x.kind==='pick'));
    if(srcs.length)d.push({iid,it,srcs});
  }
  sess.drops.set(key,d);return d;
}
function objDrops(oid,zk,sess){
  const key='o'+oid+'|'+zk;let d=sess.drops.get(key);if(d)return d;
  d=[];
  for(const iid of IX.objItems[oid]||[]){
    const it=sess.scan.get(iid);if(!it)continue;
    const srcs=normSources(iid).filter(x=>x.kind==='object'&&x.id===oid&&x.zoneKey===zk);
    if(srcs.length)d.push({iid,it,srcs});
  }
  sess.drops.set(key,d);return d;
}
function entDrops(ent,sess){
  let d=sess.drops.get(ent);if(d)return d;
  d=[];
  for(const e of ent.srcs||[]){const it=sess.scan.get(e.iid);if(it)d.push({iid:e.iid,it,srcs:[e.src]});}
  sess.drops.set(ent,d);return d;
}

/* ================= Elegibilidad, tasas y métricas ================= */
function normalizeSettings(s){
  s=s||{};const zc={};
  if(s.zoneComp&&typeof s.zoneComp==='object')for(const k of Object.keys(s.zoneComp))if(COMP_ORDER.includes(s.zoneComp[k]))zc[k]=s.zoneComp[k];
  const p=s.prof||{},n=Number(s.n);
  return{comp:COMP_ORDER.includes(s.comp)?s.comp:'auto',zoneComp:zc,
    gph:Number.isFinite(+s.gph)&&+s.gph>0?Math.min(1000,+s.gph):5,
    prof:{skin:!!p.skin,herb:!!p.herb,mine:!!p.mine},group:!!s.group,pvp:s.pvp!==false,
    n:Number.isInteger(n)&&n>=3&&n<=8?n:5,
    session:[1,2,4].includes(+s.session)?+s.session:2,
    // H2: por defecto un sitio a la vez; rotación sólo con pesos explícitos.
    campMode:s.campMode==='rotation'?'rotation':'single',
    campWeights:Array.isArray(s.campWeights)&&s.campWeights.length===3?s.campWeights.map(Number):null};
}
function eligible(src,profile,settings){
  const lvl=profile.level||12,side=profile.fac==='alliance'?'a':'h';
  if(!(src.sides||'ah').includes(side))return{ok:false,reason:`Solo ${side==='a'?'la Alianza':'la Horda'} puede farmear esta fuente`};
  if(src.kind==='pick')return{ok:false,reason:'Pillosidad: tu clase no la usa'};
  if(src.kind==='object'&&src.objKind==='fish')return{ok:false,reason:'Pesca: no cuenta como farmeo'};
  if(src.kind==='skin'&&!settings.prof.skin)return{ok:false,reason:'Requiere Prof. Piel'};
  if(src.kind==='object'&&src.objKind==='herb'&&!settings.prof.herb)return{ok:false,reason:'Requiere Prof. Hierbas'};
  if(src.kind==='object'&&src.objKind==='ore'&&!settings.prof.mine)return{ok:false,reason:'Requiere Prof. Minería'};
  const lmax=src.lvlMax==null?lvl:src.lvlMax;
  if(lmax>lvl+3)return{ok:false,reason:`Mob nv ${lmax}: muy alto para tu nivel ${lvl}`};
  if(typeof src.zoneKey==='string'&&src.zoneKey.charCodeAt(0)===105&&!settings.group)return{ok:false,reason:'Instancia: requiere grupo'};
  if(MOB_KINDS[src.kind]){
    const rank=src.rank||'normal';
    let solo=lmax<=lvl+2;
    if(rank==='elite'||rank==='rareelite')solo=lmax<=lvl-5;
    else if(rank==='boss')solo=lmax<=lvl-10;
    if(!solo&&!settings.group)return{ok:false,reason:`Requiere grupo (mob nv ${lmax}, vos nv ${lvl})`};
  }
  return{ok:true,reason:''};
}
function rate(src,level){return rateInfo(src,level).rate;}
// Precio robusto: mediana de los mínimos diarios de la ventana que termina en
// observedDay. Sin mínimos fechados se usa el último mínimo (unitPriceCopper).
function windowPrice(it){
  const hist=Array.isArray(it?.history)?it.history:[],end=Number.isSafeInteger(it?.observedDay)?it.observedDay:null;
  const lows=[];
  for(const h of hist){
    if(!h||!Number.isSafeInteger(h.low)||h.low<=0||!Number.isSafeInteger(h.day))continue;
    if(end!=null&&(h.day>end||h.day<=end-PRICE_WINDOW_DAYS))continue;
    lows.push(h.low);
  }
  if(!lows.length)return{price:it?.unitPriceCopper||0,days:0,basis:'último mínimo'};
  lows.sort((a,b)=>a-b);
  const m=lows.length>>1,med=lows.length%2?lows[m]:Math.round((lows[m-1]+lows[m])/2);
  return{price:med,days:lows.length,basis:'mediana de la ventana'};
}
function refPrice(it){
  const h=Array.isArray(it?.history)?it.history.find(x=>x.day===it.observedDay):null;
  const avail=h?.available??null;
  const sell=it?.sellPriceCopper||IX?.items?.[String(it?.itemId)]?.[9]||0,wp=windowPrice(it);
  const c=clampOutlier(wp.price,sell,avail);
  const thin=Number.isFinite(avail)&&avail>=0&&avail<=THIN_MAX_AVAIL;
  const ahNet=thin?0:Math.floor(c.price*(1-AH_CUT));
  // El canal es el mejor de los dos: vendedor si la subasta neta no lo supera.
  const vendorFloor=sell>0&&ahNet<=sell;
  return{price:c.price,sell,doubtful:c.doubtful,clamped:c.clamped,rule:c.rule,vendorFloor,thin,ahNet,
    priceDays:wp.days,priceBasis:wp.basis};
}
function metrics(src,it,settings,level){
  const ri=rateInfo(src,level),K=ri.rate,u=src.chance*(src.avgCount||1);
  const rp=refPrice(it);
  const vendorFloor=rp.vendorFloor;
  const net=vendorFloor?rp.sell:rp.ahNet;
  const gph=K*u*net,denom=K*u;
  const farmCost=denom>0?(settings.gph||5)*10000/denom:Infinity;
  const margin=net-farmCost;
  const roi=farmCost>0&&isFinite(farmCost)?margin/farmCost:null; // legado
  const mi=marginInfo(net,farmCost);
  return{K,u,net,gph,denom,farmCostPerUnit:farmCost,margin,roi,
    marginPct:mi.netOverCost,returnOverCost:mi.returnOverCost,roiLabel:mi.label,roiNote:mi.note,
    rateApprox:ri.approx,rateBasis:ri.basis,respawnKnown:ri.respawnKnown,spawnCap:ri.spawnCap,
    doubtful:rp.doubtful,clamped:rp.clamped,clampRule:rp.rule,vendorFloor,thin:rp.thin,priceDays:rp.priceDays,
    liquidityApplied:MODEL.itemMetrics.liquidityApplied,model:MODEL.roi};
}

/* El canal vendedor conserva la identidad (tipo + ID) de cada campamento.
   Para raros/cofres conservamos también EV por encuentro para el tope de zona. */
function vendorCamps(zk,level,profile,settings,sess){
  const key=[zk,level,profile.fac||'',settings.prof.skin?1:0,settings.prof.herb?1:0,settings.prof.mine?1:0,settings.group?1:0].join('|');
  const hit=sess.vendorCache.get(key);if(hit)return hit;
  const out=new Map();
  const addEnt=(id,isObj)=>{
    const per=new Map();
    for(const iid of (isObj?IX.objItems[id]:IX.mobItems[id])||[]){
      if(sess.scan.has(iid))continue; // processDrops valora también los pisos vendedor del scan
      const sell=IX.items[iid]?.[9]||0;if(sell<=0)continue;
      for(const s of normSources(iid)){
        const ok=isObj?(s.kind==='object'&&s.id===id&&s.zoneKey===zk)
                      :(s.id===id&&s.zoneKey===zk&&(s.kind==='mob'||s.kind==='skin'||s.kind==='pick'));
        if(!ok||!eligible(s,profile,settings).ok)continue;
        const ev=s.chance*(s.avgCount||1)*sell;if(ev<=0)continue;
        const k=s.kind+'|'+iid;
        if(ev>(per.get(k)?.ev||0))per.set(k,{ev,gph:rate(s,level)*ev});
      }
    }
    let ev=0,gph=0;
    for(const p of per.values()){ev+=p.ev;gph+=p.gph;}
    if(ev>0)out.set(`${isObj?'object':'mob'}:${id}`,{ev,gph});
  };
  for(const mid of IX.byZoneM[zk]||[])addEnt(mid,false);
  for(const oid of IX.byZoneO[zk]||[])addEnt(oid,true);
  sess.vendorCache.set(key,out);return out;
}

/* Valor por hora de materiales de UNA profesión en una zona: mismas reglas
   que vendorGph (top-3 entidades, elegibilidad completa) pero solo fuentes
   del oficio — piel en cadáveres, hierbas/menas en nodos. El valor unitario
   es el mejor canal real: AH neto si está en tu scan, si no el sellPrice. */
const PROF_KINDS={skin:'Piel',herb:'Hierbas',mine:'Minería'};
function profGph(zk,kind,level,profile,settings,sess){
  const key='pf|'+[zk,kind,level,profile.fac||'',settings.group?1:0,settings.campMode||'single',(settings.campWeights||[]).join(',')].join('|');
  const hit=sess.profCache.get(key);if(hit!=null)return hit;
  const wantObj=kind==='herb'?'herb':kind==='mine'?'ore':null;
  const vals=[],itemVal=new Map();
  const addEnt=(id,isObj)=>{
    const per=new Map();let anySrc=null;
    for(const iid of (isObj?IX.objItems[id]:IX.mobItems[id])||[]){
      const dd=IX.items[iid],sell=dd?.[9]||0;if(sell<=0)continue;
      // Los nodos de hierbas/menas no tienen nivel propio: el iLvl del material
      // es el proxy del tier que tu personaje puede recolectar a su nivel.
      if((dd?.[6]||0)>level+10)continue;
      const it=sess.scan.get(iid),rp=it?refPrice(it):null;
      const ah=rp&&rp.price>0?Math.floor(rp.price*(1-AH_CUT)):0;
      const unit=Math.max(ah,sell);if(unit<=0)continue;
      for(const s of normSources(iid)){
        const okProf=isObj?s.kind==='object'&&s.objKind===wantObj:s.kind==='skin';
        if(!okProf||s.id!==id||s.zoneKey!==zk)continue;
        if(!eligible(s,profile,settings).ok)continue;
        const ch=s.chance*(s.avgCount||1);if(ch<=0)continue;
        const k=kind+'|'+iid,cur=per.get(k);
        if(cur){if(ch>cur.ch)cur.ch=ch;continue;}
        per.set(k,{ch,unit,iid});
        if(!anySrc||s.chance>anySrc.chance)anySrc=s;
      }
    }
    if(!anySrc||!per.size)return;
    const r=rate(anySrc,level);let v=0;
    for(const p of per.values()){const c=r*p.ch*p.unit;v+=c;itemVal.set(p.iid,(itemVal.get(p.iid)||0)+c);}
    if(v>0)vals.push(v);
  };
  if(kind==='skin'){for(const mid of IX.byZoneM[zk]||[])addEnt(mid,false);}
  else for(const oid of IX.byZoneO[zk]||[]){const o=IX.objects[oid];if(o&&o[1]===wantObj)addEnt(oid,true);}
  vals.sort((a,b)=>b-a);
  const gph=Math.round(campAggregate(vals,settings.campMode,settings.campWeights));
  const items=[...itemVal.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3)
    .map(([iid])=>IX.items[iid]?.[0]||`#${iid}`);
  const res={gph,items};
  sess.profCache.set(key,res);return res;
}
const PROF_ORDER=['skin','herb','mine'];
function profRecommendations(items,profile,settings){
  index();const sess=session(items),level=profile.level||12,out=[];
  for(const kind of PROF_ORDER){
    if(!settings.prof[kind])continue;
    const zones=[];
    for(const zk of candidateZones(level,settings)){
      const r=profGph(zk,kind,level,profile,settings,sess);
      if(r.gph<=0)continue;
      // Mismo criterio que el ranking: el valor real descuenta riesgo de
      // facción y el factor del ciclo de farmeo por el viaje.
      const z=IX.zones[zk],risk=riskFor(z?.[2],profile,settings);
      const travel=travelFor(z?.[0],profile.fac,profile.hubZones,settings.session);
      zones.push({zoneKey:zk,name:zoneName(zk),gph:Math.round(r.gph*risk.mult*travel.factor),items:r.items});
    }
    zones.sort((a,b)=>b.gph-a.gph);
    if(zones.length)out.push({kind,name:PROF_KINDS[kind],zones:zones.slice(0,3),along:kind==='skin'?alongZones(profile,settings,sess,level):null});
  }
  return out;
}

/* Skin-along: las zonas de tu ruta de quests son donde más bestias mueren
   por otros jugadores — piel gratis sin cazar. Solo aplica a piel: los
   nodos de hierbas/menas no los mata nadie. */
const ALONG_EFF=0.5; // recuperás ~la mitad del valor teórico: otros compiten por las mismas pieles
const ZONE_ALIAS={'stv':'stranglethorn vale','epl':'eastern plaguelands','wpl':'western plaguelands','1k needles':'thousand needles','shimmering flats':'thousand needles',"un'goro":"un'goro crater",'dustwallow':'dustwallow marsh'};
const normZone=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
function matchZoneToken(t){
  const alias=ZONE_ALIAS[t]||t,hit=[];
  for(const[zk,z]of Object.entries(IX.zones)){
    if(!z||!z[0])continue;
    const zn=normZone(z[0]).replace(/^the /,'');
    if(zn&&(zn.includes(alias)||alias.includes(zn)))hit.push([zk,zn.length]);
  }
  if(!hit.length)return null;
  const best=Math.max(...hit.map(h=>h[1])),top=hit.filter(h=>h[1]===best).map(h=>h[0]);
  return top.length===1?top[0]:null; // ambiguo ('plaguelands' a secas) → sin match
}
function trafficZones(profile){
  index();
  const G=ENV['GUIDE_'+String(profile.cls||'').toUpperCase()];
  const fk=G?Object.keys(G.factions||{}):[],fac=fk.includes(profile.fac)?profile.fac:null;
  const routes=fac?G.factions[fac]?.routes:null;
  if(!routes)return new Map();
  const level=profile.level||12,out=new Map();
  for(const bands of Object.values(routes)){
    for(const b of bands||[]){
      if(!b||!(b.min<=level&&level<=b.max))continue;
      const text=String(b.zones||'').replace(/\([^)]*\)/g,' ');
      for(const seg of text.split(/[\/→]/)){
        const t=normZone(seg).replace(/[^a-z' ]/g,' ').replace(/\s+/g,' ').trim();
        if(t.length<4)continue;
        const zk=matchZoneToken(t);
        if(zk==null)continue;
        const cur=out.get(zk)||{zones:0,bands:[]};
        cur.zones++;if(!cur.bands.includes(`${b.min}-${b.max}`))cur.bands.push(`${b.min}-${b.max}`);
        out.set(zk,cur);
      }
    }
  }
  return out;
}
function alongZones(profile,settings,sess,level){
  const traffic=trafficZones(profile);
  if(!traffic.size)return[];
  const zones=[];
  for(const zk of candidateZones(level,settings)){
    if(!traffic.has(zk))continue;
    const r=profGph(zk,'skin',level,profile,settings,sess);
    if(r.gph<=0)continue;
    const z=IX.zones[zk],risk=riskFor(z?.[2],profile,settings);
    const travel=travelFor(z?.[0],profile.fac,profile.hubZones,settings.session);
    zones.push({zoneKey:zk,name:zoneName(zk),gph:Math.round(r.gph*ALONG_EFF*risk.mult*travel.factor),items:r.items,bands:traffic.get(zk).bands.join(', ')});
  }
  zones.sort((a,b)=>b.gph-a.gph);
  return zones.slice(0,3);
}

/* ================= API pura ================= */
function byZone(zoneKey){
  index();const zk=String(zoneKey);
  const mobs=[...(IX.byZoneM[zk]||[])],objects=[...(IX.byZoneO[zk]||[])],items=new Set();
  for(const id of mobs)for(const i of IX.mobItems[id]||[])items.add(i);
  for(const id of objects)for(const i of IX.objItems[id]||[])items.add(i);
  for(const r of IX.privRaresByZone[zk]||[])for(const e of r.srcs)items.add(e.iid);
  for(const c of IX.privChestsByZone[zk]||[])for(const e of c.srcs)items.add(e.iid);
  return{mobs,objects,items:[...items]};
}
function byMob(id){
  index();const sid=String(id),out=new Set(IX.mobItems[sid]||[]);
  const r=ENV.HunterDropDataPrivate?.rares?.[sid];
  if(r)for(const i of Object.keys(r[3]||{}))out.add(i);
  return[...out];
}
function sources(itemId,profile,settings){
  index();
  const id=typeof itemId==='number'?String(itemId):String(itemId||'');
  if(!id||(!IX.items[id]&&!IX.privItemSrc[id]))return[];
  return normSources(id).map(src=>{
    const e=eligible(src,profile||{},normalizeSettings(settings));
    return{...src,eligible:e.ok,reason:e.reason};
  });
}
function itemMetrics(scanItem,profile,settings){
  const out={best:null,gph:0,roi:null,margin:null,farmable:false,sources:[],
    roiLabel:'retorno/coste',roiNote:MODEL.roi.basis,liquidityApplied:true,model:MODEL.roi};
  index();
  const id=scanItem&&scanItem.itemId;
  if(!Number.isSafeInteger(id)||id<=0||!IX.hasData)return out;
  out.doubtful=refPrice(scanItem).doubtful;
  profile=profile||{};
  const level=profile.level||12,st=normalizeSettings(settings);
  const targetCopper=st.gph*10000;
  // Misma liquidez que la vía de zona: la oferta anunciada acota lo vendible.
  const liq=liquidityInfo(scanItem,today()),L=liq.factor==null?1:liq.factor;
  out.liquidity=liq;
  const all=normSources(String(id)).map(src=>{
    const e=eligible(src,profile,st),camp0=metrics(src,scanItem,st,level);
    const camp=camp0.vendorFloor||L===1?camp0:{...camp0,gph:camp0.gph*L};
    const z=IX.zones[src.zoneKey];
    const travel=travelFor(z?.[0],profile.fac,profile.hubZones,st.session);
    const risk=riskFor(z?.[2],profile,st);
    const comp=compFor(src.zoneKey,z?.[0],st,profile);
    const routeFactor=travel.factor*risk.mult*COMP[comp.comp];
    // Una recomendación de ítem es una recomendación de ruta: el ciclo incluye
    // llegar, volver a vender, riesgo y competencia, igual que el ranking de zonas.
    const denom=camp.denom*routeFactor,gph=camp.gph*routeFactor;
    const farmCost=denom>0?targetCopper/denom:Infinity;
    const margin=camp.net-farmCost;
    const roi=farmCost>0&&isFinite(farmCost)?margin/farmCost:null;
    const mi=marginInfo(camp.net,farmCost);
    return{...src,eligible:e.ok,reason:e.reason,...camp,
      campGph:camp.gph,campDenom:camp.denom,campFarmCostPerUnit:camp.farmCostPerUnit,campRoi:camp.roi,
      travel,risk,comp,routeFactor,denom,gph,farmCostPerUnit:farmCost,margin,roi,
      marginPct:mi.netOverCost,returnOverCost:mi.returnOverCost,roiLabel:mi.label,roiNote:mi.note};
  });
  // Campamentos alternativos del MISMO ítem en la misma zona: respaldo de
  // disponibilidad y desempate, nunca ingreso paralelo. El gph sigue siendo el
  // del mejor campamento; spawnTotal describe opciones, no multiplica la tasa.
  const porZona=new Map();
  for(const s of all)if(s.eligible){
    if(!porZona.has(s.zoneKey))porZona.set(s.zoneKey,[]);
    porZona.get(s.zoneKey).push(s);
  }
  for(const camps of porZona.values()){
    camps.sort((a,b)=>b.gph-a.gph||b.campGph-a.campGph||(b.spawns||0)-(a.spawns||0));
    const routeCamps=camps.map(s=>({id:s.id,name:s.name,kind:s.kind,zoneKey:s.zoneKey,
      spawns:s.spawns,chance:s.chance,gph:s.gph,campGph:s.campGph}));
    const spawnTotal=camps.reduce((sum,s)=>sum+(Number.isFinite(s.spawns)?s.spawns:0),0);
    for(const s of camps)Object.assign(s,{routeCamps,alternativeCamps:camps.length-1,spawnTotal});
  }
  // El resumen y la lista usan el mismo orden. Primero rendimiento efectivo,
  // luego bruto del campamento; alternativas solo desempatan al final.
  const compare=(a,b)=>Number(b.eligible)-Number(a.eligible)||b.gph-a.gph||
    b.campGph-a.campGph||(b.spawnTotal||0)-(a.spawnTotal||0)||String(a.id).localeCompare(String(b.id));
  out.sources=all.sort(compare);
  const elig=all.filter(s=>s.eligible);
  out.farmable=elig.length>0;
  if(elig.length){out.best=elig[0];out.gph=elig[0].gph;out.roi=elig[0].roi;out.margin=elig[0].margin;
    out.roiLabel=elig[0].roiLabel;out.roiNote=elig[0].roiNote;out.marginPct=elig[0].marginPct;}
  return out;
}
function matchStats(scanItems){
  index();const items=scanItems||[],cat=ENV.HunterMarketCatalog?.items||{};
  let matched=0;const byLayer={public:0,private:0,catalog:0};
  for(const it of items){
    const id=it&&it.itemId;if(!Number.isSafeInteger(id)||id<=0)continue;
    const k=String(id),pub=!!IX.items[k],priv=!!IX.privItemSrc[k],c=!!cat[k];
    if(pub)byLayer.public++;if(priv)byLayer.private++;if(c)byLayer.catalog++;
    if(pub||priv||c)matched++;
  }
  const total=items.length;
  return{total,matched,pct:total?Math.round(matched/total*1000)/10:0,byLayer};
}

/* ================= RANKING ================= */
function candidateZones(level,settings){
  const privZones=new Set();
  for(const k of Object.keys(IX.privRaresByZone))if(IX.zones[k])privZones.add(k);
  for(const k of Object.keys(IX.privChestsByZone))if(IX.zones[k])privZones.add(k);
  const out=[];
  for(const[zk,z]of Object.entries(IX.zones)){
    if(!z)continue;
    if(z[2]==='city'&&!privZones.has(zk))continue;
    const inst=z[2]==='instance'||zk.charCodeAt(0)===105;
    if(inst&&!settings.group)continue;
    const zmin=z[3],zmax=z[4];
    if(zmin==null&&zmax==null)continue;
    if(zmax!=null&&zmax<level-10)continue;
    if(zmin!=null&&zmin>level+5)continue;
    out.push(zk);
  }
  return out;
}
function compFor(zk,zname,settings,profile){
  const ov=settings.zoneComp[zk];
  if(ov)return{comp:ov,why:'manual para esta zona',heuristic:true,basis:MODEL.competition.basis};
  if(settings.comp!=='auto')return{comp:settings.comp,why:'manual global',heuristic:true,basis:MODEL.competition.basis};
  // La hora del reloj no mide jugadores: solo el hub de tu ruta de nivel sube la competencia.
  const hub=zoneInHub(zname,profile.hubZones);
  const comp=COMP_ORDER[hub?2:1];
  const why='auto'+(hub?' (hub de tu guía)':'');
  return{comp,why,heuristic:true,basis:MODEL.competition.basis};
}
function riskFor(zfac,profile,settings){return riskInfo(zfac,profile?.fac,settings);}
function usefulGear(inf,cls,level,pref){
  const ws=WEAPON_SETS[cls];
  if(inf.icls===2){
    if(!ws||!ws.includes(inf.sub))return{ok:false};
    const ps=PREF_SUBS[cls]&&PREF_SUBS[cls][pref];
    return{ok:true,preferred:!!(ps&&ps.includes(inf.sub))};
  }
  if(inf.icls===4){
    const s=inf.sub;
    if(s===0||s===1)return{ok:true,preferred:false};
    const mail=s===3&&level>=40,plate=s===4&&level>=40;
    if(cls==='hunter')return s===2||mail?{ok:true,preferred:false}:{ok:false};
    if(cls==='warrior')return mail||plate||s===6?{ok:true,preferred:false}:{ok:false};
    if(cls==='shaman')return s===2||mail||s===6?{ok:true,preferred:false}:{ok:false};
    return{ok:false};
  }
  return{ok:false};
}
function zoneEntry(zk,level,cls,profile,settings,sess){
  const z=IX.zones[zk];if(!z)return null;
  const[zname,,zfac,zmin,zmax]=z;
  const camps=[],itemZone=new Map(),rares=new Map(),chests=new Map();
  const vendor=vendorCamps(zk,level,profile,settings,sess);
  let chestSpots=0;
  const mobSp=(mid,fb)=>{const zm=IX.mobZoneSpawns[mid];return zm&&zm[zk]!=null?zm[zk]:fb;};
  const objSp=(oid,fb)=>{const zm=IX.objZoneSpawns[oid];return zm&&zm[zk]!=null?zm[zk]:fb;};
  const processDrops=drops=>{
    let cv=0,ev=0,vendorCv=0,vendorEv=0,liqUnknown=0;
    for(const d of drops){
      for(const src of d.srcs){
        const e=eligible(src,profile,settings);if(!e.ok)continue;
        const m=metrics(src,d.it,settings,level),lq=sess.liq.get(d.iid);
        if(!m.vendorFloor&&lq==null)liqUnknown++;
        const base=m.u*m.net*(m.vendorFloor||lq==null?1:lq),v=m.K*base;
        if(m.vendorFloor){vendorCv+=v;vendorEv+=base;}
        else{cv+=v;ev+=base;}
        let a=itemZone.get(d.iid);
        if(!a){a={v:0,src:null};itemZone.set(d.iid,a);}
        a.v+=v;if(!a.src||v>a.src.v)a.src={v,src};
      }
    }
    return{cv,ev,vendorCv,vendorEv,liqUnknown};
  };
  let liqUnknown=0;
  for(const mid of IX.byZoneM[zk]||[]){
    const mob=IX.mobs[mid];if(!mob)continue;
    const drops=mobDrops(mid,zk,sess),r=processDrops(drops);
    liqUnknown+=r.liqUnknown;
    const v=vendor.get(`mob:${mid}`);
    if(mob[3]==='rare'||mob[3]==='rareelite'){
      const rep={kind:'mob',id:mid,name:mob[0],zoneKey:zk,lvlMin:mob[1],lvlMax:mob[2],rank:mob[3],spawns:mobSp(mid,mob[5]),respawnSec:mob[6],sides:mob[7]||'ah',chance:0,avgCount:1,objKind:null};
      const e0=eligible(rep,profile,settings).ok,cur=rares.get(mid)||{name:mob[0],ev:0,vendorEv:0,scan:false,elig:false};
      cur.ev+=r.ev;cur.vendorEv+=r.vendorEv+(v?.ev||0);cur.scan=cur.scan||drops.length>0;cur.elig=cur.elig||e0;
      cur.respawnSec=rep.respawnSec;cur.spawns=rep.spawns;rares.set(mid,cur);
    }else camps.push({id:mid,name:mob[0],kind:'mob',ah:r.cv,vendor:r.vendorCv+(v?.gph||0),lvlMin:mob[1],lvlMax:mob[2],spawns:mobSp(mid,mob[5]),rank:mob[3]});
  }
  for(const oid of IX.byZoneO[zk]||[]){
    const obj=IX.objects[oid];if(!obj)continue;
    const isChest=obj[1]==='chest';
    const r=processDrops(objDrops(oid,zk,sess));
    liqUnknown+=r.liqUnknown;
    const v=vendor.get(`object:${oid}`);
    if(isChest){
      const spots=objSp(oid,obj[3]||0);chestSpots+=spots;
      const c=chests.get('o'+oid)||{name:obj[0],ev:0,vendorEv:0,spots:0};c.ev+=r.ev;c.vendorEv+=r.vendorEv+(v?.ev||0);c.spots+=spots;chests.set('o'+oid,c);
    }else camps.push({id:oid,name:obj[0],kind:'object',ah:r.cv,vendor:r.vendorCv+(v?.gph||0),lvlMin:null,lvlMax:null,spawns:objSp(oid,obj[3]||0),objKind:obj[1]});
  }
  for(const ent of IX.privRaresByZone[zk]||[]){
    const drops=entDrops(ent,sess),r=processDrops(drops);
    liqUnknown+=r.liqUnknown;
    const rep=ent.srcs[0]?.src,e0=rep?eligible(rep,profile,settings).ok:false;
    const cur=rares.get(ent.npcId)||{name:ent.name,ev:0,vendorEv:0,scan:false,elig:false};
    cur.ev+=r.ev;cur.vendorEv+=r.vendorEv;cur.scan=cur.scan||drops.length>0;cur.elig=cur.elig||e0;
    if(!(cur.respawnSec>0)) {cur.respawnSec=rep?.respawnSec??null;cur.spawns=rep?.spawns??cur.spawns??1;}
    rares.set(ent.npcId,cur);
  }
  for(const ent of IX.privChestsByZone[zk]||[]){
    const r=processDrops(entDrops(ent,sess));
    liqUnknown+=r.liqUnknown;
    chestSpots+=ent.spots||0;
    const c=chests.get('c'+ent.objId)||{name:ent.name,ev:0,vendorEv:0,spots:0};c.ev+=r.ev;c.vendorEv+=r.vendorEv;c.spots+=ent.spots||0;chests.set('c'+ent.objId,c);
  }
  // Cada raro contribuye su EV × tasa. El tope de zona escala todas las tasas
  // en la misma proporción, sin borrar qué raro es el frecuente.
  let rareValue=0,rareVendor=0,rareEVmax=0,rareRateSum=0,rareApprox=false;
  for(const r of rares.values())if(r.elig){
    const rr=rareRate(r);
    rareRateSum+=rr.rate;rareApprox=rareApprox||rr.approx;
    rareValue+=rr.rate*r.ev;rareVendor+=rr.rate*r.vendorEv;
    rareEVmax=Math.max(rareEVmax,r.ev);
  }
  if(rareRateSum>RARE_ZONE_MAX){const scale=RARE_ZONE_MAX/rareRateSum;rareValue*=scale;rareVendor*=scale;}
  let chestValue=0,chestVendor=0,chestEVmean=0;
  if(chestSpots>0){
    let we=0,wv=0;
    for(const c of chests.values()){we+=c.ev*c.spots;wv+=c.vendorEv*c.spots;}
    chestEVmean=we/chestSpots;
    const k=Math.min(CHEST_ZONE_MAX,CHEST_OPEN_RATE*chestSpots);
    chestValue=k*chestEVmean;chestVendor=k*wv/chestSpots;
  }
  const rareScan=[...rares.values()].filter(r=>r.scan).length;
  const useful=[];
  for(const[iid,srcs]of zoneQualSrcs(zk)){
    const dd=IX.items[iid];if(!dd)continue;
    let best=null;
    for(const s of srcs){if(!eligible(s,profile,settings).ok)continue;if(!best||s.chance>best.chance)best=s;}
    if(!best)continue;
    const quality=dd[1],icls=dd[2],sub=dd[3],req=dd[5],allow=dd[8];
    if(quality<2)continue;
    if(req==null||req<level-2||req>level+5)continue;
    if(allow!==-1&&!(allow&CLASS_BIT[cls]))continue;
    const g=usefulGear({icls,sub},cls,level,profile.pref||'any');
    if(!g.ok)continue;
    const cat=ENV.HunterMarketCatalog?.items?.[iid];
    useful.push({iid:+iid,name:cat?.name||dd[0]||`Ítem #${iid}`,srcName:best.name,preferred:g.preferred,isRare:isRareKind(best),v:itemZone.get(iid)?.v||0,hist:sess.scan.get(iid)?.history||[],price:sess.scan.get(iid)?.unitPriceCopper});
  }
  useful.sort((a,b)=>b.v-a.v||Number(b.isRare)-Number(a.isRare)||a.name.localeCompare(b.name));
  const ub=usefulBonusFor(useful.length),usefulBonus=0; // informativo: no se aplica al puntaje
  // Un solo orden de campamentos, por valor combinado sin bonus. Ambos canales
  // usan el mismo sitio o los mismos pesos; el bonus no cambia el itinerario.
  for(const c of camps)c.value=c.ah+c.vendor;
  camps.sort((a,b)=>b.value-a.value);
  const weights=settings.campMode==='rotation'&&validCampWeights(settings.campWeights)?settings.campWeights:[1,0,0];
  let zoneBase=0,vendorValue=rareVendor+chestVendor;
  for(let i=0;i<weights.length&&i<camps.length;i++){
    zoneBase+=weights[i]*camps[i].ah;vendorValue+=weights[i]*camps[i].vendor;
  }
  const ahTotal=zoneBase+rareValue+chestValue;
  const total=ahTotal+vendorValue;
  const risk=riskFor(zfac,profile,settings),comp=compFor(zk,zname,settings,profile);
  const travel=travelFor(zname,profile.fac,profile.hubZones,settings.session);
  // Objetivo único: oro. Los ítems útiles para tu clase se informan, no puntúan.
  const score=total*risk.mult*COMP[comp.comp]*travel.factor;
  const scoreNoBonus=score;
  if(!(score>0)||!isFinite(score))return null;
  const topItems=[...itemZone.entries()].filter(([,a])=>a.v>0).sort((a,b)=>b[1].v-a[1].v).slice(0,3).map(([iid,a])=>{
    const inf=sess.info.get(iid),scanIt=sess.scan.get(iid);
    return{itemId:+iid,name:inf.name,price:scanIt.unitPriceCopper,chance:a.src.src.chance,doubtful:refPrice(scanIt).doubtful,source:a.src.src,hist:scanIt.history||[]};
  });
  const clsName=CLS_NAME[cls]||cls,isInst=zfac==='instance'||zk.charCodeAt(0)===105;
  const reasons=[];
  const topCamp=camps.find(c=>c.value>0);
  if(topCamp)reasons.push(`Camp principal: ${topCamp.name} nv ${topCamp.lvlMin??'?'}–${topCamp.lvlMax??'?'} · ${topCamp.spawns} spawns · ~${gphF(topCamp.value)}/h approx`);
  reasons.push(`Campamentos: ${settings.campMode==='rotation'&&validCampWeights(settings.campWeights)?'rotación con pesos de tiempo declarados':'un sitio a la vez = max(camp)'} — sin simultaneidad asumida`);
  if(rares.size)reasons.push(`${rares.size} rareza${rares.size>1?'s':''} en zona (${rareScan} con ítems de tu scan)${rareApprox?' — tasa 0,2/h aproximada sin respawn':''}`);
  if(chestSpots)reasons.push(`${chestSpots} puntos de cofre conocidos (no simultáneos)`);
  if(useful.length)reasons.push(`${useful.length} ítem${useful.length>1?'s':''} útil${useful.length>1?'es':''} para ${clsName} (información; no suma al oro estimado)`);
  if(liqUnknown)reasons.push(`Liquidez SIN DATOS en ${liqUnknown} drops: sin ajuste; available es oferta, no venta`);
  reasons.push(risk.note||(isInst?'Riesgo bajo: instancia':'Riesgo bajo: territorio propio'));
  reasons.push(`Riesgo y competencia: heurísticos, sin datos de población (${risk.level}, ${COMP_LABEL[comp.comp]}) — ${comp.why}`);
  if(travel.min)reasons.push(`Traslado ~${travel.min} min ida y vuelta${travel.hub?' (tu ruta de nivel pasa por la zona)':''}${travel.fp?'':' — la facción no tiene vuelo propio acá'} (aprox.)`);
  if(isInst)reasons.push('Requiere grupo');
  return{zoneKey:zk,name:zname,score,scoreNoBonus,gph:total,zoneBase,rareValue,chestValue,rareEVmax,chestEVmean,vendorGph:vendorValue,travel,
    levels:[zmin,zmax],
    campMode:settings.campMode,campWeights:settings.campWeights,liqUnknown,rareRateSum,rareApprox,
    usefulBonus,usefulBonusInfo:ub,heuristics:MODEL,
    topItems,camps:camps.filter(c=>c.value>0).slice(0,3).map(c=>({id:c.id,name:c.name,gph:c.value,lvlMin:c.lvlMin,lvlMax:c.lvlMax,spawns:c.spawns,kind:c.kind,objKind:c.objKind})),
    rareCount:rares.size,rareScan,chestCount:chestSpots,usefulCount:useful.length,usefulIds:useful.map(u=>u.iid),
    useful:useful.slice(0,3).map(u=>({itemId:u.iid,name:u.name,srcName:u.srcName,preferred:u.preferred,isRare:u.isRare})),
    risk,comp,reasons};
}
function rank(scanItems,profile,settings){
  index();const res={A:null,B:[],all:[]};
  if(!IX.hasData)return res;
  profile=profile||{};settings=normalizeSettings(settings);
  const sess=session(scanItems||[]);
  if(!sess.scan.size)return res;
  const level=profile.level||12,cls=profile.cls||'hunter';
  const entries=[];
  for(const zk of candidateZones(level,settings)){
    const e=zoneEntry(zk,level,cls,profile,settings,sess);
    if(e)entries.push(e);
  }
  entries.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
  res.all=entries;res.A=entries[0]||null;res.B=entries.slice(1,1+settings.n);
  return res;
}
function progression(scanItems,profile,settings){
  index();const out=[],lvl=profile?.level||12;
  if(lvl>=60||!IX.hasData)return out;
  for(const d of[5,10,15,20]){
    const T=lvl+d;if(T>60)break;
    const r=rank(scanItems,{...profile,level:T},settings);
    if(r.A)out.push({level:T,zoneKey:r.A.zoneKey,name:r.A.name,gph:r.A.gph,camp:r.A.camps[0]?.name||''});
    if(out.length>=4)break;
  }
  return out;
}

/* ================= Guía de farmeo (curada del video/MD) =================
   Spots por franja de nivel con la zona del dataset, el campamento y qué
   dropea. Estimaciones del video — aproximadas, no medidas en tu servidor. */
const GUIDE_FARMS=[
 {lvl:[15,22],zones:['Redridge Mountains'],camp:'Condors cerca de Three Corners',drops:'Tough Condor Meat · Goretusk Snout',est:'quest items ~1g/h',note:'La gente paga por saltarse la zona — AH siempre'},
 {lvl:[18,28],zones:['Stranglethorn Vale'],camp:'Costa de Booty Bay / aguas de Nesingwary',drops:'Blue Pearl (almejas gigantes)',est:'volumen por hora',note:'La quest "Buceo de perlas" tiene demanda'},
 {lvl:[20,30],zones:['Wetlands'],camp:'Costa norte · campos de gnolls · whelps',drops:'Iridescent Pearl · Small Flame Sac',est:'~5-8s/h vendor+AH',note:'Perlas iridiscentes = mats para crafts BoP de Forever (demanda real)'},
 {lvl:[25,35],zones:['Badlands'],camp:'Elementales de roca · entrada de Uldaman',drops:'Dust/Salt/Elemental Earth (vendor)',est:'~10g/h vendor sin competencia',note:'Punto bajo: elementales menores nv 37-39'},
 {lvl:[30,40],zones:['Swamp of Sorrows'],camp:'Campos de Swamp Jaguar',drops:'Long Soft Tail · Bristly Whisker',est:'~10-12g/h con mount',note:'Cola y bigote caen casi siempre — oro puro + skinning encima'},
 {lvl:[34,45],zones:['Badlands','Swamp of Sorrows'],camp:'Nidos de whelps (Adolescent/Dreaming/Scalding)',drops:'Small Flame Sac · cría de dragón oscuro (pet BoU)',est:'batido picante = demanda de flame sacs',note:'El pet BoU es inversión, no ingreso directo'}];
const GUIDE_PRINCIPLES=[
 'Skinning: vendor hasta ~20-25; después AH solo si hay demanda real en tu servidor',
 'Quest items y páginas de libro → AH siempre: la gente paga por saltarse contenido',
 'No listar materiales de craft baratos en AH — el margen no paga el slot',
 'Shadowgem: farmeable en zonas bajas o comprar ~10-15 y vender en el pico 20-25',
 'Volumen > margen unitario: perlas y páginas valen por hora, no por unidad',
 'Todo es aproximado: drop rates de referencia Classic 1.12, no observados en Forever'];
function spotsFor(level){
  const hit=GUIDE_FARMS.filter(s=>level+2>=s.lvl[0]&&level-2<=s.lvl[1]);
  return hit.length?hit:GUIDE_FARMS.filter(s=>s.lvl[0]>level).slice(0,2);
}
let GK={lvl:-1,set:new Set()};
function guideZoneKeys(level){
  if(GK.lvl!==level){
    const set=new Set();index();
    for(const s of spotsFor(level))for(const zn of s.zones){const zk=IX.zoneByName[zn];if(zk)set.add(zk);}
    GK={lvl:level,set};
  }
  return GK.set;
}
function profCardHTML(profs){
  let h=`<div class="card"><h3>Por tu profesión <span class="sub">mejores zonas para tus oficios · approx</span></h3>`;
  for(const p of profs){
    h+=`<div class="farm-sec"><h5>${esc(p.name)}</h5><ul>${p.zones.map(z=>
      `<li><b>${esc(z.name)}</b> <span class="muted">· ~${esc(gphF(z.gph))}/h en materiales${z.items.length?' · '+z.items.map(esc).join(' · '):''}</span></li>`).join('')}</ul></div>`;
    if(p.along&&p.along.length)h+=`<div class="farm-sec"><h5>Skin-along · lo que otros cazan</h5><ul>${p.along.map(z=>
      `<li><b>${esc(z.name)}</b> <span class="muted">· ~${esc(gphF(z.gph))}/h en materiales${z.items.length?' · '+z.items.map(esc).join(' · '):''} · quests nv ${esc(z.bands)}</span></li>`).join('')}</ul>
      <p class="tip">Skinneá todo lo que muera cerca tuyo: en zonas de misiones las bestias caen solas. Estimado al ~50% del farmeo propio — otros compiten por las mismas pieles.</p></div>`;
  }
  h+=`<p class="tip">Materiales valorados a AH neto si están en tu scan, si no a precio de vendedor. El oficio se suma al farmeo normal — no reemplaza el oro de monturas/ítems.</p></div>`;
  return h;
}
function guideCardHTML(spots){
  let h=`<div class="card"><h3>Granjas de la guía <span class="sub">video + datos · estimaciones, no medidas</span></h3><div class="farm-sec"><ul>`;
  for(const s of spots)h+=`<li><b>${esc(s.camp)}</b> <span class="muted">· ${s.zones.map(z=>esc(zoneName(IX.zoneByName[z]||z))).join(' + ')} · nv ${s.lvl[0]}–${s.lvl[1]}</span><div class="muted">${esc(s.drops)} — ${esc(s.est)}</div>${s.note?`<div class="muted" style="font-size:11.5px">${esc(s.note)}</div>`:''}</li>`;
  h+=`</ul></div><details class="fold"><summary><span class="arrow">▶</span>Principios y errores comunes de la guía</summary><div class="fbody"><ul class="farm-reasons">${GUIDE_PRINCIPLES.map(p=>`<li>${esc(p)}</li>`).join('')}</ul></div></details></div>`;
  return h;
}

/* ================= RENDER ================= */
const KIND_LABEL={mob:'',skin:'Piel: ',pick:'Pillosidad: ',object:'Objeto: ','rare-obs':'Rareza observada: ','chest-obs':'Cofre observado: '};
function srcLabel(s){return`${KIND_LABEL[s.kind]||''}${s.name||''}${s.origin==='rarescanner'?' · observado (RareScanner)':''}`;}
function zoneName(zk){return IX.zones[String(zk)]?.[0]||String(zk);}
/* Coordenadas verificadas del server real (azeroth.wiki/forever) para mobs
   concretos. Solo se muestran si el coord vive en la misma zona del card —
   las coords son relativas al mapa de esa zona. */
const zoneSlugOf=zn=>String(zn||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
function spotCoords(camp,zk){
  index();
  const fd=ENV.HunterDropForever?.mobs;
  // solo camps 'mob': los IDs de objetos son otro namespace y podrían colisionar
  const c=camp&&camp.kind==='mob'&&camp.id!=null?fd?.[camp.id]:null;
  if(!c)return'';
  return zoneSlugOf(zoneName(zk))===c[2]?` · <span class="muted">${c[0]}, ${c[1]}</span>`:'';
}
function settingsHTML(s){
  const sel=(id,cur,opts)=>`<label>${id==='farmComp'?'Competencia':id==='farmN'?'Zonas extra':'Oro/h de ref.'}<select id="${id}">${opts.map(o=>`<option value="${o[0]}" ${String(cur)===o[0]?'selected':''}>${o[1]}</option>`).join('')}</select></label>`;
  return `<div class="market-toolbar">
    ${sel('farmComp',s.comp,[['auto','Auto'],['low','Baja'],['med','Media'],['high','Alta']])}
    <label>Oro/h de ref.<input id="farmGph" type="number" min="1" max="1000" step="1" value="${esc(s.gph)}"></label>
    <label>Ciclo de farmeo<select id="farmSession">${[1,2,4].map(h=>`<option value="${h}" ${s.session===h?'selected':''}>${h} h</option>`).join('')}</select></label>
    <label class="chk"><input id="farmSkin" type="checkbox" ${s.prof.skin?'checked':''}>Piel</label>
    <label class="chk"><input id="farmHerb" type="checkbox" ${s.prof.herb?'checked':''}>Hierbas</label>
    <label class="chk"><input id="farmMine" type="checkbox" ${s.prof.mine?'checked':''}>Minería</label>
    <label class="chk"><input id="farmGroup" type="checkbox" ${s.group?'checked':''}>Grupo</label>
    <label class="chk"><input id="farmPvp" type="checkbox" ${s.pvp?'checked':''}>PvP</label>
    <label>Zonas extra<select id="farmN">${[3,4,5,6,7,8].map(n=>`<option value="${n}" ${s.n===n?'selected':''}>${n}</option>`).join('')}</select></label>
  </div>`;
}
// Métricas tiempo×precio del historial acumulado (approx): sparkline del
// mínimo diario + tendencia + mediana vs precio actual. Vacío sin datos.
function priceMetricsHTML(hist,price){
  const ch=ENV.HunterChart?.sparkline?ENV.HunterChart.sparkline(hist):'';
  const st=ENV.HunterHistory?.priceStats?ENV.HunterHistory.priceStats(hist):null;
  if(!ch&&!st?.diasMuestra)return'';
  const tend=st?{sube:'al alza',baja:'a la baja',estable:'estable','sin-datos':'pocos datos'}[st.tendencia]||'':'';
  const bits=[];
  if(st?.diasMuestra>=2)bits.push(`<span class="badge ${st.tendencia==='sube'?'soon':st.tendencia==='baja'?'down':''}">${esc(tend)} · ${st.diasMuestra}d</span>`);
  if(st?.medianaLow!=null)bits.push(`<span class="muted">med ${esc(money(st.medianaLow))}${price!=null?` · hoy ${esc(money(price))}`:''}</span>`);
  return`<div class="farm-metrics">${ch?`<span class="farm-spark">${ch}</span>`:''}${bits.join('')}</div>`;
}
function cardHTML(e,rank,profile,settings,profTop){
  const cur=settings.zoneComp[e.zoneKey]||'auto';
  let h=`<div class="farm-card" data-zone="${esc(e.zoneKey)}" data-rank="${rank}"><div class="farm-chead"><b>${rank} · ${esc(e.name)}</b>`;
  h+=`<span class="badge">${esc('riesgo '+e.risk.level)}</span><span class="badge">competencia ${esc(COMP_LABEL[e.comp.comp])}</span>`;
  if(e.travel&&e.travel.min)h+=`<span class="badge">viaje ~${e.travel.min} min${e.travel.fp?'':' · sin vuelo'}${e.travel.hub?' · tu ruta':''}</span>`;
  if(e.vendorGph)h+=`<span class="badge">≈${esc(gphF(e.vendorGph))}/h vendedor</span>`;
  if(guideZoneKeys(profile.level||12).has(e.zoneKey))h+=`<span class="badge">guía</span>`;
  if(profTop&&profTop.has(e.zoneKey))h+=`<span class="badge">tu prof</span>`;
  h+=`<span class="muted">nv ${e.levels[0]}–${e.levels[1]} · vos nv ${profile.level||12}</span></div>`;
  h+=`<div class="muted">~${esc(gphF(e.gph))}/h approx antes de multiplicadores · ${e.rareCount} rarezas (${e.rareScan} con tu scan) · ${e.chestCount} puntos de cofre · ${e.usefulCount} útiles</div>`;
  if(e.topItems.length)h+=`<div class="farm-sec"><h5>Ítems de tu scan</h5><ul>${e.topItems.map(t=>`<li>${esc(t.name)} · ${esc(srcLabel(t.source))} · zona ${esc(zoneName(t.source.zoneKey))} · ${pctF(t.chance)}${t.doubtful?' <span class="badge soon">precio dudoso</span>':''}${priceMetricsHTML(t.hist,t.price)}</li>`).join('')}</ul></div>`;
  if(e.useful.length)h+=`<div class="farm-sec"><h5>Útiles para vos</h5><ul>${e.useful.map(u=>`<li>${esc(u.name)} <span class="muted">· ${esc(u.srcName||'')}</span>${u.preferred?' <span class="badge bow">tu arma preferida</span>':''}${u.isRare?' <span class="badge soon">rareza</span>':''}${priceMetricsHTML(u.hist,u.price)}</li>`).join('')}</ul></div>`;
  if(e.camps.length)h+=`<div class="farm-sec"><h5>Camps principales</h5><ul>${e.camps.map(c=>`<li>${esc(c.name)} · ${c.kind==='object'?'recolección':'mob'} · ~${esc(gphF(c.gph))}/h approx${spotCoords(c,e.zoneKey)}</li>`).join('')}</ul></div>`;
  if(e.risk.note)h+=`<div class="farm-note">${esc(e.risk.note)}</div>`;
  h+=`<div class="farm-ctl"><label>Competencia<select class="farm-comp" data-zone="${esc(e.zoneKey)}">${[['auto','Auto'],['low','Baja'],['med','Media'],['high','Alta']].map(o=>`<option value="${o[0]}" ${cur===o[0]?'selected':''}>${o[1]}</option>`).join('')}</select></label>`;
  h+=`<button type="button" class="btn mini farm-copada" data-zone="${esc(e.zoneKey)}">Zona copada</button></div>`;
  h+=`<ul class="farm-reasons">${e.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></div>`;
  return h;
}
function footerHTML(items){
  const ms=matchStats(items),d=ENV.HunterDropData,priv=ENV.HunterDropDataPrivate,pd=priv?.source;
  const L=[`Cobertura del scan: ${ms.matched}/${ms.total} ítems (${ms.pct}%) — capas: dataset público ${ms.byLayer.public}, ${priv?'RareScanner':'sin capa privada'} ${ms.byLayer.private}, catálogo ${ms.byLayer.catalog}.`];
  const src=d?.source;
  if(src)L.push(`${src.license||''} · ${src.attribution||''}`.trim());
  if(pd)L.push(`Capa observada: ${pd.addon||'RareScanner'} — ${pd.license||'uso local privado'}.`);
  L.push(priv
    ?'Estimaciones aproximadas: drop rates de referencia Classic 1.12 (CMaNGOS), no observados en Forever salvo \'observado (RareScanner)\'. Coordenadas de mobs: DB comunitaria azeroth.wiki/forever. Sin datos de población: la competencia es tu selección + heurísticas.'
    :'Estimaciones aproximadas: drop rates de referencia Classic 1.12 (CMaNGOS), no observados en Forever. Coordenadas de mobs: DB comunitaria azeroth.wiki/forever. Sin datos de población: la competencia es tu selección + heurísticas.');
  return L.map(t=>`<p class="tip">${esc(t)}</p>`).join('');
}
function render(el,ctx){
  if(!el||!el.isConnected)return;
  index();
  const profile=ctx?.profile||{},settings=normalizeSettings(ctx?.settings),items=ctx?.items||[];
  let h='<h3>Farmeo recomendado <span class="sub">aprox · Classic 1.12</span></h3>';
  if(!IX.hasData){el.innerHTML=h+'<p class="muted">Dataset de drops no disponible.</p>';return;}
  if(!items.length){el.innerHTML=h+'<p class="muted">Importá tu Auctionator.lua para ver recomendaciones de farmeo.</p>';return;}
  h+=settingsHTML(settings);
  const profs=profRecommendations(items,profile,settings);
  const profTop=new Set(profs.flatMap(p=>p.zones.map(z=>z.zoneKey)));
  const res=rank(items,profile,settings);
  if(res.A)h+=`<div class="farm-cards">${cardHTML(res.A,'A',profile,settings,profTop)+res.B.map((b,i)=>cardHTML(b,'B'+(i+1),profile,settings,profTop)).join('')}</div>`;
  else h+='<p class="muted">Ninguna zona puntúa con tu scan y nivel — revisá nivel, facción o el dataset.</p>';
  if(profs.length)h+=profCardHTML(profs);
  const spots=spotsFor(profile.level||12);
  if(spots.length)h+=guideCardHTML(spots);
  const prog=progression(items,profile,settings);
  if(prog.length){
    let prev=null,lis='';
    for(const p of prog){
      const same=prev&&p.zoneKey===prev;
      lis+=`<li>A nivel ${p.level}–${p.level+4}: ${same?`seguí en ${esc(p.name)}`:`movete a ${esc(p.name)} (~${esc(gphF(p.gph))}/h approx${p.camp?`, camp ${esc(p.camp)}`:''})`}</li>`;
      prev=p.zoneKey;
    }
    h+=`<div class="farm-prog"><h5>Progresión</h5><ul id="farmProgress">${lis}</ul></div>`;
  }
  h+=`<details class="fold"><summary><span class="arrow">▶</span>Fuentes, cobertura y licencia del dataset</summary><div class="fbody">${footerHTML(items)}</div></details>`;
  el.innerHTML=h;
  const changed=f=>{ctx?.saveFarm&&ctx.saveFarm(f);ctx?.refresh&&ctx.refresh();};
  const q=s=>el.querySelector(s);
  q('#farmComp')?.addEventListener('change',e=>changed({...settings,comp:e.target.value}));
  q('#farmGph')?.addEventListener('change',e=>{const n=+e.target.value;changed({...settings,gph:Number.isFinite(n)&&n>0?Math.min(1000,n):5});});
  q('#farmSession')?.addEventListener('change',e=>{const h=+e.target.value;changed({...settings,session:[1,2,4].includes(h)?h:2});});
  for(const[id,key]of[['#farmSkin','skin'],['#farmHerb','herb'],['#farmMine','mine']])
    q(id)?.addEventListener('change',e=>changed({...settings,prof:{...settings.prof,[key]:e.target.checked}}));
  q('#farmGroup')?.addEventListener('change',e=>changed({...settings,group:e.target.checked}));
  q('#farmPvp')?.addEventListener('change',e=>changed({...settings,pvp:e.target.checked}));
  q('#farmN')?.addEventListener('change',e=>{const n=+e.target.value;changed({...settings,n:n>=3&&n<=8?n:5});});
  el.querySelectorAll('.farm-comp').forEach(s=>s.addEventListener('change',e=>{
    const zk=e.target.dataset.zone,f={...settings,zoneComp:{...settings.zoneComp}};
    if(e.target.value==='auto')delete f.zoneComp[zk];else f.zoneComp[zk]=e.target.value;
    changed(f);
  }));
  el.querySelectorAll('.farm-copada').forEach(b=>b.addEventListener('click',()=>{
    changed({...settings,zoneComp:{...settings.zoneComp,[b.dataset.zone]:'high'}});
  }));
}

ENV.HunterFarm={index,byZone,byMob,sources,itemMetrics,matchStats,rank,progression,render,travelFor,profRecommendations,trafficZones,spotCoords,
  MODEL,campAggregate,rateInfo,liquidityInfo,referencePrice:refPrice,clampOutlier,rareRate,rate,
  usefulBonusFor,marginInfo,riskInfo,compFor,riskFor,
  fmt:{gph:gphF,pct:pctF,money,esc,zoneName,srcLabel}};
})();
if(typeof module==='object'&&module&&module.exports)module.exports=Object.assign({configure:o=>Object.assign(ENV,o)},ENV.HunterFarm);
