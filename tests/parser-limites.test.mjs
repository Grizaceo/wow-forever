import { test } from 'node:test'
import assert from 'node:assert/strict'
import M from '../standalone/market.js'

const enc = (s) => new TextEncoder().encode(s)

test('el diario real del puente (más de 250.000 entradas) ya se puede leer', () => {
  // 52.000 ítems × 5 valores = 260.000 entradas: por encima del techo viejo
  // (250.000) y por debajo de MAX_BYTES. Es la forma del diario del addon.
  const partes = ['WoWForeverBridgeDB = {\n retentionDays = 14,\n entries = {\n [2517] = { items = {\n']
  for (let i = 0; i < 52000; i++) partes.push(`[${i}]={c=1,u=2,q=3,t=4,q2=5},\n`)
  partes.push('},},\n},\n}\n')
  const bytes = enc(partes.join(''))
  assert.ok(bytes.length < 8 * 1024 * 1024, 'el fixture debe caber bajo MAX_BYTES')

  const db = M.parseSavedVariables(bytes, 'WoWForeverBridgeDB')
  assert.equal(Object.keys(db.entries[2517].items).length, 52000)
})

test('el parser sigue rechazando archivos por encima de su tope de bytes', () => {
  const grande = new Uint8Array(8 * 1024 * 1024 + 1)
  assert.throws(() => M.parseSavedVariables(grande, 'X'), /invalid input size/)
})
