// Offline acceptance tests for Phase 2 deal detection (market-deals.js):
// badges vs median, "Mejores ofertas" sort and "Solo ofertas" filter.
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
// 5 días de historia: lows 1000×4 + último día variable; mediana 1000.
const hist5=(last)=>`h={${["2501","2502","2503","2504"].map(d=>`["${d}"]=1000`).join(',')},["2505"]=${last}}`;
const it=(key,m,last,avail=12)=>`["${key}"]={m=${m},${hist5(last)},l={},a={["2505"]=${avail}}}`;
// 9001: actual 700 vs mediana 1000 → oferta −30% (último low 700, tendencia baja)
// 9002: actual 1300 → sobreprecio +30%
// 9003: actual 1050 → estable (sin badge)
// 9004: un solo día → sin-datos (sin badge)
const fixture=Buffer.from(`AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["PvP"]={version=2,${it('9001',700,700)} ,${it('9002',1300,1000)} ,${it('9003',1050,1000)} ,["9004"]={m=700,h={["2505"]=700},l={},a={["2505"]=3}}}}`);
async function upload(){await page.locator('#marketFile').setInputFiles({name:'Auctionator.lua',mimeType:'application/octet-stream',buffer:fixture});}
async function ready(){await page.waitForFunction(()=>document.querySelector('#marketRoot')?.dataset.busy==='false');}
try {
  await page.goto(url);
  await page.locator('#tabsNav [data-t="market"]').click();await ready();
  await upload();await ready();
  check('import saved',await page.locator('#marketStatus').innerText().then(t=>t.includes('Importación guardada')));
  // Badges: oferta en 9001, caro en 9002, ninguno en 9003/9004
  const rowText=async k=>page.locator(`tr[data-market-key="${k}"]`).innerText();
  const r1=await rowText('9001'),r2=await rowText('9002'),r3=await rowText('9003'),r4=await rowText('9004');
  check('oferta badge on 9001',/oferta/.test(r1)&&/30%/.test(r1),r1.slice(0,160));
  check('pricy badge on 9002',/caro/.test(r2)&&/30%/.test(r2),r2.slice(0,160));
  check('no badge on estable 9003',!/oferta|caro/.test(r3),r3.slice(0,160));
  check('no badge on sin-datos 9004',!/oferta|caro/.test(r4),r4.slice(0,160));
  // Detalle del ítem oferta: análisis completo
  await page.locator('tr[data-market-key="9001"] button').click();
  const detail=await page.locator('#marketDetail').innerText();
  check('detail shows deal analysis',/Análisis de oferta/.test(detail)&&/bajo la mediana/.test(detail)&&/[Cc]onfianza/.test(detail),detail.slice(0,500));
  // Orden "Mejores ofertas": 9001 primero (único score positivo)
  await page.locator('#marketSort').selectOption('deals');
  const order=await page.$$eval('#marketRows tr[data-market-key]',els=>els.map(e=>e.dataset.marketKey));
  check('deals sort puts oferta first',order[0]==='9001',order);
  check('deals sort ranks estable above sobreprecio',order.indexOf('9003')<order.indexOf('9002')&&order.indexOf('9002')<order.indexOf('9004'),order);
  check('count line mentions deals sort',await page.locator('#marketCount').innerText().then(t=>t.includes('mejores ofertas')));
  // Filtro "Solo ofertas": solo queda 9001
  await page.locator('#marketDeals').check();
  const filtered=await page.$$eval('#marketRows tr[data-market-key]',els=>els.map(e=>e.dataset.marketKey));
  check('solo ofertas filter shows only 9001',filtered.length===1&&filtered[0]==='9001',filtered);
  await page.locator('#marketDeals').uncheck();
  await page.locator('#marketSort').selectOption('price');
  // Vuelta a precio: orden por unitPriceCopper descendente → 9002,9003,9004?,9001
  const prices=await page.$$eval('#marketRows tr[data-market-key]',els=>els.map(e=>e.dataset.marketKey));
  check('price sort restored',prices[0]==='9002'&&prices.includes('9001'),prices);
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
