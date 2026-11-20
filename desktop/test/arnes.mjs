// Arnés común de las pruebas en navegador: construye desktop/plugin.js con un doble del SDK,
// lo monta en Chromium con React real y un ctx simulado (storage, carpeta de datos, carpeta
// concedida para Auctionator.lua, portapapeles). Sin red.
//
//   import { iniciar } from './arnes.mjs'
//   const a = await iniciar()
//   const { p, cerrar } = await a.abrir('oscuro', { perfil: {...} })
//   ...
//   await a.terminar()   // falla si hubo red o errores de JS
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(aqui, '..')
const reqDesk = createRequire(process.env.HERMES_DESKTOP_PKG || path.join(process.env.HOME, '.hermes/hermes-agent/apps/desktop/package.json'))
const reqLocal = createRequire(path.join(raiz, 'package.json'))
export const PREF = 'hermes.plugin.wow-hunter-guide.'

export const TEMAS = {
  claro: { '--ui-text-primary': '#1b1b1b', '--ui-text-secondary': '#444', '--ui-text-tertiary': '#666', '--ui-text-quaternary': '#999',
    '--ui-stroke-secondary': '#ccc', '--ui-stroke-tertiary': '#e3e3e3', '--ui-bg-secondary': '#f6f6f6', '--ui-bg-tertiary': '#eee',
    '--ui-accent': '#3366ff', '--ui-green': '#2a8a3a', '--ui-yellow': '#a08000', '--ui-orange': '#c86400', '--ui-red': '#c0392b',
    '--ui-blue': '#2266cc', '--ui-purple': '#8844cc', background: '#ffffff' },
  oscuro: { '--ui-text-primary': '#eee', '--ui-text-secondary': '#bbb', '--ui-text-tertiary': '#999', '--ui-text-quaternary': '#666',
    '--ui-stroke-secondary': '#444', '--ui-stroke-tertiary': '#333', '--ui-bg-secondary': '#1f1f1f', '--ui-bg-tertiary': '#262626',
    '--ui-accent': '#7aa2ff', '--ui-green': '#5fd37a', '--ui-yellow': '#e6c84d', '--ui-orange': '#ff9f4d', '--ui-red': '#ff6b5e',
    '--ui-blue': '#6aa8ff', '--ui-purple': '#c39bff', background: '#141414' },
}

// ctx simulado. window.carpetaConcedida = { name, files: { 'SavedVariables/Auctionator.lua': '…' | { b64 } } }
// la define cada prueba; requestFolder la "concede" y window.lecturas registra lo leído.
const ENTRADA = (plugin) => `
import { createRoot } from 'react-dom/client'
import plugin from ${JSON.stringify(plugin)}
window.registrado = []; window.lecturas = []; window.concedidas = []; window.selectorAbierto = 0
const pref = ${JSON.stringify(PREF)}
const carpeta = () => window.carpetaConcedida || { name: 'vacía', files: {} }
const listar = (rel) => {
  const base = rel ? rel + '/' : '', vistos = new Map()
  for (const k of Object.keys(carpeta().files)) {
    if (!k.startsWith(base)) continue
    const resto = k.slice(base.length), i = resto.indexOf('/')
    const name = i < 0 ? resto : resto.slice(0, i)
    vistos.set(name, { name, path: base + name, isDirectory: i >= 0 })
  }
  return [...vistos.values()]
}
const ctx = {
  registerMany: (v) => window.registrado.push(...v),
  setInterval: (fn, ms) => { (window.sondeos ||= []).push({fn, ms}); return () => {} },
  onDispose: (fn) => { (window.disposers ||= []).push(fn) },
  storage: {
    get: (k, f = null) => { const v = localStorage.getItem(pref + k); return v === null ? f : JSON.parse(v) },
    set: (k, v) => localStorage.setItem(pref + k, JSON.stringify(v)),
    remove: (k) => localStorage.removeItem(pref + k),
  },
  files: {
    readText: async (f, rel) => {
      if (f === 'data') { const t = localStorage.getItem('archivo.' + rel); return t === null ? { ok: false, error: 'not-found' } : { ok: true, text: t, size: t.length } }
      if (!window.concedidas.some((c) => c.id === f)) return { ok: false, error: 'not-granted' }
      window.lecturas.push(rel)
      const t = carpeta().files[rel]
      // Como Hermes (toString('utf8')): un archivo binario { b64 } se decodifica con pérdida.
      const texto = t === undefined ? undefined : typeof t === 'string' ? t : new TextDecoder('utf-8').decode(Uint8Array.from(atob(t.b64), (c) => c.charCodeAt(0)))
      return texto === undefined ? { ok: false, error: 'not-found' } : { ok: true, text: texto, size: texto.length }
    },
    writeText: async (f, rel, text) => {
      if (f !== 'data') return { ok: false, error: 'not-granted' }
      if (window.fallarEscritura || (window.fallarMercado && rel.startsWith('market-'))) return { ok: false, error: 'io-error' }
      localStorage.setItem('archivo.' + rel, text); return { ok: true }
    },
    folders: async () => window.concedidas.slice(),
    requestFolder: async () => {
      window.selectorAbierto++
      if (!window.carpetaConcedida) return { ok: false, folder: null }
      const folder = { id: 'g1', name: carpeta().name, path: '/juego/' + carpeta().name }
      window.concedidas = [folder]; return { ok: true, folder }
    },
    list: async (f, rel) => window.concedidas.some((c) => c.id === f) ? { ok: true, entries: listar(rel), truncated: false } : { ok: false, error: 'not-granted' },
    // Bytes exactos en base64, como Hermes. window.sinDataUrl simula un host sin readDataUrl.
    readDataUrl: async (f, rel) => {
      if (window.sinDataUrl) return { ok: false, error: 'io-error' }
      if (!window.concedidas.some((c) => c.id === f)) return { ok: false, error: 'not-granted' }
      window.lecturas.push(rel)
      const t = carpeta().files[rel]
      if (t === undefined) return { ok: false, error: 'not-found' }
      const b64 = typeof t === 'string' ? btoa(String.fromCharCode(...new TextEncoder().encode(t))) : t.b64
      return { ok: true, url: 'data:text/plain;base64,' + b64 }
    },
  },
  os: {
    writeClipboard: async (t) => {
      window.copiado = t
      window.copiados = (window.copiados || 0) + 1
      if (window.portapapelesLanza) throw new Error('portapapeles falló (simulado)')
      return window.portapapelesOk !== false
    },
  },
}
plugin.register(ctx)
window.raiz = createRoot(document.getElementById('root'))
window.montar = () => window.raiz.render(window.registrado.find((v) => v.area === 'routes').render())
window.montar()
`

