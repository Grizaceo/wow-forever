// Offline, isolated acceptance tests for the farm recommender (Phases 2+3).
// Two contexts: (a) synthetic RareScanner overlay, (b) public data only.
import fs from 'node:fs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--disable-gpu']});
const url=new URL('../index.html',import.meta.url).href;
const day=Math.floor((Date.now()-Date.UTC(2020,0,1))/86400000);
// Two days of history per item so farm cards can render price sparklines.
const li=(price,d=day,avail)=>`{m=${price},h={["${d-1}"]=${Math.max(1,Math.floor(price*0.9))},["${d}"]=${price}},l={},a={${avail?`["${d}"]=${avail}`:''}}}`;
// Pick the dataset item with the largest vendor sell>0 that has an eligible
// lvl-12 horde source — big sell keeps floor() rounding under the 1% assert.
const ddJson=JSON.parse(fs.readFileSync(new URL('../drop-data.js',import.meta.url),'utf8').match(/var DATA=(\{[\s\S]*?\});/)[1]);
globalThis.window={HunterDropData:ddJson};
// drop-data-forever.js (azeroth.wiki scrape) is not part of the public source.
eval(fs.readFileSync(new URL('../market-farm.js',import.meta.url),'utf8'));
const Farm=globalThis.window.HunterFarm;
const prof12={level:12,cls:'hunter',fac:'horde'},sett12={comp:'auto',zoneComp:{},gph:5,prof:{skin:false,herb:false,mine:false},group:false,pvp:true,n:5};
let OUT=null;
for(const[id,it]of Object.entries(ddJson.items)){const sell=it[9];if(!sell||sell<=0)continue;if(OUT&&sell<=OUT.sell)continue;if(Farm.sources(id,prof12,sett12).some(s=>s.eligible))OUT={id:+id,name:it[0],sell};}
if(!OUT)throw new Error('no outlier fixture candidate');
const OUT_PRICE=OUT.sell*200; // >50× vendor sellPrice → must be capped
const fixture=Buffer.from(`AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["PvP"]={version=2,["2589"]=${li(500,day,40)},["2318"]=${li(300)},["4306"]=${li(1500,day,30)},["4338"]=${li(3000)},["14047"]=${li(5000)},["13468"]=${li(900000,day-10)},["999999"]=${li(99)},["${OUT.id}"]=${li(OUT_PRICE,day,1)}}}`);
// The rare also drops 13468 so its (only) private source tops the table row and
// the malicious name is actually rendered — exercising the esc() path in the DOM.
const priv={schemaVersion:1,private:true,source:{addon:'RareScanner',license:'test fixture'},fields:{},
  rares:{'990001':['Rare <img src=x onerror=window.pwned=1>',12,{'1436':2},{'2589':50,'13468':25}]},
  containers:{'880001':['ChestTest',{'1436':3},{'2589':25}]}};
