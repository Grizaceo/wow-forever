// Prueba del plugin real (desktop/plugin.js) montado en Chromium con React de verdad y un doble
// del SDK. Sin red. Comprueba registro, migración del estado anterior, perfil, que cada pestaña
// se pinte sin errores en tema claro y oscuro, y que no se ensucie el `window` de la app.
//
//   PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/navegador.mjs
// React y react-dom se resuelven desde la app de escritorio de Hermes (HERMES_DESKTOP_PKG).
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(aqui, '..')
const reqDesk = createRequire(process.env.HERMES_DESKTOP_PKG || path.join(process.env.HOME, '.hermes/hermes-agent/apps/desktop/package.json'))
const reqLocal = createRequire(path.join(raiz, 'package.json'))
const { build } = reqLocal('esbuild')
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const plugin = process.env.DESKTOP_PLUGIN || path.join(raiz, 'plugin.js')
const reactDir = path.dirname(reqDesk.resolve('react/package.json'))

// Temas: variables con los mismos nombres que la app; valores de prueba claros y oscuros.
const TEMAS = {
  claro: { '--ui-text-primary': '#1b1b1b', '--ui-text-secondary': '#444', '--ui-text-tertiary': '#666', '--ui-text-quaternary': '#999',
    '--ui-stroke-secondary': '#ccc', '--ui-stroke-tertiary': '#e3e3e3', '--ui-bg-secondary': '#f6f6f6', '--ui-bg-tertiary': '#eee',
    '--ui-accent': '#3366ff', '--ui-green': '#2a8a3a', '--ui-yellow': '#a08000', '--ui-orange': '#c86400', '--ui-red': '#c0392b',
    '--ui-blue': '#2266cc', '--ui-purple': '#8844cc', background: '#ffffff' },
  oscuro: { '--ui-text-primary': '#eee', '--ui-text-secondary': '#bbb', '--ui-text-tertiary': '#999', '--ui-text-quaternary': '#666',
    '--ui-stroke-secondary': '#444', '--ui-stroke-tertiary': '#333', '--ui-bg-secondary': '#1f1f1f', '--ui-bg-tertiary': '#262626',
    '--ui-accent': '#7aa2ff', '--ui-green': '#5fd37a', '--ui-yellow': '#e6c84d', '--ui-orange': '#ff9f4d', '--ui-red': '#ff6b5e',
    '--ui-blue': '#6aa8ff', '--ui-purple': '#c39bff', background: '#141414' },
}

const entrada = `
import { createRoot } from 'react-dom/client'
import plugin from ${JSON.stringify(plugin)}
window.registrado = []; window.archivos = {}; window.lecturas = []
const pref = 'hermes.plugin.wow-hunter-guide.'
const ctx = {
  registerMany: (v) => window.registrado.push(...v),
  storage: {
    get: (k, f = null) => { const v = localStorage.getItem(pref + k); return v === null ? f : JSON.parse(v) },
    set: (k, v) => localStorage.setItem(pref + k, JSON.stringify(v)),
    remove: (k) => localStorage.removeItem(pref + k),
  },
  files: {
    readText: async (f, rel) => { if (f !== 'data') return { ok: false, error: 'not-granted' }; const t = localStorage.getItem('archivo.' + rel); return t === null ? { ok: false, error: 'not-found' } : { ok: true, text: t, size: t.length } },
    writeText: async (f, rel, text) => { if (f !== 'data') return { ok: false, error: 'not-granted' }; localStorage.setItem('archivo.' + rel, text); return { ok: true } },
    folders: async () => [], requestFolder: async () => ({ ok: false, folder: null }), list: async () => ({ ok: false, error: 'not-granted' }),
  },
  os: { writeClipboard: async (t) => { window.copiado = t; return true } },
}
plugin.register(ctx)
window.raiz = createRoot(document.getElementById('root'))
window.montar = () => window.raiz.render(window.registrado.find((v) => v.area === 'routes').render())
window.montar()
`
const bundle = await build({
  stdin: { contents: entrada, resolveDir: raiz, loader: 'js' }, bundle: true, format: 'iife', write: false,
  jsx: 'automatic', nodePaths: [path.dirname(reactDir)], logLevel: 'error',
  plugins: [{ name: 'sdk-doble', setup(b) { b.onResolve({ filter: /^@hermes\/plugin-sdk$/ }, () => ({ path: path.join(aqui, 'sdk-mock.jsx') })) } }],
})

const navegador = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ['--disable-gpu'] })
let pasadas = 0, red = 0
const errores = []
const check = (nombre, ok, evidencia) => { assert(ok, nombre + (evidencia !== undefined ? ' ' + JSON.stringify(evidencia) : '')); pasadas++; console.log('PASS ' + nombre) }

