// Contrato puro de identidad económica: fail-closed UNKNOWN, sin inferencia por
// nombre de reino/ubicación, claves canónicas sin colisiones.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import Identity from '../standalone/market-identity.js'
const {
  UNKNOWN, unknownIdentity, accreditedIdentity, validateIdentity,
  identityKey, itemIdentityKey, compatible, canCompare,
} = Identity

const known = (over = {}) => accreditedIdentity({
  game: 'wow-forever', region: 'us', ruleset: 'PvE', auctionPool: 'pool-A',
  postingChannel: 'capital', localScope: 'local:scope-1', rawSourceKey: 'PvE:100',
  fromDay: 2500, toDay: 2502, sourceLabel: 'observación aislada', verifiedAt: '2026-11-16T20:00:00.000Z',
  ...over,
})

test('misma clave con región distinta no se cruza', () => {
  const a = known({ region: 'us' }), b = known({ region: 'eu' })
  assert.notEqual(identityKey(a), identityKey(b))
  assert.equal(canCompare(a, b), false)
  assert.match(compatible(a, b).reason, /region/)
})

test('capitales de ambas facciones no se dividen sin prueba: la facción no es dimensión', () => {
  const orgrimmar = unknownIdentity('PvE:100', 'local:org')
  const stormwind = unknownIdentity('PvE:100', 'local:sw')
  assert.equal(validateIdentity({ ...orgrimmar, faction: 'horde' }).ok, false, 'campo faction rechazado')
  assert.equal(canCompare(orgrimmar, stormwind), false)
  assert.equal(orgrimmar.auctionPool, UNKNOWN)
  assert.equal(stormwind.auctionPool, UNKNOWN)
})

test('clave desconocida queda desconocida incluso consigo misma', () => {
  const u = unknownIdentity('2589')
  assert.equal(u.game, UNKNOWN)
  assert.equal(u.region, UNKNOWN)
  assert.equal(u.ruleset, UNKNOWN)
  assert.equal(u.auctionPool, UNKNOWN)
  assert.equal(u.provenance.confidence, 'unknown')
  assert.equal(canCompare(u, u), false)
  assert.equal(compatible(u, u).reason, 'unknown-provenance')
})

test('neutral NO se infiere por ubicación ni por el ámbito local opaco', () => {
  const u = unknownIdentity('Realm Neutral', 'local:neutral-city')
  assert.equal(u.ruleset, UNKNOWN)
  assert.equal(u.auctionPool, UNKNOWN)
  assert.equal(u.region, UNKNOWN)
})

test('rawSourceKey literal se preserva; variante y base son claves distintas', () => {
  const a = known({ rawSourceKey: '2589:variant:17' })
  const b = known({ rawSourceKey: '2589' })
  assert.equal(a.rawSourceKey, '2589:variant:17')
  assert.notEqual(itemIdentityKey(a, '2589'), itemIdentityKey(b, '2589'))
  assert.notEqual(itemIdentityKey(a, '2589'), itemIdentityKey(a, '2589:variant:17'))
})

test('serialización canónica: sin concatenación ambigua y sin colisiones', () => {
  const a = identityKey(known({ auctionPool: 'A:B', postingChannel: 'C' }))
  const b = identityKey(known({ auctionPool: 'A', postingChannel: 'B:C' }))
  assert.notEqual(a, b)
  assert.equal(a, JSON.stringify(['wow-forever', 'us', 'PvE', 'A:B', 'C', 'local:scope-1', 'PvE:100']))
  assert.equal(identityKey(known()), identityKey(known()))
})

test('pools compatibles, canales distintos: comparables solo como canales', () => {
  const a = known({ postingChannel: 'capital' }), b = known({ postingChannel: 'neutral' })
  assert.equal(canCompare(a, b), true)
  assert.equal(compatible(a, b).comparableChannels, true)
  const same = known({ postingChannel: 'capital' })
  assert.equal(compatible(a, same).comparableChannels, false)
})

test('pool distinto o ruleset distinto bloquea aunque todo lo demás coincida', () => {
  assert.match(compatible(known(), known({ auctionPool: 'pool-B' })).reason, /pool/)
  assert.match(compatible(known(), known({ ruleset: 'PvP' })).reason, /ruleset/)
})

test('entradas adversas: forma, claves extra, ruta, fechas y procedencia no acreditada', () => {
  assert.equal(validateIdentity(null).ok, false)
  assert.equal(validateIdentity([]).ok, false)
  assert.equal(validateIdentity({ ...known(), faction: 'horde' }).ok, false)
  assert.equal(validateIdentity({ ...known(), localScope: 'WTF/Account/Bob' }).ok, false)
  assert.equal(validateIdentity({ ...known(), rawSourceKey: 'a\u0000b' }).ok, false)
  assert.equal(validateIdentity({ ...known(), fromDay: 3 }).ok, false) // clave extra en raíz
  assert.throws(() => accreditedIdentity({ game: 'wow-forever', region: 'us' }), /identidad no acreditada/)
})

test('verificado exige método, observación fresca y alcance completo', () => {
  const base = known()
  const badMethod = { ...base, provenance: { ...base.provenance, method: 'legacy-import' } }
  assert.equal(validateIdentity(badMethod).ok, false)
  const badKind = { ...base, provenance: { ...base.provenance, scope: { ...base.provenance.scope, observationKind: 'legacy' } } }
  assert.equal(validateIdentity(badKind).ok, false)
  const noRegion = { ...base, region: UNKNOWN }
  assert.equal(validateIdentity(noRegion).ok, false)
  const personal = { ...base, provenance: { ...base.provenance, scope: { ...base.provenance.scope, account: 'bob' } } }
  assert.equal(validateIdentity(personal).ok, false)
})
