import test from 'node:test'
import assert from 'node:assert/strict'
import {debtorAfn,projectedDebt,fixedCents,cents} from './debtorMoney.js'
test('Original and event AFN use exact half-up rounding to cents',()=>{
 assert.equal(debtorAfn('5,000','64'),'320000.00')
 assert.equal(debtorAfn('0.01','0.45'),'0.00')
 assert.equal(debtorAfn('0.01','0.50'),'0.01')
 assert.equal(debtorAfn('۱۰۰','۶۴'),'6400.00')
})
test('Loan adds and payment subtracts from debt',()=>{
 assert.equal(fixedCents(projectedDebt({remaining_usd:'5000'},'LOAN','1000')),'6000.00')
 assert.equal(fixedCents(projectedDebt({remaining_usd:'5000'},'PAYMENT','1000')),'4000.00')
 assert.equal(fixedCents(projectedDebt({remaining_usd:'5000'},'PAYMENT','6000')),'-1000.00')
})
test('Editing excludes the original event before applying replacement',()=>{
 assert.equal(fixedCents(projectedDebt({remaining_usd:'4000'},'PAYMENT','500',{payment_type:'PAYMENT',payment_usd_amount:'1000'})),'4500.00')
 assert.equal(fixedCents(projectedDebt({remaining_usd:'20'},'LOAN','50',{payment_type:'LOAN',payment_usd_amount:'100'})),'-30.00')
 assert.equal(cents('1000.01'),100001n)
})