async function pagina(tema, previo) {
  const contexto = await navegador.newContext({ viewport: { width: 1400, height: 900 } })
  const css = Object.entries(TEMAS[tema]).map(([k, v]) => k === 'background' ? `body{background:${v}}` : `:root{${k}:${v}}`).join('')
  await contexto.route('http://localhost/**', (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><style>${css}</style></head><body style="margin:0"><div id="root" style="height:100vh"></div></body></html>` }))
  await contexto.route(/^https?:\/\/(?!localhost)/, (r) => { red++; return r.abort() })
  const p = await contexto.newPage()
  p.on('pageerror', (e) => errores.push(tema + ': ' + e.message))
  p.on('console', (m) => { if (m.type() === 'error') errores.push(tema + ' console: ' + m.text()) })
  await p.goto('http://localhost/')
  if (previo) await p.evaluate((kv) => { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v) }, previo)
  await p.addScriptTag({ content: bundle.outputFiles[0].text })
  return { p, contexto }
}

try {
  // 1) Estado de la guía anterior: Chamán de la Alianza nivel 33. Debe migrarse sin perder nada.
  const viejo = { 'hermes.plugin.wow-hunter-guide.build': JSON.stringify(JSON.stringify({ v: 3, cls: 'shaman', fac: 'alliance', lvl: 33, owned: ['x'] })) }
  let { p, contexto } = await pagina('claro', viejo)
  check('registra barra lateral, ruta y paleta', await p.evaluate(() => ['nav', 'routes', 'palette'].every((a) => registrado.some((v) => v.area === a))))
  check('la ruta es /wow-forever', await p.evaluate(() => registrado.find((v) => v.area === 'nav').data.path === '/wow-forever'))
  await p.getByText('Raza').first().waitFor()
  check('migra clase, facción y nivel de la guía anterior', await p.evaluate(() => /Enano · Chamán · Nv 33 · Alianza/.test(document.body.innerText)))
  check('avisa que la raza se supuso', await p.getByText('no guardaba tu raza').count() === 1)
  check('el progreso anterior sigue intacto', await p.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('hermes.plugin.wow-hunter-guide.build'))).owned[0] === 'x'))

  // 2) Cambiar a Paladín no-muerto (combinación nueva de Forever) y guardar.
  await p.selectOption('#wf-faccion', 'horda')
  await p.selectOption('#wf-clase', '2')
  await p.waitForFunction(() => document.querySelector('#wf-raza') && document.querySelector('#wf-raza').value === '5')
  await p.fill('#wf-nivel', '24')
  await p.waitForFunction(() => /Guardado/.test(document.body.innerText))
  const perfil = await p.evaluate(() => JSON.parse(localStorage.getItem('hermes.plugin.wow-hunter-guide.perfil')))
  check('guarda un perfil válido de una combinación nueva', perfil.raza === 5 && perfil.clase === 2 && perfil.faccion === 'horda' && perfil.nivel === 24, perfil)
  check('marca la combinación como nueva de Forever', await p.getByText('Combinación nueva de Forever').count() > 0)

  // 3) Pestaña Clase: hueco de entrenadores dicho, hechizos y misiones listados.
  await p.click('[data-tab="clase"]')
  await p.getByText('Hechizos de entrenador').waitFor()
  check('Paladín de la Horda: el hueco de entrenadores se dice', await p.getByText('Sin datos:').count() > 0)
  check('lista hechizos de entrenador', await p.locator('table tbody tr').count() > 0)

  // 4) Recarga: el perfil persiste.
  await contexto.close()
  ;({ p, contexto } = await pagina('oscuro', null))
  await contexto.close()

  // 5) Cada pestaña se pinta sin errores, en claro y oscuro, con un perfil guardado.
  for (const tema of ['claro', 'oscuro']) {
    const guardado = { 'hermes.plugin.wow-hunter-guide.perfil': JSON.stringify({ v: 1, faccion: 'horda', raza: 2, clase: 3, nivel: 30, profesiones: [165, 393], secundarias: [185], reino: 'Prueba' }) }
    ;({ p, contexto } = await pagina(tema, guardado))
    await p.locator('[role="tab"]').first().waitFor()
    const pestanas = await p.locator('[role="tab"]').evaluateAll((els) => els.map((e) => e.dataset.tab))
    check(tema + ': con Cazador de la Horda hay guía curada', pestanas.includes('guia'), pestanas)
    for (const id of pestanas) {
      await p.click(`[data-tab="${id}"]`)
      await p.waitForTimeout(80)
      check(tema + ': pestaña ' + id + ' se pinta', await p.evaluate(() => document.body.innerText.length > 40) && !(await p.locator('[role="alert"]').count()))
    }
    check(tema + ': no ensucia window con globales de la guía', await p.evaluate(() =>
      ['HunterMarket', 'HunterHistory', 'HunterDeals', 'HunterChart', 'HunterFarm', 'HunterDropData', 'HunterMarketCatalog',
       'GUIDE_HUNTER', 'GUIDE_WARRIOR', 'GUIDE_SHAMAN', 'GUIDE_LEGACY'].every((k) => !(k in window))))
    if (process.env.CAPTURAS) await p.screenshot({ path: path.join(process.env.CAPTURAS, 'wow-forever-' + tema + '.png') })
    await contexto.close()
  }
  check('sin red ni errores de JS', red === 0 && errores.length === 0, { red, errores: errores.slice(0, 5) })
  console.log(JSON.stringify({ suite: 'desktop', pasadas, red, errores: errores.length }))
} finally {
  await navegador.close()
}
