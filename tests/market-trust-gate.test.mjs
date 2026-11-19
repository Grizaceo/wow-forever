import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createMarketSync} from '../desktop/src/mercado-auto.js'
import S from '../standalone/market-source.js'
test('self-labelled JSON never authenticates its own provenance',async()=>{
 let touched=false
 const sync=createMarketSync({storage:{get:async()=>false,set:async()=>{}}},{read:async()=>{touched=true;throw Error('unexpected')}})
 const r=await sync.importSeparateSource(JSON.stringify({schema:S.SCHEMA,identity:{provenance:{confidence:'verified'}}}))
 assert.equal(r.status,'blocked');assert.equal(touched,false);sync.dispose()
 assert.throws(()=>S.parseSeparateSourceObservations('{}'),/adaptador/)
})
