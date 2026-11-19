// Regressions found by parent review. Synthetic, never game/account data.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import I from '../standalone/market-identity.js'
import C from '../standalone/market-compare.js'
const id = (pool, extra={}) => I.accreditedIdentity({game:'wow-forever',region:'us',ruleset:'PvE',auctionPool:pool,postingChannel:pool,localScope:'test',rawSourceKey:pool,fromDay:2500,toDay:2500,sourceLabel:'synthetic',verifiedAt:'2026-11-16T20:00:00Z',...extra})
const row = (key,price=100) => ({sourceKey:key,itemId:Number(key),unitPriceCopper:price,observedDay:2500,confirmed:true,coverage:{itemRows:1,scannedRows:1}})
const pool = (name, rows) => ({id:name,identity:id(name),rows})
test('distinct accredited pools within one region/ruleset are comparable',()=>{
 assert.equal(I.canCompare(id('capital'),id('neutral')),true)
 assert.equal(C.compare([pool('capital',[row('1')]),pool('neutral',[row('1',120)])],{todayDay:2500}).status,'comparable')
})
test('B-only observations do not crash or treat missing A as zero',()=>{
 const r=C.compare([pool('capital',[row('1')]),pool('neutral',[row('2')])],{todayDay:2500})
 assert.equal(r.rows.length,2)
 assert.equal(r.rows.find(r=>r.sourceKey==='2').a,null)
 assert.ok(r.rows.every(r=>r.deltaCopper===null && r.recommendation===null))
})
test('duplicate exact variants rejected, rather than last writer wins',()=>{
 const r=C.compare([pool('capital',[row('1'),row('1',200)])],{todayDay:2500})
 assert.equal(r.status,'blocked')
})
test('same pool cannot be presented as independent unequal price series',()=>{
 const r=C.compare([pool('capital',[row('1')]),{...pool('capital',[row('1',120)]),id:'B'}],{todayDay:2500})
 assert.equal(r.status,'blocked')
})
test('future commission cannot authorize net comparison',()=>{
 const rate={rateBps:500,verified:true,sourceLabel:'synthetic',asOfDay:2501}
 const r=C.compare([pool('capital',[row('1')]),pool('neutral',[row('1',120)])],{todayDay:2500,commission:{capital:rate,neutral:rate}})
 assert.equal(r.rows[0].netScenario,true)
 assert.equal(r.rows[0].recommendation,null)
})
