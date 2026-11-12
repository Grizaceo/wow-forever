// One-shot local scan loading, with synthetic data only and an isolated profile.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--disable-gpu']});
const seed={id:'a'.repeat(64),snapshot:{schemaVersion:1,sourceVersion:8,importedAt:'2026-01-01T00:00:00.000Z',warnings:[],realms:[{name:'Test realm',items:[{sourceKey:'6469',itemId:6469,unitPriceCopper:13579,observedDay:2000,history:[{day:2000,low:13579,high:13579,available:3}]}]}]}};
const url=new URL('../index.html',import.meta.url).href;
let network=0,checks=0;const errors=[];
async function open(initial=null,fail=false){
 const context=await browser.newContext();
 await context.route(/^https?:/,r=>{network++;return r.abort();});
 await context.addInitScript(({seed,fail})=>{
  Object.defineProperty(window,'HunterMarketLocalScan',{get:()=>JSON.parse(localStorage.getItem('marketTestSeed')||'null')||seed});
  if(fail){const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,k){if(k==='realm')throw new DOMException('fixture','QuotaExceededError');return put.call(this,v,k);};}
 },{seed:initial,fail});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('[data-t="market"]').click();await ready(page);return {context,page};
}
async function ready(page){await page.waitForFunction(()=>document.querySelector('#marketRoot')?.dataset.busy==='false');}
async function saved(page){return page.evaluate(async()=>{
 const db=await new Promise((ok,no)=>{const r=indexedDB.open('wowhunter-market-v1',1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(Error('db'));});
 const values=await new Promise((ok,no)=>{const tx=db.transaction('market'),s=tx.objectStore('market'),out={};for(const key of ['snapshot','bundledScan'])s.get(key).onsuccess=e=>out[key]=e.target.result;tx.oncomplete=()=>ok(out);tx.onabort=()=>no(Error('abort'));});db.close();return values;
 });}
function check(name,condition){assert.ok(condition,name);checks++;console.log('PASS '+name);}
try{
 const a=await open(seed);let data=await saved(a.page);
 check('bundled snapshot committed with marker',data.snapshot?.realms[0].items[0].unitPriceCopper===13579&&data.bundledScan===seed.id);
 check('bundled price visible',(await a.page.locator('#marketRows').innerText()).includes('1g 35s 79c'));
 await a.page.reload();await ready(a.page);
 check('reload does not repeat bundled import',(await a.page.locator('#marketStatus').innerText()).includes('restaurado'));
 await a.page.locator('#marketFile').setInputFiles({name:'Auctionator.lua',mimeType:'application/octet-stream',buffer:Buffer.from('AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Test realm"]={version=2,["6469"]={m=777,h={},l={},a={}}}}')});await ready(a.page);
 await a.page.reload();await ready(a.page);data=await saved(a.page);
 check('later manual import has priority',data.snapshot?.realms[0].items[0].unitPriceCopper===777);
 a.page.once('dialog',d=>d.accept());await a.page.locator('#marketClear').click();await ready(a.page);await a.page.reload();await ready(a.page);data=await saved(a.page);
 check('clear stays clear after reload',!data.snapshot&&data.bundledScan===seed.id&&(await a.page.locator('#marketRows').innerText()).includes('Todavía no'));
 await a.context.close();
 const b=await open(null);
 await b.page.locator('#marketFile').setInputFiles({name:'Auctionator.lua',mimeType:'application/octet-stream',buffer:Buffer.from('AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Test realm"]={version=2,["6469"]={m=888,h={},l={},a={}}}}')});await ready(b.page);
 await b.page.evaluate(seed=>localStorage.setItem('marketTestSeed',JSON.stringify(seed)),seed);
 await b.page.reload();await ready(b.page);data=await saved(b.page);
 check('newer existing import is not replaced',data.snapshot?.realms[0].items[0].unitPriceCopper===888&&data.bundledScan===seed.id);
 await b.context.close();
 const c=await open(seed,true);data=await saved(c.page);
 check('aborted seed does not partially persist',!data.snapshot&&!data.bundledScan);
 await c.context.close();
 check('no network or JS errors',network===0&&errors.length===0);
 console.log(JSON.stringify({passed:checks,network,errors}));
}finally{await browser.close();}
