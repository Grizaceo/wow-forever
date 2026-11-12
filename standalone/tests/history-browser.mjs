// Offline accumulation checks: two imports on different days must merge into
// one growing history series, persist it, and keep store-only items' days.
import fs from 'node:fs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--disable-gpu']});
const context = await browser.newContext({viewport:{width:1440,height:900}});
await context.addInitScript(()=>Object.defineProperty(window,'HunterMarketLocalScan',{value:null,writable:false}));
let requests=0;
await context.route(/^https?:/,r=>{requests++;return r.abort();});
const page = await context.newPage();page.setDefaultTimeout(6000);
const results=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
const check=(name,pass,evidence)=>{results.push({name,pass:!!pass,evidence});if(!pass)throw new Error(name);};
const url=new URL('../index.html',import.meta.url).href;
const lua=(entries)=>`AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["PvP"]={version=2,${entries}}}`;
const it=(key,price,day,qty)=>`["${key}"]={m=${price},h={["${day}"]=${price}},l={},a={["${day}"]=${qty}}}`;
const fixtureA=Buffer.from(lua(it('6469',1000,2504,5)+','+it('111',500,2504,3)));
const fixtureB=Buffer.from(lua(it('6469',900,2505,7)));
async function upload(buffer){await page.locator('#marketFile').setInputFiles({name:'Auctionator.lua',mimeType:'application/octet-stream',buffer});}
async function ready(){await page.waitForFunction(()=>document.querySelector('#marketRoot')?.dataset.busy==='false');}
async function idbKeys(){return page.evaluate(async()=>{
  const db=await new Promise((ok,no)=>{const r=indexedDB.open('wowhunter-market-v1',1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(Error('db'));});
  const keys=await new Promise((ok,no)=>{const tx=db.transaction('market'),s=tx.objectStore('market'),q=s.getAllKeys();q.onsuccess=()=>ok(q.result);q.onerror=()=>no(Error('keys'));});
  const out={};
  for(const k of ['snapshot','history']){const v=await new Promise((ok,no)=>{const tx=db.transaction('market'),q=tx.objectStore('market').get(k);q.onsuccess=e=>ok(e.target.result);q.onerror=()=>no(Error(k));});out[k]=v;}
  db.close();return{keys,out};
});}
try {
  await page.goto(url);
  await page.locator('#tabsNav [data-t="market"]').click();await ready();
  await upload(fixtureA);await ready();
  check('first import saved',await page.locator('#marketStatus').innerText().then(t=>t.includes('Importación guardada')));
  await upload(fixtureB);await ready();
  check('second import saved',await page.locator('#marketStatus').innerText().then(t=>t.includes('Importación guardada')));
  // View = latest snapshot only: item 111 is gone, 6469 shows newest price.
  check('view shows only latest import items',await page.locator('#marketRows tr[data-market-key]').count()===1);
  check('newest price wins',await page.locator('#marketRows').innerText().then(t=>t.includes('9s')&&!t.includes('10s')));
  await page.locator('tr[data-market-key="6469"] button').click();
  const detail=await page.locator('#marketDetail').innerText();
  check('detail shows accumulated stats',detail.includes('Historial acumulado')&&detail.includes('2 días de muestra'),detail.slice(0,400));
  check('detail history table has both days',(detail.match(/20\d\d-\d\d-\d\d/g)||[]).length>=2);
  check('detail shows price chart',await page.locator('#marketDetail .market-chart svg.mchart').count()===1&&await page.locator('#marketDetail .market-chart svg text').count()>=2);
  check('aside reports accumulated days',await page.locator('#auctionStatus').innerText().then(t=>t.includes('historial 2 días')));
  const stored=await idbKeys();
  check('history key persisted',stored.keys.includes('history'));
  const rows6469=stored.out.history?.realms?.PvP?.items?.['6469'];
  check('store has both days for 6469',Array.isArray(rows6469)&&rows6469.length===2&&rows6469[0][0]===2504&&rows6469[1][0]===2505,JSON.stringify(rows6469));
  check('store keeps day for item absent from latest scan',Array.isArray(stored.out.history?.realms?.PvP?.items?.['111'])&&stored.out.history.realms.PvP.items['111'].length===1);
  check('persisted snapshot stays small (recent window)',JSON.stringify(stored.out.snapshot).length<200000);
  await page.reload();await ready();
  await page.locator('tr[data-market-key="6469"] button').click();
  check('history survives reload',await page.locator('#marketDetail').innerText().then(t=>t.includes('2 días de muestra')));
  check('status survives reload',await page.locator('#auctionStatus').innerText().then(t=>t.includes('historial 2 días')));
  // Re-import the same first fixture: its day must not duplicate.
  await upload(fixtureA);await ready();
  const again=await idbKeys();
  check('re-import is idempotent per day',again.out.history?.realms?.PvP?.items?.['6469']?.length===2);
  page.once('dialog',d=>d.accept());await page.locator('#marketClear').click();await ready();
  const cleared=await idbKeys();
  check('clear wipes history too',!cleared.keys.includes('history')&&!cleared.out.snapshot);
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