const results=[],errorsA=[],errorsB=[],requestsA={n:0},requestsB={n:0};
const check=(results,errors)=>(name,pass,evidence)=>{results.push({name,pass:!!pass,evidence});if(!pass)throw new Error(name);};
const scanItems=()=>[2589,2318,4306,4338,14047,13468,999999,OUT.id].map(id=>{
  const prices={2589:500,2318:300,4306:1500,4338:3000,14047:5000,13468:900000,999999:99,[OUT.id]:OUT_PRICE};
  const d=id===13468?day-10:day,avail=id===2589?40:id===4306?30:id===OUT.id?1:null;
  return{itemId:id,sourceKey:String(id),unitPriceCopper:prices[id],observedDay:d,history:[{day:d,low:prices[id],high:prices[id],available:avail}]};
});
const prof=(o={})=>({level:12,cls:'hunter',fac:'horde',spec:'bm',pref:'bow',hubZones:'The Barrens (Crossroads)',...o});
const sett=(o={})=>({comp:'auto',zoneComp:{},gph:5,prof:{skin:false,herb:false,mine:false},group:false,pvp:true,n:5,...o});
async function newContext(privateValue,req){
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.addInitScript(v=>{
    Object.defineProperty(window,'HunterDropDataPrivate',{configurable:true,get:()=>v,set:()=>{}});
    Object.defineProperty(window,'HunterMarketLocalScan',{value:null,writable:false});
  },privateValue);
  await context.route(/^https?:/,r=>{req.n++;return r.abort();});
  const page=await context.newPage();page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  return{context,page,errors,req};
}
async function ready(page){await page.waitForFunction(()=>document.querySelector('#marketRoot')?.dataset.busy==='false');}
async function upload(page){await page.locator('#marketFile').setInputFiles({name:'Auctionator.lua',mimeType:'application/octet-stream',buffer:fixture});await ready(page);}
async function farmRank(page,profile,settings){return page.evaluate(([p,s,items])=>window.HunterFarm.rank(items,p,s),[profile,settings,scanItems()]);}
try {
  /* ---------- Context (a): synthetic private overlay ---------- */
  const A=await newContext(priv,requestsA),page=A.page,checkA=check(results,errorsA);
  await page.goto(url);
  await page.locator('#tabsNav [data-t="market"]').click();await ready(page);
  checkA('no snapshot farm message',await page.locator('#farmRoot').innerText().then(t=>t.includes('Importá tu Auctionator.lua para ver recomendaciones de farmeo.')));
  // 1 dataset loaded
  const ds=await page.evaluate(()=>{const d=window.HunterDropData;return{v:d?.schemaVersion,lic:d?.source?.license,attr:d?.source?.attribution,n:Object.keys(d?.items||{}).length,hex:d?.source?.files?.every(f=>/^[a-f0-9]{64}$/.test(f.sha256))};});
  checkA('dataset loaded GPL CMaNGOS',ds.v===1&&ds.lic==='GPL-3.0-or-later'&&/CMaNGOS/.test(ds.attr)&&ds.n>=5000&&ds.hex===true,ds);
  // 2 matchStats
  const ms=await page.evaluate(items=>window.HunterFarm.matchStats(items),scanItems());
  const m2589=await page.evaluate(()=>window.HunterFarm.sources(2589,{},{}).length);
  const m999999=await page.evaluate(()=>window.HunterFarm.sources(999999,{},{}).length);
  checkA('matchStats matched/pct',ms.total===8&&ms.matched===7&&Math.abs(ms.pct-ms.matched/ms.total*100)<0.11&&m2589>0&&m999999===0,{ms,m2589,m999999});
  // 3 byZone/byMob
  const bz=await page.evaluate(()=>{const b=window.HunterFarm.byZone('1436');return{mob:b.mobs.includes('117'),item:b.items.includes('2589'),byMob:window.HunterFarm.byMob('117').includes('2589')};});
  checkA('byZone 1436 Riverpaw + 2589',bz.mob&&bz.item&&bz.byMob,bz);
  // 4 itemMetrics 2589 lvl12 horde
  const im=await page.evaluate(()=>window.HunterFarm.itemMetrics({itemId:2589,unitPriceCopper:500,observedDay:20000,history:[{day:20000,low:500,high:500,available:40}]},{level:12,cls:'hunter',fac:'horde',spec:'bm',pref:'bow'},{comp:'auto',zoneComp:{},gph:5,prof:{skin:false,herb:false,mine:false},group:false,pvp:true,n:5}));
  checkA('itemMetrics 2589 farmable gph roi',im.farmable===true&&im.gph>0&&Number.isFinite(im.roi),{gph:im.gph,roi:im.roi});
  // 5 faction: runtime h-only mob (sources are per-zone variants now)
  const fac=await page.evaluate(items=>{
    const hid=Object.keys(window.HunterDropData.mobs).find(id=>window.HunterDropData.mobs[id][7]==='h'&&window.HunterFarm.byMob(id).some(i=>items.some(it=>it.itemId===+i)));
    if(!hid)return null;
    const sa=window.HunterFarm.sources(2589,{level:12,cls:'hunter',fac:'alliance'},{prof:{skin:false}}).filter(x=>x.id===hid);
    const sh=window.HunterFarm.sources(2589,{level:12,cls:'hunter',fac:'horde'},{prof:{skin:false}}).filter(x=>x.id===hid);
    return hid?{hid,a:sa.length>0&&sa.every(x=>!x.eligible),h:sh.some(x=>x.eligible)}:null;
  },scanItems());
  checkA('faction filters h-only mob',!!fac&&fac.a===true&&fac.h===true,fac);
  // 0a per-zone spawn counts (otherZones shape)
  const sp=await page.evaluate(()=>{const ix=window.HunterFarm.index(),m=ix.mobZoneSpawns['2350']||{};return{m,b1416:window.HunterFarm.byZone('1416').mobs.includes('2350'),b1421:window.HunterFarm.byZone('1421').mobs.includes('2350'),b1424:window.HunterFarm.byZone('1424').mobs.includes('2350')};});
  checkA('per-zone spawns npc 2350',sp.m['1424']===21&&sp.m['1416']===14&&sp.m['1421']===9&&sp.b1416&&sp.b1421&&sp.b1424,sp);
  // 6 level filter
  const lv=await page.evaluate(items=>{
    const r10=window.HunterFarm.rank(items,{level:10,cls:'hunter',fac:'horde'},{prof:{skin:false}});
    const r55=window.HunterFarm.rank(items,{level:55,cls:'hunter',fac:'alliance'},{prof:{skin:false}});
    return{maxZmin10:Math.max(...r10.all.map(e=>e.levels[0]??0)),a55:r55.A?.levels?.[1]??0};
  },scanItems());
  checkA('level filter 10/55',lv.maxZmin10<=15&&lv.a55>=45,lv);
  await upload(page);
  // 7 ranking lvl12 horde: engine + DOM
  const r12=await farmRank(page,prof(),sett());
  const cards=await page.$$eval('.farm-card',els=>els.map(e=>({zone:e.dataset.zone,rank:e.dataset.rank,reasons:e.querySelectorAll('.farm-reasons li').length})));
  checkA('rank A B scores reasons',!!r12.A&&r12.B.length>=3&&r12.all.every((e,i,a)=>i===0||a[i-1].score>=e.score)&&r12.all.every(e=>e.reasons.length>=1)&&cards.some(c=>c.rank==='A')&&cards.filter(c=>c.rank.startsWith('B')).length>=3,{A:r12.A?.name,B:r12.B.length,all:r12.all.length,cards:cards.length});
  // price-history metrics in farm cards: sparkline + mediana/hoy per item
  const sparks=await page.$$eval('#farmRoot .farm-spark svg',els=>els.length);
  const metText=await page.$$eval('#farmRoot .farm-metrics',els=>els.map(e=>e.textContent)).then(t=>t.join(' | '));
  checkA('farm cards show price sparkline + median',sparks>=1&&/med \d/.test(metText)&&/hoy \d/.test(metText),{sparks,metText:metText.slice(0,160)});
  // rare/chest zone budgets + exposed components (gph = AH + vendor)
  const budgets=r12.all.every(e=>e.rareValue<=1*e.rareEVmax+1e-6&&e.chestValue<=4*e.chestEVmean+1e-6&&e.gph>=e.zoneBase-1e-6&&Math.abs(e.gph-(e.zoneBase+e.rareValue+e.chestValue+e.vendorGph))<1e-6);
  checkA('rare/chest zone budgets hold',budgets,r12.all.slice(0,3).map(e=>({n:e.name,rv:e.rareValue,re:e.rareEVmax,cv:e.chestValue,ce:e.chestEVmean,vg:e.vendorGph})));
  // useful items are dataset-wide, not scan-limited
  const scanIds=new Set(scanItems().map(i=>i.itemId));
  const nonScan=r12.all.filter(e=>e.usefulIds&&e.usefulIds.some(id=>!scanIds.has(id)));
  checkA('useful items include non-scan dataset items',nonScan.length>0,{zones:nonScan.length,example:nonScan[0]?.name});
  // score = (AH×útiles + vendor) × riesgo × competencia × factor viaje
  const CMP={low:1,med:0.75,high:0.45},A12=r12.A,ahT=A12.zoneBase+A12.rareValue+A12.chestValue;
  const expScore=(ahT*(1+Math.min(0.2,0.02*A12.usefulCount))+A12.vendorGph)*A12.risk.mult*CMP[A12.comp.comp]*A12.travel.factor;
  checkA('A score multiplier math',Math.abs(A12.score-expScore)<0.01&&Math.abs(A12.gph-(ahT+A12.vendorGph))<0.01,{score:A12.score,exp:expScore,gph:A12.gph,zb:A12.zoneBase,rv:A12.rareValue,cv:A12.chestValue,vg:A12.vendorGph,tr:A12.travel});
  // viaje: Westfall para horda castiga vs Hillsbrad; badge en la card
  const tw=await page.evaluate(items=>{
    const mk=(fac,hub)=>window.HunterFarm.rank(items,{level:20,cls:'hunter',fac,pref:'bow',hubZones:hub},{comp:'auto',zoneComp:{},gph:5,prof:{skin:false,herb:false,mine:false},group:false,pvp:true,n:5});
    const wf=mk('horde','').all.find(e=>e.name==='Westfall'),hb=mk('horde','').all.find(e=>e.name==='Hillsbrad Foothills'),wa=mk('alliance','').all.find(e=>e.name==='Westfall');
    return{wf:!!wf&&wf.travel.min>=50,hb:!!hb&&hb.travel.min<=35,wa:!!wa&&wa.travel.min<=15,
      tfH:window.HunterFarm.travelFor('Westfall','horde','',2).factor,tfA:window.HunterFarm.travelFor('Westfall','alliance','',2).factor};
  },scanItems());
  checkA('travel penalizes faction-less zones',tw.wf&&tw.hb&&tw.wa&&tw.tfH<tw.tfA,tw);
  const travelBadge=await page.locator('.farm-card .badge', {hasText:'viaje ~'}).count();
  const vendorBadge=await page.locator('.farm-card .badge', {hasText:'vendedor'}).count();
  checkA('travel + vendor badges render',travelBadge>=1&&vendorBadge>=1,{travelBadge,vendorBadge});
  // ciclo de farmeo: selector persiste en state.farm.session
  await page.locator('#farmSession').selectOption('4');
  await page.waitForTimeout(300);
  const sess=await page.evaluate(()=>state.farm.session);
  checkA('session setting persists',sess===4,{sess});
  // guía de farmeo: card con spots del nivel (o próximas) — a lvl 12 muestra
  // las próximas bandas (Redridge/STV)
  const guide=await page.evaluate(()=>document.querySelector('#farmRoot .card')?.textContent||'');
  checkA('guide farm card renders spots',/Granjas de la guía/.test(guide)&&/Condors|Booty Bay|Three Corners/.test(guide),guide.slice(0,220));
  // 8 zona copada — comp global 'low' primero: en horario peak (18-23h) el
  // auto ya deja todo en 'high' y el override manual no cambiaría el ranking,
  // haciendo el test dependiente de la hora. Con 'low' global el copado sí baja.
  await page.locator('#farmComp').selectOption('low');
  const oldA=await page.locator('.farm-card[data-rank="A"]').getAttribute('data-zone');
  await page.locator('.farm-card[data-rank="A"] .farm-copada').click();
  await page.waitForFunction(z=>document.querySelector('.farm-card[data-rank="A"]')?.dataset.zone!==z,oldA);
  const after=await page.evaluate(([z,items])=>{const r=window.HunterFarm.rank(items,{level:12,cls:'hunter',fac:'horde',spec:'bm',pref:'bow',hubZones:'The Barrens'},{comp:'low',zoneComp:{[z]:'high'},gph:5,prof:{skin:false,herb:false,mine:false},group:false,pvp:true,n:5});return{newA:document.querySelector('.farm-card[data-rank="A"]')?.dataset.zone,pos:r.all.findIndex(e=>e.zoneKey===z)};},[oldA,scanItems()]);
  checkA('zona copada changes A',after.newA&&after.newA!==oldA&&(after.pos<0||after.pos>0),after);
  await page.reload();await ready(page);
  const persisted=await page.evaluate(z=>({zc:state.farm?.zoneComp?.[z],a:document.querySelector('.farm-card[data-rank="A"]')?.dataset.zone}),oldA);
  checkA('copada persists state.farm',persisted.zc==='high'&&persisted.a!==oldA,persisted);
  // 11 table (lvl 12): farm column, badge, farmable filter, roi sort
  await page.locator('#marketSearch').fill('2589');
  const row2589=await page.locator('tr[data-market-key="2589"]').innerText();
  checkA('table farm source + badge',/farmeable/.test(row2589)&&/Westfall|Tirisfal|Barrens|Silverpine|Loch Modan/.test(row2589),row2589.slice(0,200));
  await page.locator('#marketSearch').fill('999999');
  checkA('unknown shows no drop data',await page.locator('tr[data-market-key="999999"]').innerText().then(t=>t.includes('Sin dato de drop')));
  await page.locator('#marketFarmable').check();
  checkA('farmable filter hides 999999',await page.locator('tr[data-market-key]').count()===0);
  await page.locator('#marketFarmable').uncheck();await page.locator('#marketSearch').fill('');
  await page.locator('#marketSort').selectOption('roi');
  const rois=await page.$$eval('#marketRows tr[data-market-key]',els=>els.map(e=>parseFloat(e.dataset.roi)));
  checkA('roi sort non-increasing',rois.every((v,i)=>i===0||rois[i-1]>=v),rois);
  await page.locator('#marketSort').selectOption('price');
  // price-outlier guard: avail≤2 & price>50× vendor sell → net capped at 50× sell
  const out=await page.evaluate(([id,price,sell])=>{
    const it={itemId:id,unitPriceCopper:price,observedDay:20000,history:[{day:20000,low:price,high:price,available:1}]};
    const m=window.HunterFarm.itemMetrics(it,{level:12,cls:'hunter',fac:'horde',spec:'bm',pref:'bow'},{comp:'auto',zoneComp:{},gph:5,prof:{skin:false,herb:false,mine:false},group:false,pvp:true,n:5});
    const b=m.sources.filter(s=>s.eligible).sort((x,y)=>y.gph-x.gph)[0];
    const uncapped=b?b.K*b.u*Math.floor(price*0.95):0;
    return{doubtful:m.doubtful,bestNet:b?.net??null,gph:m.gph,ratio:uncapped?m.gph/uncapped:null,
      capNet:Math.floor(50*sell*0.95),target:50*sell/price,item:id,name:window.HunterDropData.items[String(id)]?.[0]};
  },[OUT.id,OUT_PRICE,OUT.sell]);
  checkA('outlier price capped at 50x vendor + doubtful',out.doubtful===true&&out.bestNet===out.capNet&&out.ratio!=null&&Math.abs(out.ratio-out.target)/out.target<0.01,out);
  const normD=await page.evaluate(()=>window.HunterFarm.itemMetrics({itemId:2589,unitPriceCopper:500,observedDay:20000,history:[{day:20000,low:500,high:500,available:40}]},{level:12,cls:'hunter',fac:'horde'},{prof:{skin:false}}).doubtful);
  checkA('normal item not doubtful',normD===false,normD);
  await page.locator('#marketSearch').fill(String(OUT.id));
  const outRow=await page.locator(`tr[data-market-key="${OUT.id}"]`).innerText();
  checkA('outlier row doubtful text',/precio dudoso \(≤2 ofertas, tope 50× vendedor\)/.test(outRow),outRow.slice(0,200));
  await page.locator(`tr[data-market-key="${OUT.id}"] .market-item`).click();
  const outDetail=await page.locator('#marketDetail').innerText();
  checkA('outlier detail doubtful text',/Precio dudoso/.test(outDetail),outDetail.slice(0,160));
  await page.locator('#marketSearch').fill('');
  // 10 progression + 14 skinning at lvl 20
  await page.evaluate(()=>{state.lvl=20;render();});
  const prog=await page.$$eval('#farmProgress li',els=>els.map(e=>e.textContent));
  const progLvls=prog.map(t=>{const m=t.match(/nivel (\d+)/);return m?+m[1]:0;});
  checkA('progression renders increasing levels',prog.length>=1&&progLvls.every((v,i)=>i===0||v>progLvls[i-1]),prog);
  const skinOff=await page.evaluate(()=>window.HunterFarm.itemMetrics({itemId:2318,unitPriceCopper:300,observedDay:20000,history:[{day:20000,low:300,high:300,available:null}]},{level:20,cls:'hunter',fac:'horde',spec:'bm',pref:'bow'},{comp:'auto',zoneComp:{},gph:5,prof:{skin:false,herb:false,mine:false},group:false,pvp:true,n:5}).farmable);
  checkA('2318 not farmable without skin',skinOff===false);
  const row2318off=await page.locator('tr[data-market-key="2318"]').innerText();
  checkA('2318 row shows no-farmeable reason',/No farmeable con tu ficha/.test(row2318off),row2318off.slice(0,160));
  await page.locator('#farmSkin').check();
  await page.waitForFunction(()=>document.querySelector('tr[data-market-key="2318"]')?.textContent.includes('farmeable'));
  const skinOn=await page.evaluate(()=>({farm:state.farm.prof.skin,m:window.HunterFarm.itemMetrics({itemId:2318,unitPriceCopper:300,observedDay:20000,history:[{day:20000,low:300,high:300,available:null}]},{level:20,cls:'hunter',fac:'horde',spec:'bm',pref:'bow'},state.farm).farmable}));
  checkA('2318 farmable after skin check',skinOn.farm===true&&skinOn.m===true,skinOn);
  // 14 profRecommendations: skin en lvl 20 horde → zonas con mats >0, items nombrados,
  // iLvl gate excluye tiers altos, card + badge renderizan
  const profs=await page.evaluate(items=>window.HunterFarm.profRecommendations(items,
    {level:20,cls:'hunter',fac:'horde',spec:'bm',pref:'bow',hubZones:'The Barrens'},
    {comp:'auto',zoneComp:{},gph:5,prof:{skin:true,herb:false,mine:false},group:false,pvp:true,n:5,session:2}),scanItems());
  checkA('prof recs skin returns zones',profs.length===1&&profs[0].kind==='skin'&&profs[0].zones.length>=1&&profs[0].zones.every(z=>z.gph>0&&z.items.length>0),profs.map(p=>({k:p.kind,z:p.zones.length,g:p.zones[0]?.gph})));
  const profDom=await page.locator('#farmRoot').innerText();
  checkA('prof card renders in DOM',/Por tu profesión/.test(profDom)&&/Piel/.test(profDom),profDom.match(/Por tu profesión[\s\S]{0,200}/)?.[0]);
  // badge 'tu prof': aparece exactamente en las cards cuyas zonas son top-prof
  const badgeCheck=await page.evaluate(items=>{
    const ps=window.HunterFarm.profRecommendations(items,
      {level:20,cls:'hunter',fac:'horde',spec:'bm',pref:'bow',hubZones:'The Barrens'},
      {comp:'auto',zoneComp:{},gph:5,prof:{skin:true,herb:false,mine:false},group:false,pvp:true,n:5,session:2});
    const top=new Set(ps.flatMap(p=>p.zones.map(z=>z.zoneKey)));
    const cards=[...document.querySelectorAll('.farm-card')];
    const overlap=cards.filter(c=>top.has(c.dataset.zone)).length;
    const badges=[...document.querySelectorAll('.farm-card .badge')].filter(b=>b.textContent.includes('tu prof')).length;
    return{overlap,badges,top:[...top]};
  },scanItems());
  checkA('tu prof badge matches top zones',badgeCheck.badges===badgeCheck.overlap&&badgeCheck.top.length>0,badgeCheck);
  // iLvl gate: un pj nv 20 no debe ver mats de tier alto (p.ej. iLvl>30) en las listas
  const highMat=await page.evaluate(items=>{
    const r=window.HunterFarm.profRecommendations(items,
      {level:20,cls:'hunter',fac:'horde',spec:'bm',pref:'bow'},
      {comp:'auto',zoneComp:{},gph:5,prof:{skin:true,herb:true,mine:true},group:false,pvp:true,n:5,session:2});
    const all=r.flatMap(p=>p.zones.flatMap(z=>z.items));
    const names=['Dreamfoil','Golden Sansam','Thorium Ore','Black Lotus','Felweed'];
    return{count:all.length,high:names.filter(n=>all.includes(n))};
  },scanItems());
  checkA('iLvl gate hides high-tier mats at 20',highMat.count>0&&highMat.high.length===0,highMat);
  // skin-along: las zonas de la ruta de quests del nivel — skinneá lo que otros cazan.
  // nv 28 horde hunter → Barrens / Hillsbrad / Thousand Needles (bandas 25-29 y 20-29 EK)
  const along=await page.evaluate(items=>{
    const tz=[...window.HunterFarm.trafficZones({level:28,cls:'hunter',fac:'horde'}).keys()]
      .map(k=>window.HunterFarm.index().zones[k]?.[0]);
    const st={comp:'auto',zoneComp:{},gph:5,prof:{skin:true,herb:false,mine:false},group:false,pvp:true,n:5,session:2};
    const skin=window.HunterFarm.profRecommendations(items,{level:28,cls:'hunter',fac:'horde',spec:'bm',pref:'bow'},st).find(p=>p.kind==='skin');
    const alli=window.HunterFarm.profRecommendations(items,{level:28,cls:'hunter',fac:'alliance',spec:'bm',pref:'bow'},st).find(p=>p.kind==='skin');
    const herb=window.HunterFarm.profRecommendations(items,{level:28,cls:'hunter',fac:'horde',spec:'enh',pref:'any'},{...st,prof:{skin:false,herb:true,mine:false}}).find(p=>p.kind==='herb');
    return{tz,along:skin?.along||null,alliAlong:(alli?.along||[]).length,herbAlong:(herb?.along||[]).length};
  },scanItems());
  checkA('traffic zones = quest route lvl28',along.tz.some(n=>/Barrens/.test(n))&&along.tz.some(n=>/Thousand Needles/.test(n))&&along.tz.some(n=>/Hillsbrad/.test(n)),along.tz);
  checkA('skin-along horde ranked + alliance/other-profs excluded',Array.isArray(along.along)&&along.along.length>=1&&along.along.every(z=>z.gph>0&&/\d+-\d+/.test(z.bands))&&along.alliAlong===0&&along.herbAlong===0,{along:along.along?.map(z=>({n:z.name,g:z.gph,b:z.bands})),alli:along.alliAlong,herb:along.herbAlong});
  // DOM: lvl 28 con piel tildada → sección 'Skin-along' visible
  await page.evaluate(()=>{state.lvl=28;render();});
  const alongDom=await page.locator('#farmRoot').innerText();
  checkA('skin-along section renders',/skin-along · lo que otros cazan/i.test(alongDom)&&/quests nv \d+-\d+/i.test(alongDom),alongDom.match(/skin-along[\s\S]{0,300}/i)?.[0]);
  // Sin el raspado de azeroth.wiki (no publicable) no hay coordenadas: nunca se inventan.
  const spots=await page.evaluate(()=>{
    const F=window.HunterFarm;
    return{scrape:!!window.HunterDropForever,
      heckle:F.spotCoords({id:4128,kind:'mob'},'1413'),
      objKind:F.spotCoords({id:4128,kind:'object'},'1413')};
  });
  checkA('no scraped coordinates in the public build',!spots.scrape&&spots.heckle===''&&spots.objKind==='',spots);
  // 9 risk at lvl 30
  await page.evaluate(()=>{state.lvl=30;render();});
  const risk=await page.evaluate(items=>{
    const r=window.HunterFarm.rank(items,{level:30,cls:'hunter',fac:'horde',spec:'bm',pref:'bow',hubZones:'The Barrens'},{comp:'auto',zoneComp:{},gph:5,prof:{skin:true,herb:false,mine:false},group:false,pvp:true,n:5});
    const cards=[r.A,...r.B];
    return{contested:cards.some(e=>e.risk.level==='media'&&e.reasons.join(' ').includes('facción rival')),own:cards.some(e=>e.risk.level==='baja')};
  },scanItems());
  const riskDom=await page.locator('#farmRoot').innerText();
  checkA('risk contested + own baja',risk.contested&&risk.own&&riskDom.includes('facción rival')&&/riesgo baja/.test(riskDom),{risk,dom:/riesgo baja/.test(riskDom)});
  // 12a private overlay in UI
  await page.evaluate(()=>{state.lvl=12;render();});
  const west=await page.evaluate(items=>{
    const r=window.HunterFarm.rank(items,{level:12,cls:'hunter',fac:'horde',spec:'bm',pref:'bow',hubZones:'The Barrens'},{comp:'auto',zoneComp:{},gph:5,prof:{skin:false,herb:false,mine:false},group:false,pvp:true,n:5});
    const pubMobs=new Set(window.HunterFarm.byZone('1436').mobs.filter(id=>{const m=window.HunterDropData.mobs[id];return m&&(m[3]==='rare'||m[3]==='rareelite');}));
    const w=r.all.find(e=>e.zoneKey==='1436');
    return{pub:pubMobs.size,w:w?{rareCount:w.rareCount,rareScan:w.rareScan}:null};
  },scanItems());
  const farmText=await page.locator('#farmRoot').innerText();
  checkA('rareScanner overlay counted + labelled',!!west.w&&west.w.rareCount===west.pub+1&&west.w.rareScan>=1&&farmText.includes('observado (RareScanner)'),{west,farmText:farmText.slice(-300)});
  // The malicious RareScanner name must render escaped (13468's only eligible
  // source is the synthetic rare): no <img>, no onerror, window.pwned unset.
  await page.locator('#marketSearch').fill('13468');
  const row13468=await page.locator('tr[data-market-key="13468"]').innerText();
  checkA('malicious rare name escaped in row',/Rareza observada: Rare <img/.test(row13468)&&await page.locator('tr[data-market-key="13468"] img').count()===0,row13468.slice(0,220));
  await page.locator('tr[data-market-key="13468"] button').click();
  const detailText=await page.locator('#marketDetail').innerText();
  const dom=await page.evaluate(()=>({imgs:document.querySelectorAll('#marketDetail img, #farmRoot img, #marketRows img').length,pwned:window.pwned}));
  checkA('no injected img / onerror fired',dom.imgs===0&&dom.pwned===undefined&&detailText.includes('observado (RareScanner)'),{dom,detail:detailText.slice(0,300)});
  // 15 mobile overflow (context a)
  await page.setViewportSize({width:390,height:844});
  const size=await page.evaluate(()=>({w:innerWidth,sw:document.documentElement.scrollWidth}));
  checkA('mobile 390 no overflow',size.sw<=size.w,size);
  await page.setViewportSize({width:1440,height:900});
  checkA('zero requests',A.req.n===0,A.req.n);
  checkA('zero page errors',errorsA.length===0,errorsA);
  await A.context.close();

  /* ---------- Context (b): public data only ---------- */
  const B=await newContext(null,requestsB),pb=B.page,checkB=check(results,errorsB);
  await pb.goto(url);
  await pb.locator('#tabsNav [data-t="market"]').click();await ready(pb);
  await upload(pb);
  const pubText=await pb.locator('#farmRoot').innerText();
  const pubStats=await pb.evaluate(items=>window.HunterFarm.matchStats(items).byLayer.private,scanItems());
  checkB('public build no RareScanner',!pubText.includes('RareScanner')&&pubStats===0,{pubStats,snip:pubText.slice(-200)});
  checkB('public farm still ranks',await pb.locator('.farm-card[data-rank="A"]').count()===1);
  checkB('zero requests',B.req.n===0,B.req.n);
  checkB('zero page errors',errorsB.length===0,errorsB);
  await B.context.close();
} catch(e) { if(!results.some(r=>!r.pass))results.push({name:'workflow completes',pass:false,evidence:e.message}); }
finally {
  await browser.close();
  const report={passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results,errors:[...errorsA,...errorsB],requests:requestsA.n+requestsB.n};
  if(process.env.REPORT_PATH)fs.writeFileSync(process.env.REPORT_PATH,JSON.stringify(report,null,2));
  for(const r of results)console.log(`${r.pass?'PASS':'FAIL'} ${r.name}${r.pass?'':' '+JSON.stringify(r.evidence??'')}`);
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,errors:report.errors,requests:report.requests}));
  if(report.failed||report.errors.length)process.exitCode=1;
}
