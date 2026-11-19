// Chromium + plugin generado, datos sintéticos del diario WoWForeverBridge.
// Verifica el panel del puente, la fusión append en la UI real y que la poda
// de Auctionator no borra los días ya capturados. Nunca lee archivos del juego.
import { iniciar, PERFILES, PREF } from './arnes.mjs'

const a = await iniciar()
const { check } = a
const SV = 'WTF/Account/SYNTHETIC/SavedVariables/'
const journal = entries => {
  const item = it => `{d=${it.d},m=${it.m},hi=${it.hi},lo=${it.lo}${it.av != null ? `,av=${it.av}` : ''}}`
  const es = Object.entries(entries).map(([day, e]) => `[${day}]={day=${day},at=${e.at},realm="PvP",items={${Object.entries(e.items).map(([k, it]) => `[${JSON.stringify(k)}]=${item(it)}`).join(',')}}}`).join(',')
  return `WoWForeverBridgeDB={version=1,retentionDays=14,entries={${es}}}`
}
const dia = (day, at, price, hi, lo, av) => ({ day, at, realm: 'PvP', items: { '2589': { d: day, m: price, hi, lo, av } } })
const j2 = journal({ 2500: dia(2500, 1763200000, 140, 150, 120, 5), 2501: dia(2501, 1763300000, 135, 160, 110, 9) })
const j3 = journal({ 2500: dia(2500, 1763200000, 140, 150, 120, 5), 2501: dia(2501, 1763300000, 135, 160, 110, 9), 2502: dia(2502, 1763400000, 125, 165, 105, 8) })
const auction = 'AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["PvP"]={version=2,["2589"]={m=140,h={["2500"]=150},l={["2500"]=120},a={["2500"]=5}}}}'
const auctionPodado = 'AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["PvP"]={version=2,["2589"]={m=90,h={["2502"]=95},l={["2502"]=90},a={["2502"]=3}}}}'
const diasHistorial = pref => {
  const ptr = JSON.parse(localStorage.getItem(pref + 'market-v2-pointer') || 'null')
  if (!ptr) return []
  const bundle = JSON.parse(localStorage.getItem('archivo.market-v2-' + ptr.slot + '.json'))
  const store = bundle.history
  const realms = store.v === 2 ? Object.values(store.scopes)[0].realms : store.realms
  return (realms.PvP.items['2589'] || []).map(r => r[0])
}
const precioActual = pref => {
  const ptr = JSON.parse(localStorage.getItem(pref + 'market-v2-pointer') || 'null')
  if (!ptr) return null
  const bundle = JSON.parse(localStorage.getItem('archivo.market-v2-' + ptr.slot + '.json'))
  return bundle.market.snapshot.realms[0].items[0].unitPriceCopper
}

