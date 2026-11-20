#!/usr/bin/env node
/**
 * Runner único de los gates canónicos de WoW Forever.
 *
 * Uso (desde la raíz del repo):
 *   node scripts/run-gates.mjs               # corre todo, reporta conteos, exit 0/1
 *   node scripts/run-gates.mjs --keep-going  # no corta al primer fallo
 *
 * Corre los cuatro harnesses canónicos + build/check y compara los conteos con
 * los esperados (ver docs/TESTING.md). Incluye standalone/tests/*.cjs: su
 * sección "real fixture" es stat-only por defecto y solo lee CONTENIDO de
 * SavedVariables vivos con WOW_FOREVER_REAL_FIXTURE=1 (diagnóstico manual, nunca
 * en gates), así que el stack canónico respeta el contrato de privacidad (solo
 * stat).
 *
 * Entorno navegador (opcional; se autodescubre si falta):
 *   PLAYWRIGHT_MODULE  ruta a playwright/index.mjs
 *   CHROMIUM_PATH      ruta al chrome de ms-playwright
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEEP_GOING = process.argv.includes('--keep-going');

// Conteos esperados del stack canónico (actualizar a mano si se añaden tests).
const EXPECT_NODE = 267;
const EXPECT_PY = 86;
const EXPECT_LUA = 52;
// Tests unitarios del motor en standalone/tests/*.cjs (node:test). Los «real
// fixture» son stat-only por defecto; WOW_FOREVER_REAL_FIXTURE=1 los hace leer
// contenido de SavedVariables (solo para diagnóstico manual, nunca en gates).
const EXPECT_CJS = 78;
const BROWSER = [
  ['navegador', 34], ['mercado-auto', 11], ['mercado-procedencia', 24],
  ['tsm', 28], ['vista-mercado', 55], ['vista-davi', 50], ['vista-guia', 28],
  ['vista-profesiones', 27], ['vista-ruta-dungeons', 31], ['bridge', 19],
];
const EXPECT_BROWSER_TOTAL = BROWSER.reduce((n, [, c]) => n + c, 0); // 307

function sh(cmd, args, cwd = ROOT, env = process.env) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}`, error: r.error };
}
// Acepta el reporter spec (ℹ pass N) o tap (# pass N) de node --test.
function num(re, s) { const m = re.exec(s); return m ? Number(m[1]) : null; }
const tail = (s, n = 1500) => s.slice(-n);

function resolveBrowserEnv() {
  const home = process.env.HOME || '';
  let pm = process.env.PLAYWRIGHT_MODULE;
  if (!pm || !existsSync(pm)) {
    pm = null;
    const base = path.join(home, '.hermes/hermes-agent/node_modules/.pnpm');
    if (existsSync(base)) for (const d of readdirSync(base).filter(x => x.startsWith('playwright@')).sort()) {
      const p = path.join(base, d, 'node_modules/playwright/index.mjs');
      if (existsSync(p)) { pm = p; break; }
    }
  }
  let ch = process.env.CHROMIUM_PATH;
  if (!ch || !existsSync(ch)) {
    ch = null;
    const base = path.join(home, '.cache/ms-playwright');
    if (existsSync(base)) for (const d of readdirSync(base).filter(x => x.startsWith('chromium-')).sort()) {
      const p = path.join(base, d, 'chrome-linux64/chrome');
      if (existsSync(p)) { ch = p; break; }
    }
  }
  return { pm, ch };
}

const results = [];
function record(name, expected, actual, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(26)} esperado=${String(expected).padEnd(7)} obtenido=${String(actual).padEnd(7)} ${detail}`);
  if (!ok && !KEEP_GOING) {
    console.error(`\nFALLO en «${name}» — corto acá (usá --keep-going para seguir).`);
    finish();
  }
}
function finish() {
  const bad = results.filter(r => !r.ok);
  console.log('\n' + '='.repeat(64));
  console.log(`GATES: ${results.length - bad.length}/${results.length} verdes`);
  if (bad.length) { console.log('FALLARON: ' + bad.map(b => b.name).join(', ')); process.exit(1); }
  console.log('TODO VERDE ✓');
  process.exit(0);
}

console.log('WoW Forever — runner de gates canónicos');
console.log(`raíz: ${ROOT}\n`);

// 1) node --test tests/  (lógica src/ + motor, fixtures sintéticos)
{
  const r = sh('node', ['--test', 'tests/']);
  const pass = num(/(?:ℹ|#)\s+pass (\d+)/, r.out);
  const fail = num(/(?:ℹ|#)\s+fail (\d+)/, r.out);
  const tests = num(/(?:ℹ|#)\s+tests (\d+)/, r.out);
  const ok = r.code === 0 && fail === 0 && pass === EXPECT_NODE;
  record('node tests/', EXPECT_NODE, pass, ok, ok ? `tests=${tests} fail=${fail}` : `tests=${tests} fail=${fail}\n${tail(r.out)}`);
}

// 2) python3 -m unittest discover -s tests  (datos, desktop, ROI, skill, reproducibilidad)
{
  const r = sh('python3', ['-m', 'unittest', 'discover', '-s', 'tests']);
  const ran = num(/Ran (\d+) tests?/, r.out);
  const ok = r.code === 0 && /\bOK\b/.test(r.out) && ran === EXPECT_PY;
  record('python tests/', EXPECT_PY, ran, ok, ok ? 'OK' : tail(r.out));
}

// 2b) node --test standalone/tests/*.cjs  (cobertura única del motor:
//     parser, historial, deals, chart — fixtures sintéticos, real-fixture stat-only)
{
  const r = sh('node', ['--test',
    'standalone/tests/market.cjs', 'standalone/tests/market-history.cjs',
    'standalone/tests/market-deals.cjs', 'standalone/tests/market-chart.cjs']);
  const pass = num(/(?:ℹ|#)\s+pass (\d+)/, r.out);
  const fail = num(/(?:ℹ|#)\s+fail (\d+)/, r.out);
  const ok = r.code === 0 && fail === 0 && pass === EXPECT_CJS;
  record('node motor .cjs', EXPECT_CJS, pass, ok, ok ? '' : `fail=${fail}\n${tail(r.out)}`);
}

// 3) lua addon/tests/test_bridge.lua  (diario del puente)
{
  const luaPath = sh('bash', ['-lc', 'command -v lua5.1 || command -v lua || command -v luajit']).out.trim();
  if (!luaPath) {
    record('lua bridge', EXPECT_LUA, null, false, 'lua5.1/lua/luajit no encontrado en PATH');
  } else {
    const r = sh(luaPath, ['addon/tests/test_bridge.lua']);
    const checks = num(/(\d+) checks/, r.out);
    const fallos = num(/(\d+) fallos/, r.out);
    const ok = r.code === 0 && fallos === 0 && checks === EXPECT_LUA;
    record('lua bridge', EXPECT_LUA, checks, ok, ok ? `fallos=${fallos}` : `fallos=${fallos}\n${tail(r.out)}`);
  }
}

// 4) build del bundle Desktop (esbuild). Reescribe desktop/plugin.js; si no hay
//    cambios en desktop/src sale byte-idéntico al commiteado.
{
  const r = sh('node', ['build.mjs'], path.join(ROOT, 'desktop'));
  const ok = r.code === 0;
  record('build desktop', 'OK', ok ? 'OK' : 'FALLO', ok, ok ? tail(r.out, 200).trim() : tail(r.out));
}

// 5) check_desktop_bundle.py sobre el bundle recién construido
{
  const r = sh('python3', ['scripts/check_desktop_bundle.py', 'desktop/plugin.js']);
  const bytes = num(/(\d+) bytes/, r.out);
  const ok = r.code === 0 && /\bOK\b/.test(r.out);
  record('bundle-check', 'OK', ok ? 'OK' : 'FALLO', ok, ok ? `${bytes} bytes` : tail(r.out));
}

// 6) 10 suites navegador headless (Playwright prestado + Chromium propio).
//    Cada suite imprime una línea JSON {pasadas, red, errores} al final.
{
  const { pm, ch } = resolveBrowserEnv();
  if (!pm || !ch) {
    record('browser env', 'rutas', 'FALLO', false, `PLAYWRIGHT_MODULE=${pm} CHROMIUM_PATH=${ch}`);
  } else {
    const env = { ...process.env, PLAYWRIGHT_MODULE: pm, CHROMIUM_PATH: ch };
    let total = 0;
    for (const [suite, exp] of BROWSER) {
      const r = sh('node', [`test/${suite}.mjs`], path.join(ROOT, 'desktop'), env);
      const lines = r.out.trim().split('\n');
      let j = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        try { const o = JSON.parse(lines[i]); if (o && typeof o.pasadas === 'number') { j = o; break; } } catch { /* no JSON */ }
      }
      const pas = j ? j.pasadas : null;
      const red = j ? j.red : null;
      const err = j ? j.errores : null;
      const ok = r.code === 0 && pas === exp && red === 0 && err === 0;
      if (pas != null) total += pas;
      record(`browser:${suite}`, exp, pas, ok, ok ? '' : `red=${red} errores=${err}\n${tail(r.out, 800)}`);
    }
    record('browser TOTAL', EXPECT_BROWSER_TOTAL, total, total === EXPECT_BROWSER_TOTAL, '');
  }
}

finish();
