import test from 'node:test'
import assert from 'node:assert/strict'
import {calculateAfnWithBase} from './remittance.js'
import {presentRate} from './presentation.js'
test('Both Tehran Kabul quote examples and the legacy quote unit compute correctly',()=>{
 assert.equal(calculateAfnWithBase('100','70',1),'7000.000')
 assert.equal(calculateAfnWithBase('10000000','.70',1000),'7000.000')
 assert.equal(calculateAfnWithBase('10000000','.0007',1),'7000.000')
 assert.equal(calculateAfnWithBase('10000000','.70',1000),'7000.000')
 assert.deepEqual(presentRate('0.70','TOMAN','AFN',1000),{value:'0.7',unit:'AFN / 1,000 TOMAN'})
 assert.equal(calculateAfnWithBase('1','0.5',1000),'0.001')
})
