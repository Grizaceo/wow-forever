#!/usr/bin/env node
// Node 22 does not discover an explicit tests/ directory like newer releases.
// Enumerate files ourselves: no shell glob expansion (including on Windows).
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tests = readdirSync(path.join(root, 'tests'))
  .filter(name => name.endsWith('.test.mjs')).sort()
  .map(name => path.join(root, 'tests', name))
if (!tests.length) throw new Error('No Node test files found; refusing an empty green run')
const result = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: root, env: process.env, stdio: 'inherit',
})
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