export async function iniciar({ plugin = process.env.DESKTOP_PLUGIN || path.join(raiz, 'plugin.js') } = {}) {
  const { build } = reqLocal('esbuild')
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
  const reactDir = path.dirname(reqDesk.resolve('react/package.json'))
// pnpm: react y react-dom viven en directorios .pnpm distintos; el bundle del
// arnés necesita ambos en nodePaths (react-dom/client lo importa la entrada).
const reactDomDir = path.dirname(reqDesk.resolve('react-dom/package.json'))
  const bundle = await build({
    stdin: { contents: ENTRADA(plugin), resolveDir: raiz, loader: 'js' }, bundle: true, format: 'iife', write: false,
    jsx: 'automatic', nodePaths: [path.dirname(reactDir), path.dirname(reactDomDir)], logLevel: 'error',
    plugins: [{ name: 'sdk-doble', setup(b) { b.onResolve({ filter: /^@hermes\/plugin-sdk$/ }, () => ({ path: path.join(aqui, 'sdk-mock.jsx') })) } }],
  })
  const codigo = bundle.outputFiles[0].text
  const navegador = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ['--disable-gpu'] })
  const estado = { pasadas: 0, red: 0, errores: [] }

  // previo: { perfil?, build?, storage?: {clave: valor}, raw?: {clave: valorCrudo}, archivos?: {rel: texto} }
  async function abrir(tema = 'claro', previo = {}) {
    const contexto = await navegador.newContext({ viewport: { width: 1400, height: 900 } })
    const css = Object.entries(TEMAS[tema]).map(([k, v]) => k === 'background' ? `body{background:${v}}` : `:root{${k}:${v}}`).join('')
    await contexto.route('http://localhost/**', (r) => r.fulfill({ contentType: 'text/html',
      body: `<!doctype html><html><head><style>${css}</style></head><body style="margin:0"><div id="root" style="height:100vh"></div></body></html>` }))
    await contexto.route(/^https?:\/\/(?!localhost)/, (r) => { estado.red++; return r.abort() })
    const p = await contexto.newPage()
    p.on('pageerror', (e) => estado.errores.push(tema + ': ' + e.message))
    p.on('console', (m) => { if (m.type() === 'error') estado.errores.push(tema + ' console: ' + m.text()) })
    await p.goto('http://localhost/')
    const kv = {}
    if (previo.perfil) kv[PREF + 'perfil'] = JSON.stringify(previo.perfil)
    if (previo.build) kv[PREF + 'build'] = JSON.stringify(previo.build)
    for (const [k, v] of Object.entries(previo.storage || {})) kv[PREF + k] = JSON.stringify(v)
    // Claves CRUDAS (sin el prefijo del SDK): para sembrar las claves heredadas
    // que la 1.0.0 dejó en el localStorage (p.ej. `auction-path`).
    for (const [k, v] of Object.entries(previo.raw || {})) kv[k] = v
    for (const [k, v] of Object.entries(previo.archivos || {})) kv['archivo.' + k] = v
    await p.evaluate((x) => { for (const [k, v] of Object.entries(x)) localStorage.setItem(k, v) }, kv)
    await p.addScriptTag({ content: codigo })
    await p.locator('[role="tab"]').first().waitFor()
    return { p, cerrar: () => contexto.close() }
  }

  const check = (nombre, ok, evidencia) => {
    assert(ok, nombre + (evidencia !== undefined ? ' ' + JSON.stringify(evidencia) : ''))
    estado.pasadas++
    console.log('PASS ' + nombre)
  }

  async function terminar(suite) {
    try {
      check('sin red ni errores de JS', estado.red === 0 && estado.errores.length === 0, { red: estado.red, errores: estado.errores.slice(0, 5) })
      console.log(JSON.stringify({ suite, pasadas: estado.pasadas, red: estado.red, errores: estado.errores.length }))
    } finally { await navegador.close() }
  }

  return { abrir, check, terminar, estado }
}

// Perfiles de prueba frecuentes.
export const PERFILES = {
  cazadorHorda: { v: 1, faccion: 'horda', raza: 2, clase: 3, nivel: 30, profesiones: [165, 393], secundarias: [185], reino: 'Prueba' },
  paladinHorda: { v: 1, faccion: 'horda', raza: 5, clase: 2, nivel: 24, profesiones: [164, 186], secundarias: [], reino: 'Prueba' },
  chamanAlianza: { v: 1, faccion: 'alianza', raza: 3, clase: 7, nivel: 40, profesiones: [171, 182], secundarias: [129], reino: 'Prueba' },
  magoCielonato: { v: 1, faccion: 'alianza', raza: 95, clase: 8, nivel: 12, profesiones: [197, 333], secundarias: [356], reino: 'Prueba' },
}
