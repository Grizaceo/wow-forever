#!/usr/bin/env node
/**
 * Runner único de los gates canónicos de WoW Forever.
 *
 * Uso (desde la raíz del repo):
 *   node scripts/run-gates.mjs               # corre todo, reporta conteos, exit 0/1
 *   node scripts/run-gates.mjs --keep-going  # no corta al primer fallo
 *   node scripts/run-gates.mjs --no-lua      # excluye Lua explícitamente; no es el gate completo
 *
 * Corre los cuatro harnesses canónicos + build/check y compara los conteos con
 * los esperados (ver docs/TESTING.md). Incluye standalone/tests/*.cjs: su
 * sección "real fixture" es stat-only por defecto y solo lee CONTENIDO de
 * SavedVariables vivos con WOW_FOREVER_REAL_FIXTURE=1 (diagnóstico manual, nunca
 * en gates), así que el stack canónico respeta el contrato de privacidad (solo
 * stat).
 *
 * Entorno navegador: las dependencias se fijan en desktop/package-lock.json
 * (`npm ci` en desktop/, `npx playwright install chromium`). Overrides opcionales:
 *   PLAYWRIGHT_MODULE  ruta al index.mjs de Playwright
 *   CHROMIUM_PATH      ruta al binario de Chromium
 *   HERMES_DESKTOP_PKG package.json que aporta react/react-dom (por defecto,
 *                      el propio desktop/package.json del repo)
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEEP_GOING = process.argv.includes('--keep-going');
const NO_LUA = process.argv.includes('--no-lua');

// Conteos canónicos: detectan tests que desaparecen o se saltan silenciosamente.
// Overrides opcionales WOW_GATES_EXPECT_{NODE,PY,LUA,CJS}=N para ramas en las
// que aterrizan tests nuevos antes de actualizar estos defaults.
function expected(name, fallback) {
  const raw = process.env[`WOW_GATES_EXPECT_${name}`];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}
const EXPECT_NODE = expected('NODE', 425);
const EXPECT_PY = expected('PY', 129);
const EXPECT_LUA = expected('LUA', 180);
// Tests unitarios del motor en standalone/tests/*.cjs (node:test). Los «real
// fixture» son stat-only por defecto; WOW_FOREVER_REAL_FIXTURE=1 los hace leer
// contenido de SavedVariables (solo para diagnóstico manual, nunca en gates).
const EXPECT_CJS = expected('CJS', 133);
const BROWSER = [
  ['navegador', process.env.HERMES_SDK_TABS === '1' ? 68 : 67], ['vista-clase', 23],
  ['mercado-auto', 14], ['mercado-procedencia', 24],
  ['tsm', 54], ['tsm-valoracion', 108], ['vista-mercado', 59], ['vista-davi', 50], ['vista-guia', 28],
  ['vista-profesiones', 41], ['vista-ruta-dungeons', 31], ['bridge', 19],
  ['vista-personaje-simc', 11], ['vista-pawn', 15], ['vista-subasta-pawn', 28],
  ['farm-routing', 11], ['tab-performance', 14],
];
const EXPECT_BROWSER_TOTAL = BROWSER.reduce((n, [, c]) => n + c, 0);

function sh(cmd, args, cwd = ROOT, env = process.env) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}`, error: r.error };
}
// Acepta el reporter spec (ℹ pass N) o tap (# pass N) de node --test.
function num(re, s) { const m = re.exec(s); return m ? Number(m[1]) : null; }
const tail = (s, n = 1500) => s.slice(-n);

// Descubrimiento de Lua sin `bash`: solo PATH, portable en cualquier runner.
function findOnPath(names) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const name of names) for (const dir of dirs) {
    for (const file of [name, `${name}.exe`]) {
      const candidate = path.join(dir, file);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function resolveBrowserEnv() {
  // Sin rutas de máquina: Playwright/React/ReactDOM son dependencias fijadas del
  // repo, resueltas desde desktop/package.json (lo que hace `npm ci` en desktop/).
  const reqDesktop = createRequire(path.join(ROOT, 'desktop', 'package.json'));
  let pw = null;
  try { pw = reqDesktop('playwright'); } catch { /* se informa abajo */ }

  // Overrides explícitos: tienen prioridad sobre los defaults del proyecto.
  let pm = process.env.PLAYWRIGHT_MODULE || null;
  if (pm && !existsSync(pm)) pm = null;
  const havePlaywright = Boolean(pm || pw ||
    existsSync(path.join(ROOT, 'desktop', 'node_modules', 'playwright', 'index.mjs')));

  let ch = process.env.CHROMIUM_PATH || null;
  if (ch && !existsSync(ch)) ch = null;
  if (!ch && pw) {
    const exe = pw.chromium.executablePath();
    if (exe && existsSync(exe)) ch = exe;
  }
  return { pm, ch, havePlaywright };
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
  console.log(NO_LUA ? 'GATES EJECUTADOS VERDES ✓ — Lua excluido; no es verificación completa' : 'TODO VERDE ✓');
  process.exit(0);
}

