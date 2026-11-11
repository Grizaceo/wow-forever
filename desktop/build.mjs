// Build de la mitad Desktop: un solo ESM legible (sin minificar) en desktop/plugin.js.
// El cargador de Hermes Desktop solo admite imports a @hermes/plugin-sdk y react*;
// todo lo demás (lógica del mercado, guías curadas, data/*.json) va en línea.
// Escribe BUNDLE.json con el sha256 del resultado: dos builds con las mismas entradas
// dan los mismos bytes (tests/test_desktop.py lo comprueba).
//
//   node build.mjs              -> desktop/plugin.js + desktop/BUNDLE.json
//   node build.mjs --out FILE   -> solo FILE (para comparar builds)
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { build } from 'esbuild'

const EXTERNAL = ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime']
const i = process.argv.indexOf('--out')
const out = i > 0 ? process.argv[i + 1] : 'plugin.js'

const result = await build({
  entryPoints: ['src/plugin.src.jsx'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: false,
  charset: 'utf8',
  legalComments: 'none',
  sourcemap: false,
  jsx: 'automatic',
  jsxDev: false,
  external: EXTERNAL,
  logLevel: 'warning',
})

const cabecera =
  '// GENERADO por desktop/build.mjs desde desktop/src/, standalone/ y data/ de este repo.\n' +
  '// GPL-3.0-or-later. Datos: CMaNGOS classic-db (GPL-3.0) y tablas del cliente de WoW\n' +
  '// (c) Blizzard Entertainment; ver LICENSE-DATA.md. No editar a mano.\n'
let fuente = cabecera + result.outputFiles[0].text
// El escáner del instalador marca caracteres invisibles aunque estén en strings.
fuente = fuente.replace(/[​‌‍⁠﻿]/g, (c) =>
  '\\u' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'))
writeFileSync(out, fuente)

if (i < 0) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const bytes = readFileSync(out)
  writeFileSync('BUNDLE.json', JSON.stringify({
    artifact: 'desktop/plugin.js',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    built_with: { esbuild: pkg.devDependencies.esbuild },
    external: EXTERNAL,
    data_manifest: '../data/MANIFEST.json',
    check: 'python3 scripts/check_desktop_bundle.py',
  }, null, 2) + '\n')
}
console.log(out, fuente.length, 'chars')