let saved
for (const theme of ['claro', 'oscuro']) {
  const { p, cerrar } = await a.abrir(theme, { perfil: PERFILES.cazadorHorda })
  await p.click('[data-tab="mercado"]')
  const panel = p.locator('[data-testid="bridge-panel"]')
  await panel.waitFor()
  check(theme + ': panel del puente visible con toggle', await panel.getByRole('checkbox').count() === 1)
  await p.evaluate(({ j, au, sv }) => {
    window.carpetaConcedida = { name: 'SavedVariables', files: {
      [sv + 'WoWForeverBridge.lua']: j,
      [sv + 'Auctionator.lua']: au,
      'WTF/Config.wtf': 'MUST_NOT_READ',
    } }
  }, { j: j2, au: auction, sv: SV })
  await p.getByRole('button', { name: 'Leer Auctionator.lua', exact: true }).click()
  await p.waitForFunction(() => window.selectorAbierto === 1)
  await p.evaluate(() => window.sondeos.forEach(t => t.fn()))
  await panel.locator('[data-testid="bridge-status"]').filter({ hasText: '2 día(s)' }).waitFor()
  check(theme + ': el sondeo fusiona el diario (2 días)', await panel.locator('[data-testid="bridge-status"]').innerText().then(t => t.includes('2 día(s)') && t.includes('último día del diario 2501')))
  check(theme + ': ubicación del diario recordada', await p.evaluate(pref => JSON.parse(localStorage.getItem(pref + 'bridge-location')).path.endsWith('WoWForeverBridge.lua'), PREF))
  check(theme + ': privacidad, nunca Config.wtf ni .bak', await p.evaluate(() => window.lecturas.every(x => !x.endsWith('Config.wtf') && !x.endsWith('.bak'))))
  check(theme + ': histórico con ambos días', await p.evaluate(diasHistorial, PREF).then(d => JSON.stringify(d) === '[2500,2501]'))

  // Llega un día nuevo por el diario.
  await p.evaluate(({ j, sv }) => { window.carpetaConcedida.files[sv + 'WoWForeverBridge.lua'] = j }, { j: j3, sv: SV })
  await p.evaluate(() => window.sondeos.forEach(t => t.fn()))
  await panel.locator('[data-testid="bridge-status"]').filter({ hasText: '3 día(s)' }).waitFor()
  check(theme + ': día nuevo añadido sin perder los anteriores', await p.evaluate(diasHistorial, PREF).then(d => JSON.stringify(d) === '[2500,2501,2502]'))

  // Auctionator poda su archivo: el histórico capturado por el puente sobrevive.
  await p.evaluate(({ au, sv }) => { window.carpetaConcedida.files[sv + 'Auctionator.lua'] = au }, { au: auctionPodado, sv: SV })
  await p.evaluate(() => window.sondeos.forEach(t => t.fn()))
  await p.waitForFunction(pref => {
    const ptr = JSON.parse(localStorage.getItem(pref + 'market-v2-pointer') || 'null')
    if (!ptr) return false
    const b = JSON.parse(localStorage.getItem('archivo.market-v2-' + ptr.slot + '.json'))
    return b.market.snapshot.realms[0].items[0].unitPriceCopper === 90
  }, PREF)
  check(theme + ': la poda de Auctionator no borra días del puente', await p.evaluate(diasHistorial, PREF).then(d => JSON.stringify(d) === '[2500,2501,2502]'))

  // Pausar / reanudar desde el toggle.
  await panel.getByRole('checkbox').click()
  await p.waitForFunction(pref => JSON.parse(localStorage.getItem(pref + 'bridge-auto')) === false, PREF)
  await p.evaluate(() => window.sondeos.forEach(t => t.fn()))
  await panel.locator('[data-testid="bridge-status"]').filter({ hasText: 'paused' }).waitFor()
  check(theme + ': pausado persiste y el sondeo no importa', true)
  await panel.getByRole('checkbox').click()
  await p.waitForFunction(pref => JSON.parse(localStorage.getItem(pref + 'bridge-auto')) === true, PREF)
  if (theme === 'claro') saved = await p.evaluate(() => Object.fromEntries([...Array(localStorage.length)].map((_, i) => { const k = localStorage.key(i); return [k, localStorage.getItem(k)] })))
  await cerrar()
}

// Sesión nueva: el puente y el histórico se restauran solos.
const previo = { storage: {}, archivos: {}, perfil: PERFILES.cazadorHorda }
for (const [k, v] of Object.entries(saved)) { if (k.startsWith('archivo.')) previo.archivos[k.slice(8)] = v; else if (k.startsWith(PREF)) previo.storage[k.slice(PREF.length)] = JSON.parse(v) }
const { p, cerrar } = await a.abrir('claro', previo)
await p.click('[data-tab="mercado"]')
const panel = p.locator('[data-testid="bridge-panel"]')
await panel.waitFor()
check('sesión nueva restaura el puente activo', await panel.getByRole('checkbox').isChecked())
check('sesión nueva conserva los 3 días del histórico', await p.evaluate(diasHistorial, PREF).then(d => JSON.stringify(d) === '[2500,2501,2502]'))
await cerrar()
await a.terminar('bridge')