console.log('WoW Forever — runner de gates canónicos');
console.log(`raíz: ${ROOT}\n`);

// 1) node --test tests/  (lógica src/ + motor, fixtures sintéticos)
{
  const r = sh('node', ['scripts/test-node.mjs']);
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
    'standalone/tests/market-deals.cjs', 'standalone/tests/market-chart.cjs',
    'standalone/tests/market-farm.cjs', 'standalone/tests/market-farm-routing.cjs',
    'standalone/tests/farm-plan-real.cjs']);
  const pass = num(/(?:ℹ|#)\s+pass (\d+)/, r.out);
  const fail = num(/(?:ℹ|#)\s+fail (\d+)/, r.out);
  const ok = r.code === 0 && fail === 0 && pass === EXPECT_CJS;
  record('node motor .cjs', EXPECT_CJS, pass, ok, ok ? '' : `fail=${fail}\n${tail(r.out)}`);
}

// 3) lua addon/tests/test_bridge.lua  (diario del puente)
if (NO_LUA) {
  console.log('— lua bridge: NO EJECUTADO por --no-lua (excluido del total de gates)');
} else {
  const luaPath = findOnPath(['lua5.1', 'lua', 'luajit']);
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

// 6) Suites navegador headless (dependencias fijadas del repo + Chromium de
//    Playwright). Cada suite imprime una línea JSON {pasadas, red, errores}.
{
  const { pm, ch, havePlaywright } = resolveBrowserEnv();
  if (!havePlaywright || !ch) {
    record('browser env', 'deps', 'FALLO', false,
      `playwright=${havePlaywright} chromium=${ch || 'falta'}; ` +
      'corré `npm ci` en desktop/ y `npx playwright install chromium`');
  } else {
    const env = { ...process.env };
    if (pm) env.PLAYWRIGHT_MODULE = pm;
    if (ch) env.CHROMIUM_PATH = ch;
    env.HERMES_DESKTOP_PKG = process.env.HERMES_DESKTOP_PKG ||
      path.join(ROOT, 'desktop', 'package.json');
    let total = 0;
    for (const [suite, exp] of BROWSER) {
      const r = sh('node', [`test/${suite}.mjs`], path.join(ROOT, 'desktop'), env);
      const lines = r.out.trim().split('\n');
      // Una suite puede imprimir VARIOS resúmenes (vista-clase: 14 + 9 = 23).
      // Sumar todos los JSON {pasadas,...}: quedarse con el último ocultaría
      // checks y dejaría un gate verde con la mitad de la suite sin contar.
      let pas = 0, red = 0, err = 0, resumenes = 0;
      for (const line of lines) {
        try {
          const o = JSON.parse(line);
          if (o && typeof o.pasadas === 'number') {
            pas += o.pasadas;
            red += (o.red || 0);
            err += (o.errores || 0);
            resumenes++;
          }
        } catch { /* no JSON */ }
      }
      if (resumenes === 0) pas = null;
      const ok = r.code === 0 && pas === exp && red === 0 && err === 0;
      if (pas != null) total += pas;
      record(`browser:${suite}`, exp, pas, ok, ok ? '' : `red=${red} errores=${err}\n${tail(r.out, 800)}`);
    }
    record('browser TOTAL', EXPECT_BROWSER_TOTAL, total, total === EXPECT_BROWSER_TOTAL, '');
  }
}

finish();
