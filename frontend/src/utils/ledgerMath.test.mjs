import test from 'node:test'
import assert from 'node:assert/strict'
import {ledgerConversion,sumAllocations,projectedBalances} from './ledgerMath.js'
test('Automatic preview computes USD, gross and net from original inputs with exact decimals',()=>{
 const data={amount:'10,000,000',currency:'TOMAN',source_rate:'100000',destination:'AFN',destination_rate:'70',fee:'50',fee_currency:'AFN',collection:'DEDUCTED'}
 assert.deepEqual(ledgerConversion(data),{usd:'100.000',gross:'7000.000',net:'6950.000',destination:'AFN',fee:'50.000'})
 assert.equal(ledgerConversion({...data,amount:'1000000',source_rate:'225',destination_rate:'64.5',fee:'0'}).gross,'286666.667')
 assert.deepEqual(ledgerConversion({amount:'100',currency:'USD',fee:'0'}),{usd:'100.000',gross:null,net:null,destination:null,fee:'0.000'})
 assert.equal(ledgerConversion({...data,source_rate:'0'}),null)
 assert.equal(ledgerConversion({...data,fee_currency:'USD'}),null)
})
test('Allocation receipt total is automatically summed without float errors',()=>{
 assert.equal(sumAllocations({1:'0.1',2:'0.2',3:'1,000.001'}),'1000.301')
 assert.equal(sumAllocations({1:'bad'}),null)
 assert.equal(sumAllocations({}),'0.000')
})

test('Same-currency provincial fees work with and without an optional USD quote',()=>{
 const data={amount:'25000',currency:'AFN',fee:'50',fee_currency:'AFN',collection:'DEDUCTED'}
 assert.deepEqual(ledgerConversion(data),{usd:null,gross:'25000.000',net:'24950.000',destination:'AFN',fee:'50.000'})
 assert.equal(ledgerConversion({...data,source_rate:'50'}).usd,'500.000')
 assert.equal(ledgerConversion({...data,currency:'USD',fee_currency:'USD'}).net,'24950.000')
 assert.equal(ledgerConversion({...data,fee:'26000'}),null)
})
test('Projected balances calculate loan, collection, conversion and currency isolation',()=>{
 const account={balances:[{currency_id:'AFN',bucket:'ACCOUNT',amount:'50000.000'},{currency_id:'USD',bucket:'ACCOUNT',amount:'100.000'}]}
 const receipt={category:'COLLECTION',currency:'AFN',amount:'30000'}
 assert.equal(projectedBalances(account,receipt,null)[0].after,'20000.000')
 assert.equal(projectedBalances({...account,balances:[{currency_id:'AFN',bucket:'ACCOUNT',amount:'20000'}]},{category:'LOAN',currency:'AFN',amount:'10000'},null)[0].after,'30000.000')
 const payment={category:'PAYMENT',amount:'10',currency:'USD',destination:'AFN',source_rate:'1',destination_rate:'70',fee:'0'}
 assert.equal(projectedBalances(account,payment,ledgerConversion(payment))[0].after,'49300.000')
 assert.equal(projectedBalances(account,{...payment,destination_rate:'0'},null).length,0)
 assert.equal(account.balances[1].amount,'100.000')
})
