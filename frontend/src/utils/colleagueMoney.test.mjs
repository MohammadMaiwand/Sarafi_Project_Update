import test from 'node:test'
import assert from 'node:assert/strict'
import {colleagueAmounts,candidateBalance,allowedBalance,units,fixedUnits,colleagueDateParams} from './colleagueMoney.js'
test('USD, AFN and Toman use the agreed conversion rules',()=>{
 assert.deepEqual(colleagueAmounts('USD','100','70'),{afn:'7000.000',usd:'100.000'})
 assert.deepEqual(colleagueAmounts('AFN','7000','70'),{afn:'7000.000',usd:'100.000'})
 assert.deepEqual(colleagueAmounts('TOMAN','1,000,000','0.0025'),{afn:'2500.000',usd:'0.000'})
 assert.deepEqual(colleagueAmounts('AFN','1000','3'),{afn:'1000.000',usd:'333.333'})
 assert.equal(colleagueAmounts('USD','1','0.0005').afn,'0.001')
})
test('Editing excludes original amount and blocks negative balance',()=>{
 const person={remainingAfn:'500'}
 assert.equal(fixedUnits(candidateBalance(person,'PAID','1000',{transactionType:'PAID',afnAmount:'2000'})),'1500.000')
 assert.equal(allowedBalance(units('500'),candidateBalance(person,'PAID','501')),false)
 assert.equal(allowedBalance(units('-1000'),units('-900')),true)
 assert.equal(allowedBalance(units('-1000'),units('-1100')),false)
})
test('Shamsi month and year convert to inclusive ISO periods',()=>{
 let result=colleagueDateParams({month:'۱۴۰۳/۱۲',year:'',dateFrom:'',dateTo:''})
 assert.equal(result.dateFrom,'2025-02-19');assert.equal(result.dateTo,'2025-03-20')
 result=colleagueDateParams({month:'',year:'1404',dateFrom:'',dateTo:''})
 assert.equal(result.dateFrom,'2025-03-21');assert.equal(result.dateTo,'2026-03-20')
 assert.throws(()=>colleagueDateParams({month:'1405/13'}))
 assert.throws(()=>colleagueDateParams({dateFrom:'1405/08/15',dateTo:'1405/08/14'}))
})
