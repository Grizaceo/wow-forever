// Isolated browser regressions. No game, launcher, user profile or network.
import fs from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = new URL('../index.html', import.meta.url).href;
const browser = await chromium.launch({ headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}), args:['--disable-gpu'] });
const context = await browser.newContext({viewport:{width:1440,height:900}});
await context.addInitScript(()=>Object.defineProperty(window,'HunterMarketLocalScan',{value:null,writable:false}));
await context.route(/^https?:/, route=>route.abort());
const page = await context.newPage();
page.setDefaultTimeout(6000);
const errors = [], results = [];
page.on('pageerror', e=>errors.push(e.message));
const check = (name, pass, evidence) => results.push({name,pass:!!pass,evidence});
async function reset(values={}) {
  await page.evaluate(values=>{document.querySelector('#simcModal').classList.remove('open');state={...blank(),...values};mq='';render();},values);
}
async function warning() { return page.locator('#tabContent').innerText().then(t=>t.includes('Tenés un arma mejor sin equipar')); }
async function openFolds() { await page.evaluate(()=>document.querySelectorAll('#mlist details').forEach(d=>d.open=true)); }
async function importText(text) {
  await page.locator('#importSimc').click();
  await page.locator('#simcText').fill(text);
  await page.locator('#simcApply').click();
}
try {
  await page.goto(url);
  await page.waitForSelector('#tabsNav button');
  check('initial render',await page.locator('#tabsNav button').count()===8);
  for(const lvl of [1,12,30,60]) {
    await reset({lvl});
    for(const tab of ['rec','route','weapons','macros','dungeons','market','extras','legacy']) {
      await page.locator(`#tabsNav [data-t="${tab}"]`).click();
      check(`tab ${tab} level ${lvl}`,(await page.locator('#tabContent').innerText()).length>0);
    }
  }
  const limits=await page.evaluate(()=>mcr().filter(m=>macroLen(m.code)>255).map(m=>m.n));
  check('macro byte limit',limits.length===0,limits);
  await reset({lvl:19,tab:'weapons'});
  await page.locator('.ownW[data-id="venomstrike"]').check();
  await page.reload();
  check('inventory persists',await page.locator('.ownW[data-id="venomstrike"]').isChecked());
  await page.locator('#tabsNav [data-t="macros"]').click();
  await page.locator('#mq').fill('Feign Death');
  check('macro search',await page.locator('#mlist .mac').count()===1);
  await reset({lvl:12,owned:['ancient']});
  check('no immediate equip advice above level',!await warning());
  await reset({lvl:60,owned:['blunderbuss'],eng:false});
  check('no immediate equip advice without engineering',!await warning());
  await reset({lvl:60,owned:['venomstrike'],customDps:1,cur:'other'});
  check('eligible owned upgrade is still recommended',await warning());
  await reset();
  await importText('hunter="Fixture"\nlevel=19\n# Venomstrike (24)\nranged=,id=6469\n# weapon_damage=ranged:10:20:2.5');
  check('equipped weapon is never an unequipped upgrade',!await warning());
  const imported=await page.evaluate(()=>({level:state.lvl,weapon:state.cur,dps:curDps()}));
  check('synthetic SimC weapon import',imported.level===19&&imported.weapon==='venomstrike'&&imported.dps===6,imported);
  await page.evaluate(()=>{state.owned=[];render();});
  check('equipped weapon not recommended to obtain even if unchecked',!(await page.locator('.weapline .weapname').allTextContents()).includes('Venomstrike'));
  check('equipped weapon excludes Kalimdor priority card',!(await page.locator('#tabContent').innerText()).includes('Objetivo #1: Venomstrike'));
  await reset({lvl:19,realm:'ek',cur:'venomstrike',owned:[]});
  check('equipped weapon excludes EK travel card',!(await page.locator('#tabContent').innerText()).includes('viaje por Venomstrike'));
  await reset({lvl:19,tab:'dungeons'});
  await page.locator('.ownG[data-id="d1|Venomstrike"]').check();
  await page.locator('#tabsNav [data-t="weapons"]').click();
  check('dungeon weapon is marked in weapons',await page.locator('.ownW[data-id="venomstrike"]').isChecked());
  await page.locator('#tabsNav [data-t="rec"]').click();
  check('obtained dungeon weapon not recommended to obtain',!(await page.locator('.weapline .weapname').allTextContents()).includes('Venomstrike'));
  await page.locator('#tabsNav [data-t="weapons"]').click();
  await page.locator('.ownW[data-id="venomstrike"]').uncheck();
  await page.locator('#tabsNav [data-t="dungeons"]').click();
  check('unchecking weapon clears dungeon ownership',!await page.locator('.ownG[data-id="d1|Venomstrike"]').isChecked());
  await page.locator('#tabsNav [data-t="weapons"]').click();
  await page.locator('.ownW[data-id="venomstrike"]').check();
  await page.locator('#tabsNav [data-t="dungeons"]').click();
  check('checking weapon marks dungeon ownership',await page.locator('.ownG[data-id="d1|Venomstrike"]').isChecked());
  await page.locator('.ownG[data-id="d1|Venomstrike"]').uncheck();
  await page.locator('#tabsNav [data-t="weapons"]').click();
  check('unchecking dungeon clears weapon ownership',!await page.locator('.ownW[data-id="venomstrike"]').isChecked());
  await reset({lvl:60,spec:'sv',tab:'macros'});
  await openFolds();
  const macro=await page.locator('.mac').filter({hasText:'Bestial Wrath + pet'}).innerText();
  check('other spec macro not labelled usable',!macro.includes('usable ya'),macro);
  await reset({lvl:60,spec:'bm',tab:'macros'});
  await openFolds();
  check('compatible spec macro labelled usable',(await page.locator('.mac').filter({hasText:'Bestial Wrath + pet'}).innerText()).includes('usable ya'));
  await reset();
  await importText('hunter="Fixture"\nlevel=19\npet_family=raptor\npet_level=<b id="level-marker">html</b>\npet_happiness=<b id="happy-marker">html</b>');
  check('pet level HTML is text',await page.locator('#level-marker').count()===0);
  check('pet happiness HTML is text',await page.locator('#happy-marker').count()===0);
  await reset();
  await importText('pet_family=raptor\npet_level=19');
  check('pet-only export accepted',!await page.locator('#simcModal').evaluate(e=>e.classList.contains('open')));
  await reset();
  await importText('hunter="Fixture"\nlevel=28\nrace=troll\nserver=camwow_us1_pvp\nprofessions=skinning=200\n# Barbarian War Axe (28)\nmain_hand=,id=3201\n# Venomstrike (24)\nranged=,id=6469\n# character_stats=health:700/mana:1600/strength:50/agility:90/stamina:58/intellect:85/spirit:72\n# weapon_damage=mainhand:90:110:3.3/ranged:76:94:2.18');
  const sv=await page.evaluate(()=>({mh:state.simc.slots.main_hand,rng:state.simc.slots.ranged,prof:state.simc.professions,v:simcVitals(),real:!!document.querySelector('.ficha-real')}));
  check('simc weapon ranges per slot',sv.mh.range.min===90&&sv.mh.range.mx===110&&sv.mh.range.spd===3.3&&sv.rng.range.min===76,sv.mh.range);
  check('simc professions parsed',sv.prof.length===1&&sv.prof[0][0]==='skinning'&&sv.prof[0][1]===200,sv.prof);
  check('simc vitals feed ficha real strip',sv.v&&sv.v.hp===700&&sv.v.powers[0][1]===1600&&sv.v.attrs.length===5&&sv.real,{hp:sv.v&&sv.v.hp,real:sv.real});
  await reset();
  check('procedural portrait renders',await page.locator('.ficha-portrait > svg').count()===1&&await page.locator('.ficha-portrait img').count()===0);
  const psvg=await page.locator('.ficha-portrait > svg').innerHTML();
  await reset({cls:'warrior'});
  const wsvg=await page.locator('.ficha-portrait > svg').innerHTML();
  check('portrait gear changes with class',psvg!==wsvg&&wsvg.includes('C30 26 24 14'),wsvg.length);
  await reset({cls:'shaman'});
  const ssvg=await page.locator('.ficha-portrait > svg').innerHTML();
  check('shaman antler gear renders',ssvg.includes('C38 26 36 16 40 6'));
  await reset({cls:'warrior',fac:'alliance'});
  check('portrait faction tint changes',await page.locator('.ficha-portrait > svg').innerHTML()!==wsvg);
  await reset({tab:'rec'});
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
  const [fc]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#avatarUp').click()]);
  await fc.setFiles({name:'shot.png',mimeType:'image/png',buffer:png});
  await page.waitForTimeout(300);
  const av=await page.evaluate(()=>({img:!!document.querySelector('.ficha-portrait img'),avatar:(state.avatar||'').slice(0,22),inBuild:(JSON.parse(localStorage.getItem('wowhunter-build-v2')).avatar||'').slice(0,22),oldKey:localStorage.getItem('wf-avatar-v1')}));
  check('uploaded portrait replaces procedural',av.img&&av.avatar.startsWith('data:image/')&&av.inBuild.startsWith('data:image/')&&av.oldKey===null,av);
  check('portrait not in share link',await page.evaluate(()=>{const l=buildLink();return !l.includes('data:image')&&!l.includes('avatar');}));
  await page.reload(); await page.waitForSelector('#tabsNav button');
  check('portrait persists across reload',await page.locator('.ficha-portrait img').count()===1);
  await page.locator('#avatarDel').click();
  await page.waitForTimeout(200);
  check('reset restores procedural portrait',await page.locator('.ficha-portrait > svg').count()===1&&await page.locator('.ficha-portrait img').count()===0&&await page.evaluate(()=>state.avatar===null));
  await reset({lvl:23,cur:'other',customDps:19.7,eng:false,owned:['venomstrike'],gear:['d1|Venomstrike'],steps:['10|0'],name:'Fixture',tab:'route'});
  const link=await page.evaluate(()=>buildLink());
  const fresh=await context.newPage();
  // Same-origin localStorage deliberately conflicts: a snapshot must replace it.
  await fresh.goto(url);
  await fresh.evaluate(()=>{state={...blank(),eng:true,owned:['ancient'],gear:['d0|Old'],steps:['other']};save();});
  await fresh.goto('about:blank');
  await fresh.goto(link);
  const restored=await fresh.evaluate(()=>({lvl:state.lvl,cur:state.cur,customDps:state.customDps,eng:state.eng,owned:state.owned,gear:state.gear,steps:state.steps,name:state.name,tab:state.tab}));
  check('link preserves custom DPS',restored.customDps===19.7,restored);
  check('link restores visible custom DPS',await fresh.locator('#customDps').inputValue()==='19.7');
  await fresh.locator('#customDps').fill('');
  await fresh.locator('#customDps').pressSequentially('21.5');
  await fresh.locator('#customDps').press('Tab');
  const manualDps=await fresh.evaluate(()=>({value:document.querySelector('#customDps').value,dps:state.customDps,focused:document.activeElement.id}));
  check('manual DPS supports typing decimals',manualDps.value==='21.5'&&manualDps.dps===21.5,manualDps);
  check('link explicitly restores engineering off',restored.eng===false);
  check('link restores inventory exactly',JSON.stringify(restored.owned)==='["venomstrike"]');
  check('link restores dungeon progress',JSON.stringify(restored.gear)==='["d1|Venomstrike"]');
  check('link restores route progress',JSON.stringify(restored.steps)==='["10|0"]');
  check('link restores build and page',restored.lvl===23&&restored.cur==='other'&&restored.name==='Fixture'&&restored.tab==='route');
  await fresh.evaluate(()=>{state.lvl=24;state.steps=[];save();});
  await fresh.reload();
  check('link import does not overwrite later progress on reload',await fresh.evaluate(()=>state.lvl===24&&state.steps.length===0));
  await fresh.close();
  await reset({cur:'venomstrike'});
  await importText('hunter="Fixture"\nlevel=19\n# Venomstrike (24)\nranged=,id=6469\n# weapon_damage=ranged:10:20:2.5');
  const equippedLink=await page.evaluate(()=>buildLink());
  const clean=await browser.newContext();await clean.route(/^https?:/,r=>r.abort());
  const importedPage=await clean.newPage();await importedPage.goto(equippedLink);
  check('link preserves imported weapon DPS',(await importedPage.evaluate(()=>curDps()))===6);
  await clean.close();
  for(const lvl of ['abc','Infinity','-10','999','']) {
    const p=await context.newPage();await p.goto(url+'#lvl='+lvl);
    const value=await p.evaluate(()=>state.lvl);
    check('invalid URL level '+JSON.stringify(lvl),Number.isFinite(value)&&value>=1&&value<=60,value);
    await p.close();
  }
  await page.evaluate(()=>{localStorage.setItem(KEY,JSON.stringify({...blank(),lvl:'broken',owned:null,gear:{},steps:1}));});
  await page.reload();
  check('malformed saved state normalized',await page.evaluate(()=>Number.isFinite(state.lvl)&&Array.isArray(state.owned)&&Array.isArray(state.gear)&&Array.isArray(state.steps)));
  await page.evaluate(()=>{localStorage.setItem(KEY,JSON.stringify({...blank(),lvl:19,gear:['d1|Venomstrike'],owned:[]}));});
  await page.reload();
  check('existing dungeon-only inventory migrated',await page.evaluate(()=>ownedSet().has('venomstrike')));
  await page.evaluate(()=>{localStorage.setItem(KEY,JSON.stringify({...blank(),tab:'weapons',wf:'bogus'}));});
  await page.reload();
  check('invalid weapon filter restored to all',await page.evaluate(()=>state.wf==='all')&&await page.locator('tr[data-row]').count()>0);
  await reset({lvl:20,tab:'legacy'});
  const legLow=await page.locator('#tabContent').innerText();
  check('legacy shows locked pane below 25',legLow.includes('nivel 25')&&legLow.includes('Bountiful Harvest')&&legLow.includes('Scarce'));
  await reset({lvl:28,tab:'legacy',farm:{prof:{skin:true,herb:false,mine:false}}});
  const legMid=await page.locator('#tabContent').innerText();
  check('legacy gathering track for skinning char',legMid.includes('Pristine Leather')&&legMid.includes('Pristine Hide')&&legMid.includes('tu Skinning suma')&&legMid.includes('Bountiful Harvest'));
  check('legacy does not promise gathering points',!legMid.includes('puntos por hierba')&&!/herb.*\d+\s*(pts|puntos)/i.test(legMid));
  check('legacy perk cost is 1 point per rank',/rango cuesta.{0,20}1 punto/.test(legMid));
  check('legacy Talented has 5 ranks',await page.evaluate(()=>window.GUIDE_LEGACY.perks.adv.perks.find(p=>p.n==='Talented').r===5));
  const legMidAll=await page.locator('#tabContent').evaluate(el=>el.textContent);
  check('legacy Spelunker lists real dungeons',legMidAll.includes('Ragefire Chasm')&&legMidAll.includes('Shadowfang Keep')&&legMidAll.includes('Scarlet Monastery')&&legMidAll.includes("Shaper's Terrace"));
  check('legacy scarce level rule shown',legMid.includes('≤25')&&legMid.includes('tier 2'));
  await page.setViewportSize({width:390,height:844});
  for(const tab of ['rec','route','weapons','macros','dungeons','market','extras','legacy']) {
    await reset({lvl:60,tab});
    const size=await page.evaluate(()=>({width:innerWidth,body:document.documentElement.scrollWidth}));
    check('mobile no page overflow '+tab,size.body<=size.width,size);
  }
  check('no JavaScript errors',errors.length===0,errors);
} finally {
  await context.close();await browser.close();
  const report={passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results,errors,notes:'Isolated context; synthetic game exports; HTTP(S) blocked.'};
  if(process.env.REPORT_PATH) fs.writeFileSync(process.env.REPORT_PATH,JSON.stringify(report,null,2));
  for(const r of results) console.log(`${r.pass?'PASS':'FAIL'} ${r.name}${r.pass?'':' '+JSON.stringify(r.evidence??'')}`);
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,errors}));
  if(report.failed||errors.length) process.exitCode=1;
}
