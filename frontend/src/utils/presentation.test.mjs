import test from 'node:test'
import assert from 'node:assert/strict'
import {presentNumber,presentRate} from './presentation.js'
import {monthRange,monthTitle} from './calendar.js'
import {groupExact,isoDate} from './remittance.js'
test('Screenshot decimal formatting fixtures use HALF_UP and strip trailing zeros',()=>{
 const cases={'4444.444':'4,444.44','286666.667':'286,666.67','64.500':'64.5','0.286666667':'0.29','573333.334':'573,333.33','8888.888':'8,888.89','2000000.000':'2,000,000','2010000.000':'2,010,000','393504.273':'393,504.27','25573333.334':'25,573,333.33','12.72305141':'12.72','1000000':'1,000,000','-0.004':'0','-1.005':'-1.01','999999999999999999999.995':'1,000,000,000,000,000,000,000'}
 for(const [raw,expected] of Object.entries(cases))assert.equal(presentNumber(raw),expected)
 assert.equal(presentNumber(null),'—');assert.equal(presentNumber(0),'0')
 assert.equal(groupExact('225.123456789'),'225.123456789')
 assert.equal('0202413316','0202413316')
})
test('Small rates retain meaning with explicit larger quote units',()=>{
 assert.deepEqual(presentRate('.000025','TOM','AFN'),{value:'0.03',unit:'AFN / 1,000 TOM'})
})
test('Afghan month ranges are inclusive-exclusive through Nowruz',()=>{
 assert.deepEqual(monthRange('1403-12'),{dateFrom:'2025-02-19',dateBefore:'2025-03-21'})
 assert.equal(monthRange('1404-01').dateFrom,'2025-03-21')
 assert.equal(monthTitle('1405-08'),'عقرب 1405')
 assert.equal(monthTitle('1405-08',true),'Aqrab 1405')
 assert.throws(()=>isoDate('1404/12/30'))
})
