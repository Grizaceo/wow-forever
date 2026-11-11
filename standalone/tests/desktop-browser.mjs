// Real React component + real opaque iframe. SDK storage/file boundary is the
// test double; the installed Electron SDK is exercised separately.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(process.env.DESKTOP_PACKAGE||path.join(process.env.HOME,'.hermes/hermes-agent/apps/desktop/package.json'));
const {build}=require('esbuild');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(new URL('..',import.meta.url).pathname);
const plugin=process.env.DESKTOP_PLUGIN||path.join(root,'..','desktop','plugin.js');
const mock=`export const definePlugin=p=>p;export const ROUTES_AREA='routes',SIDEBAR_NAV_AREA='nav',PALETTE_AREA='palette';export const host={navigate:()=>{}};`;
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import plugin from ${JSON.stringify(plugin)};
window.registered=[];window.fileMap={};window.clipboard='';window.failWrite=false;
window.diskDirs={'/home/u':[]};window.diskFiles={};
const mkfile=(segs,content)=>{let p='/home/u';for(const s of segs){const q=p+'/'+s;(window.diskDirs[p]=window.diskDirs[p]||[]).push({name:s,path:q,isDirectory:true});window.diskDirs[q]=window.diskDirs[q]||[];p=q;}window.diskDirs[p].push({name:'Auctionator.lua',path:p+'/Auctionator.lua',isDirectory:false});window.diskFiles[p+'/Auctionator.lua']=content;};
mkfile(['Games','battlenet','drive_c','Program Files (x86)','World of Warcraft','_forever_','WTF','Account','1','SavedVariables'],'AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Disk realm"]={version=2,["9999"]={m=999,h={},l={},a={}}}}');
mkfile(['Games','battlenet','drive_c','Program Files (x86)','World of Warcraft','_forever_','WTF','Account','1','91','Grizaceo-Cl','SavedVariables'],'AUCTIONATOR_CHARACTER_CONFIG = nil');
mkfile(['Documents','backup','SavedVariables'],'x'.repeat(4000));
const GRANT='/home/u/Games/battlenet/drive_c/Program Files (x86)/World of Warcraft/_forever_/WTF/Account/1';
window.granted=[];window.reads=[];window.pickCount=0;
const inGrant=rel=>GRANT+(rel?'/'+rel:'');
const filesDoor={
 folders:async()=>window.granted.slice(),
 requestFolder:async()=>{window.pickCount++;const folder={id:'g1',name:'1',path:GRANT};window.granted=[folder];return {ok:true,folder};},
 list:async(id,rel)=>{if(id!=='g1')return {ok:false,error:'not-granted'};const d=window.diskDirs[inGrant(rel)];return d?{ok:true,entries:d.map(e=>({name:e.name,path:e.path.slice(GRANT.length+1),isDirectory:e.isDirectory})),truncated:false}:{ok:false,error:'not-found'};},
 readDataUrl:async()=>({ok:false,error:'not-found'}),
};
const ctx={registerMany:v=>window.registered.push(...v),os:{writeClipboard:async text=>{window.copied=text;return true;}},storage:{get:(k,f=null)=>JSON.parse(localStorage.getItem('hunter-test-'+k)||'null')??f,set:(k,v)=>localStorage.setItem('hunter-test-'+k,JSON.stringify(v)),remove:k=>localStorage.removeItem('hunter-test-'+k)},files:{...filesDoor,
 writeText:async(r,k,text)=>{if(window.failWrite)return {ok:false};localStorage.setItem('hunter-file-'+k,text);window.fileMap[k]=text;return {ok:true};},
 readText:async(r,k)=>{if(r==='g1'){window.reads.push(inGrant(k));const t=window.diskFiles[inGrant(k)];return t===undefined?{ok:false,error:'not-found'}:{ok:true,text:t,size:t.length};}if(r!=='data')return {ok:false,error:'not-granted'};const text=localStorage.getItem('hunter-file-'+k);return text===null?{ok:false}:{ok:true,text};}
}};plugin.register(ctx);window.root=createRoot(document.getElementById('root'));window.mount=()=>root.render(window.registered.find(v=>v.area==='routes').render());mount();`;
const bundle=await build({stdin:{contents:entry,resolveDir:root,loader:'js'},bundle:true,format:'iife',write:false,nodePaths:[path.dirname(require.resolve('react/package.json'))+'/..'],plugins:[{name:'sdk-test',setup(b){b.onResolve({filter:/^@hermes\/plugin-sdk$/},()=>({path:'sdk-test',namespace:'sdk'}));b.onLoad({filter:/.*/,namespace:'sdk'},()=>({contents:mock}));}}]});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--disable-gpu']});
let checks=0,network=0;const errors=[];const check=(name,yes)=>{assert(yes,name);checks++;console.log('PASS '+name);};
const context=await browser.newContext({viewport:{width:1600,height:1000}});
await context.route('http://localhost/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body style="margin:0"><div id="root" style="height:100vh"></div></body></html>'}));
await context.route(/^https?:\/\/(?!localhost)/,r=>{network++;return r.abort();});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
async function load(){await page.goto('http://localhost/');await page.addScriptTag({content:bundle.outputFiles[0].text});await page.locator('iframe').waitFor();const frame=page.frames().find(f=>f.parentFrame());await frame.waitForSelector('#tabsNav');return frame;}
async function ready(frame){await frame.waitForFunction(()=>document.querySelector('#marketRoot')?.dataset.busy==='false');}
async function marketState(){return page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('hunter-test-market-pointer')||'null');return p?JSON.parse(localStorage.getItem('hunter-file-market-'+p.slot+'.json')).values:null;});}
async function priceHistory(){return page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('hunter-test-price-history-pointer')||'null');return p?JSON.parse(localStorage.getItem('hunter-file-price-history-'+p.slot+'.json')).store:null;});}
try{
 let frame=await load();
 check('SDK sidebar, route and palette registered',await page.evaluate(()=>registered.some(v=>v.area==='nav'&&v.data.label==='WoW Forever')&&registered.some(v=>v.area==='palette')));
 check('opaque sandbox, no same-origin privilege',await page.locator('iframe').getAttribute('sandbox')==='allow-scripts'&&await frame.evaluate(()=>{try{return !parent.document;}catch{return true;}}));
 await frame.locator('[data-t="market"]').click();await ready(frame);
 check('public build ships no bundled scan',!(await marketState())?.snapshot&&await frame.evaluate(()=>!window.HunterMarketLocalScan&&!window.HunterMarketCatalog&&!window.HunterDropForever));
 await frame.locator('#lvlNum').fill('23');await frame.locator('#lvlNum').dispatchEvent('change');
 await frame.waitForFunction(()=>document.querySelector('#hermesSaveStatus')?.textContent.includes('guardado'));
 frame=await load();check('build persists after host reload',await frame.locator('#lvlNum').inputValue()==='23');await ready(frame);
  await frame.locator('#marketFile').setInputFiles({name:'Auctionator.lua',mimeType:'application/octet-stream',buffer:Buffer.from('AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Test realm"]={version=2,["6469"]={m=777,h={["2001"]=777},l={},a={["2001"]=4}}}}')});await ready(frame);
 check('parser worker import crosses durable bridge',(await marketState()).snapshot.realms[0].items[0].unitPriceCopper===777);
 const hist1=await priceHistory();
 check('manual import accumulates into price-history',(hist1?.realms?.['Test realm']?.items?.['6469']||[]).some(r=>r[0]===2001));
 frame=await load();await ready(frame);check('manual scan persists after host reload',(await marketState()).snapshot.realms[0].items[0].unitPriceCopper===777);
 await page.evaluate(()=>window.failWrite=true);
 await frame.locator('#marketFile').setInputFiles({name:'Auctionator.lua',mimeType:'application/octet-stream',buffer:Buffer.from('AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Test realm"]={version=2,["6469"]={m=888,h={},l={},a={}}}}')});await ready(frame);
 check('failed host write preserves last scan',(await marketState()).snapshot.realms[0].items[0].unitPriceCopper===777&&(await frame.locator('#marketRows').innerText()).includes('7s 77c'));
 frame=await load();await ready(frame);
 await frame.locator('#marketClear').click();await frame.getByRole('button',{name:'Cancelar',exact:true}).click();check('cancel deletion keeps scan',!!(await marketState()).snapshot);
 await frame.locator('#marketClear').click();await frame.getByRole('button',{name:'Confirmar',exact:true}).click();await ready(frame);
 frame=await load();await ready(frame);check('delete remains clear',!(await marketState()).snapshot);
 check('clear empties price-history too',Object.keys((await priceHistory())?.realms||{}).length===0);
 await frame.locator('#marketDisk').click();
 await frame.waitForFunction(()=>document.querySelector('#marketStatus')?.textContent.includes('carpeta concedida'),{timeout:15000});
 check('granted-folder import crosses durable bridge',(await marketState()).snapshot.realms[0].items[0].unitPriceCopper===999);
 check('only files inside the grant are read',await page.evaluate(()=>reads.length>0&&reads.every(p=>p.startsWith('/home/u/Games/')&&p.includes('/WTF/Account/1'))&&!reads.some(p=>p.includes('Documents'))));
 await frame.locator('#marketDisk').click();
 await frame.waitForFunction(()=>document.querySelector('#marketStatus')?.textContent.includes('carpeta concedida'),{timeout:15000});
 check('second read reuses the remembered grant, no new picker',await page.evaluate(()=>pickCount===1));
 await frame.locator('#copyLink').click();await page.waitForFunction(()=>typeof copied==='string');
 check('share link never leaks embedded prices',await page.evaluate(()=>copied.startsWith('wow-forever:')&&!copied.includes('HunterMarket')&&copied.length<10000));
 const before=await page.evaluate(()=>localStorage.getItem('hunter-test-build'));
 await page.evaluate(()=>window.postMessage({channel:'wow-hunter-guide/v1',nonce:'forged',id:999,op:'build',value:'{"lvl":60}'},'*'));
 await page.waitForTimeout(60);check('forged source/nonce rejected',await page.evaluate(()=>localStorage.getItem('hunter-test-build'))===before);
 check('no outgoing network or uncaught JS errors',network===0&&errors.length===0);
 if(process.env.DESKTOP_SCREENSHOT)await page.screenshot({path:process.env.DESKTOP_SCREENSHOT});
 console.log(JSON.stringify({suite:'desktop iframe integration',checks,network,errors,result:'PASS'}));
}catch(e){console.error(JSON.stringify({errors}));throw e;}finally{await browser.close();}
