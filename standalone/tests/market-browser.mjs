// Offline, isolated acceptance tests for the local Auctionator workflow.
import fs from 'node:fs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--disable-gpu']});
const context = await browser.newContext({viewport:{width:1440,height:900}});
// The generic importer suite must not depend on private, preloaded prices.
await context.addInitScript(()=>Object.defineProperty(window,'HunterMarketLocalScan',{value:null,writable:false}));
let requests=0;
await context.route(/^https?:/,r=>{requests++;return r.abort();});
const page = await context.newPage();page.setDefaultTimeout(6000);
const results=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
const check=(name,pass,evidence)=>{results.push({name,pass:!!pass,evidence});if(!pass)throw new Error(name);};
const url=new URL('../index.html',import.meta.url).href;
const day=Math.floor((Date.now()-Date.UTC(2020,0,1))/86400000);
const luaItem=(price,d=day,amount='12')=>`{m=${price},h={["${d}"]=${price}},l={},a={["${d}"]=${amount}}}`;
const fixture=Buffer.from(`AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["PvP"]={version=2,["6469"]=${luaItem(12345)},["999999"]=${luaItem(99,day-10)},["6469:variant"]=${luaItem(98765)},["2581"]={m=350,h={},l={},a={}}},["Otro <b id='realm-marker'>realm</b>"]={version=2,["6469"]=${luaItem(777)}}}`);
async function upload(buffer=fixture){await page.locator('#marketFile').setInputFiles({name:'Auctionator.lua',mimeType:'application/octet-stream',buffer});}
async function ready(){await page.waitForFunction(()=>document.querySelector('#marketRoot')?.dataset.busy==='false');}
async function search(text){await page.locator('#marketSearch').fill(text);}
try {
  await page.goto(url);
  check('market tab available',await page.locator('#tabsNav [data-t="market"]').count()===1);
  await page.locator('#tabsNav [data-t="market"]').click();await ready();
  check('clear empty state',await page.locator('#marketRows').innerText().then(t=>t.includes('Todavía no')));
  await upload();await ready();
  check('Lua import succeeds',await page.locator('#marketStatus').innerText().then(t=>t.includes('Importación guardada')));
  check('realms are separate',await page.locator('#marketRealm option').count()===2);
  check('catalog is the public one generated from data/',await page.evaluate(()=>window.HunterMarketCatalog?.source?.addon==='CMaNGOS classic-db + cliente WoW Forever'&&HunterMarketCatalog.source.files.every(f=>/^[a-f0-9]{64}$/.test(f.sha256))));
  await page.locator('#marketRealm').selectOption({label:'PvP'});
  check('variants preserved',await page.locator('#marketRows tr[data-market-key]').count()===4);
  await search('6469');
  check('ID search includes variant',await page.locator('#marketRows tr[data-market-key]').count()===2);
  check('integer copper conversion',await page.locator('tr[data-market-key="6469"]').innerText().then(t=>t.includes('1g 23s 45c')));
  check('daily maximum quantity labelled honestly',await page.locator('tr[data-market-key="6469"]').innerText().then(t=>t.includes('12'))&&await page.locator('#tabContent').innerText().then(t=>t.includes('máxima oferta diaria')));
  await page.locator('tr[data-market-key="6469"] button').click();
  const detailText=await page.locator('#marketDetail').innerText();
  check('history opens',detailText.includes('Historial diario')&&detailText.toLocaleLowerCase('es').includes('máximo de mínimos'),detailText);
  await page.evaluate(()=>{window.marketCatalogBackup=window.HunterMarketCatalog;window.HunterMarketCatalog=undefined;render();});
  await page.locator('tr[data-market-key="6469"] button').click();
  check('missing catalog not attributed to an addon',await page.locator('#marketDetail').innerText().then(t=>t.includes('catálogo local no disponible')&&!t.includes('ForeverDungeonJournal')));
  await page.evaluate(()=>{window.HunterMarketCatalog=window.marketCatalogBackup;delete window.marketCatalogBackup;render();});
  const catalogProbe=await page.evaluate(()=>{
    const entry=HunterMarketCatalog.items['6469'];
    return {name:entry?.name,sources:entry?.sources.length};
  });
  check('known item linked to local source',!!catalogProbe.name&&catalogProbe.sources>0,catalogProbe);
  await search(catalogProbe.name);
  check('search by sourced name',await page.locator('#marketRows tr[data-market-key]').count()===1);
  const eligible=await page.evaluate(()=>{
    const source=HunterMarketCatalog.items['6469'].sources.find(s=>s.levelMin!==null&&s.levelMax!==null);
    if(!source)return false;
    state.lvl=source.levelMin;render();return true;
  });
  check('documented dungeon range present',eligible);
  await page.locator('#marketSources').check();
  check('level range filter keeps sourced item',await page.locator('#marketRows tr[data-market-key]').count()===1);
  await page.evaluate(()=>{state.lvl=1;render();});
  check('level range filter rejects out of range',await page.locator('#marketRows tr[data-market-key]').count()===0);
  await page.locator('#marketSources').uncheck();
  check('build link omits price data',await page.evaluate(()=>!buildLink().includes('12345')&&!Object.hasOwn(state,'market')));
  await search('999999');
  check('unknown IDs not invented',await page.locator('#marketRows').innerText().then(t=>t.includes('Ítem #999999')));
  check('old item dated per item',await page.locator('#marketRows').innerText().then(t=>t.includes('Antiguo')));
  await search('2581');
  check('undated item not renewed by import',await page.locator('#marketRows').innerText().then(t=>t.includes('Sin fecha')));
  await page.locator('#marketFresh').check();
  check('fresh filter excludes undated',await page.locator('#marketRows tr[data-market-key]').count()===0);
  await page.locator('#marketFresh').uncheck();await search('');
  await page.locator('#marketRealm').selectOption({index:1});
  check('realm selection changes price',await page.locator('#marketRows').innerText().then(t=>t.includes('7s 77c')&&!t.includes('1g 23s 45c')));
  check('realm HTML escaped',await page.locator('#realm-marker').count()===0);
  await page.reload();await ready();
  check('realm and data survive reload',await page.locator('#marketRealm').inputValue()==='1'&&await page.locator('#marketRows').innerText().then(t=>t.includes('7s 77c')));
  await upload(Buffer.from('AUCTIONATOR_PRICE_DATABASE = os.execute("bad")'));await ready();
  check('executable Lua rejected',await page.locator('#marketStatus').innerText().then(t=>t.includes('No se importó')));
  check('failure preserves last valid scan',await page.locator('#marketRows').innerText().then(t=>t.includes('7s 77c')));
  await upload(Buffer.from('AUCTIONATOR_PRICE_DATABASE={__dbversion=99}'));await ready();
  check('unsupported version rejected',await page.locator('#marketStatus').innerText().then(t=>t.includes('No se importó')));
  await page.reload();await ready();
  check('failed import did not overwrite storage',await page.locator('#marketRows').innerText().then(t=>t.includes('7s 77c')));
  // Delayed Worker makes overlap/cancel deterministic; no fabricated parser result.
  await page.evaluate(()=>{window.RealMarketWorker=window.Worker;window.Worker=class {constructor(){this.onmessage=null;}postMessage(){}terminate(){}};});
  await upload();
  await page.waitForFunction(()=>document.querySelector('#marketRoot').dataset.busy==='true');
  check('import gives immediate feedback',await page.locator('#marketStatus').innerText().then(t=>t.includes('Leyendo')));
  check('overlap rejected by disabled input',await page.locator('#marketFile').isDisabled());
  await page.locator('#marketCancel').click();await ready();
  check('cancel keeps previous data',await page.locator('#marketStatus').innerText().then(t=>t.includes('cancelada'))&&await page.locator('#marketRows').innerText().then(t=>t.includes('7s 77c')));
  await page.evaluate(()=>{window.Worker=window.RealMarketWorker;});
  await upload();await ready();
  check('cancel frees import slot',await page.locator('#marketStatus').innerText().then(t=>t.includes('Importación guardada')));
  // A real IndexedDB abort must not discard the in-memory or durable previous scan.
  await page.evaluate(()=>{window.marketPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){if(key==='realm')throw new DOMException('fixture','QuotaExceededError');return window.marketPut.call(this,value,key);};});
  await upload(Buffer.from(`AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["PvP"]={version=2,["6469"]=${luaItem(88888)}}}`));await ready();
  check('storage failure reported',await page.locator('#marketStatus').innerText().then(t=>t.includes('No se importó'))&&await page.locator('#marketRows').innerText().then(t=>t.includes('7s 77c')&&!t.includes('8g 88s 88c')));
  await page.evaluate(()=>{IDBObjectStore.prototype.put=window.marketPut;});
  await page.reload();await ready();
  const durableText=await page.locator('#marketRows').innerText();
  check('storage failure preserves durable scan',durableText.includes('7s 77c')&&!durableText.includes('8g 88s 88c')&&await page.locator('#marketRows tr[data-market-key="6469"]').count()===1,durableText);
  await page.setViewportSize({width:390,height:844});
  const size=await page.evaluate(()=>({width:innerWidth,body:document.documentElement.scrollWidth}));
  check('market mobile no page overflow',size.body<=size.width,size);
  page.once('dialog',d=>d.accept());await page.locator('#marketClear').click();await ready();
  check('clear only local market data',await page.locator('#marketRows').innerText().then(t=>t.includes('Todavía no')));
  await page.reload();await ready();
  check('clear persists',await page.locator('#marketRows').innerText().then(t=>t.includes('Todavía no')));
  check('zero network requests',requests===0,requests);
  check('zero JavaScript errors',errors.length===0,errors);
} catch(e) { if(!results.some(r=>!r.pass))results.push({name:'workflow completes',pass:false,evidence:e.message}); }
finally {
  await browser.close();
  const report={passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results,errors,requests};
  if(process.env.REPORT_PATH)fs.writeFileSync(process.env.REPORT_PATH,JSON.stringify(report,null,2));
  for(const r of results)console.log(`${r.pass?'PASS':'FAIL'} ${r.name}${r.pass?'':' '+JSON.stringify(r.evidence??'')}`);
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,errors,requests}));
  if(report.failed||errors.length)process.exitCode=1;
}
