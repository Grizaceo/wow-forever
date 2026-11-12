// tests/referencias-skill.test.mjs — las referencias de la skill generadas por
// tools/build-referencias-skill.mjs son deterministas, están al día con las
// guías standalone/guide-*.js y no conservan HTML ni entidades sin convertir.
//
//   node --test tests/

import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cargarGuias, generarTodo } from '../tools/build-referencias-skill.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'build-referencias-skill.mjs')
const REF = path.join(ROOT, 'skills', 'wow-forever', 'references')
const FACCION_ES = { horda: 'Horda', alianza: 'Alianza' }

const mdFiles = () => fs.readdirSync(REF).filter((f) => f.endsWith('.md')).sort()
const leer = (f) => fs.readFileSync(path.join(REF, f), 'utf8')
const temporales = []
const tmpdir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'referencias-skill-test-')); temporales.push(d); return d }
test.after(() => { for (const d of temporales) fs.rmSync(d, { recursive: true, force: true }) })

test('el generador es determinista: dos corridas dan los mismos bytes', () => {
  const a = generarTodo()
  const b = generarTodo()
  assert.deepEqual(
    a.map((i) => [i.nombre, i.contenido]),
    b.map((i) => [i.nombre, i.contenido]))
})

test('lo generado coincide byte a byte con lo commiteado', () => {
  const dir = tmpdir()
  const r = spawnSync(process.execPath, [TOOL, '--salida', dir], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const generados = fs.readdirSync(dir).sort()
  assert.deepEqual(generados, mdFiles())
  for (const f of mdFiles()) {
    assert.ok(
      fs.readFileSync(path.join(dir, f)).equals(fs.readFileSync(path.join(REF, f))),
      `${f} difiere de lo generado`)
  }
})

test('ningún .md conserva etiquetas HTML ni entidades sin convertir', () => {
  for (const f of mdFiles()) {
    const t = leer(f)
    assert.ok(!/<\/?[a-zA-Z][^>\n]*>/.test(t), `${f} tiene etiquetas HTML`)
    assert.ok(!/&[a-zA-Z#][a-zA-Z0-9#]*;/.test(t), `${f} tiene entidades sin decodificar`)
  }
})

test('cada archivo declara su origen curado', () => {
  for (const f of mdFiles()) {
    const t = leer(f)
    assert.match(t, /Origen: \*\*curado\*\*/, f)
    assert.match(t, /standalone\/guide-/, f)
  }
})

test('cada clase y facción de factions tiene su archivo', () => {
  const esperados = []
  for (const { slug, G } of cargarGuias()) {
    for (const fac of Object.keys(G.factions || {})) {
      esperados.push(`curado-${slug}-${fac === 'horde' ? 'horda' : 'alianza'}.md`)
    }
  }
  for (const f of esperados) {
    assert.ok(mdFiles().includes(f), `falta ${f}`)
    assert.match(leer(f), new RegExp(`de la ${FACCION_ES[f.includes('-horda') ? 'horda' : 'alianza']}`), f)
  }
  assert.ok(mdFiles().includes('curado-legacy.md'), 'falta curado-legacy.md')
  assert.ok(mdFiles().includes('INDICE.md'), 'falta INDICE.md')
})

test('INDICE.md lista todos los archivos generados', () => {
  const indice = leer('INDICE.md')
  for (const f of mdFiles()) {
    if (f === 'INDICE.md') continue
    assert.ok(indice.includes(`\`${f}\``), `INDICE.md no lista ${f}`)
  }
})

test('--verificar sale 0 con las referencias al día y 1 si difieren', () => {
  const ok = spawnSync(process.execPath, [TOOL, '--verificar'], { encoding: 'utf8' })
  assert.equal(ok.status, 0, ok.stderr)

  const dir = tmpdir()
  for (const f of mdFiles()) fs.copyFileSync(path.join(REF, f), path.join(dir, f))
  fs.appendFileSync(path.join(dir, 'curado-legacy.md'), '\ncambio\n')
  const mal = spawnSync(process.execPath, [TOOL, '--verificar', '--salida', dir], { encoding: 'utf8' })
  assert.equal(mal.status, 1)
  assert.match(mal.stderr, /difiere: curado-legacy\.md/)
})
