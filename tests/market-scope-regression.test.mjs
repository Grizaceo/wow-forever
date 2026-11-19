import {test} from 'node:test'
import assert from 'node:assert/strict'
import H from '../standalone/market-history.js'
import I from '../standalone/market-identity.js'
import {planImportacion} from '../desktop/src/mercado-logica.js'
const snap=(pool,n=100)=>({schemaVersion:2,sourceVersion:8,importedAt:'2026-11-16T20:00:00Z',warnings:[],observation:{scope:'fresh-scan',fromDay:2500,toDay:2500,capturedAt:'2026-11-16T20:00:00Z'},realms:[{name:'PvE',identity:I.accreditedIdentity({game:'wow-forever',region:'us',ruleset:'PvE',auctionPool:pool,postingChannel:pool,localScope:'test',rawSourceKey:'PvE',fromDay:2500,toDay:2500,sourceLabel:'synthetic',verifiedAt:'2026-11-16T20:00:00Z'}),items:[{sourceKey:'1',itemId:1,unitPriceCopper:n,observedDay:2500,available:2,confirmed:true,history:[{day:2490,low:n,high:n,available:2},{day:2500,low:n,high:n,available:2}]}]}]})
test('trimming v2 snapshot preserves all provenance and current scan metadata',()=>{
 const s=snap('A'),r=H.trimSnapshotHistory(s,5)
 assert.deepEqual(r.observation,s.observation);assert.deepEqual(r.realms[0].identity,s.realms[0].identity)
 assert.equal(r.realms[0].items[0].confirmed,true);assert.equal(r.realms[0].items[0].available,2)
 assert.equal(r.realms[0].items[0].history.length,1)
})
test('successive same-name pools remain visible and never mix prices',()=>{
 const a=snap('A'),b=snap('B',200)
 const r=planImportacion(b,{snapshotActual:a,historyStore:H.storeV2FromSnapshot(a)})
 assert.equal(r.snapshot.realms.length,2)
 assert.deepEqual(r.snapshot.realms.map(x=>x.items[0].unitPriceCopper).sort((a,b)=>a-b),[100,200])
 assert.equal(Object.keys(r.store.scopes).length,2)
 assert.ok(r.snapshot.realms.every(x=>x.identity))
 const again=planImportacion(snap('A',300),{snapshotActual:r.snapshot,historyStore:r.store})
 assert.equal(again.snapshot.realms.length,2)
 assert.equal(again.snapshot.realms.find(x=>x.identity.auctionPool==='A').items[0].unitPriceCopper,300)
})
test('hydrating accumulated history preserves v2 available/confirmed fields',()=>{
 const s=snap('A');s.realms[0].items[0].history=s.realms[0].items[0].history.slice(1)
 const hydrated=H.applyStoreV2(s,H.storeV2FromSnapshot(snap('A')))
 assert.equal(hydrated.realms[0].items[0].confirmed,true)
 assert.equal(hydrated.realms[0].items[0].available,2)
})
