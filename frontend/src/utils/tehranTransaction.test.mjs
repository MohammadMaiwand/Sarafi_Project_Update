import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateTehranTransaction, transactionAmount } from './tehranTransaction.js'
import { formatNumber } from './format.js'

test('Spreadsheet example and rate units remain explicit', () => {
  assert.deepEqual(calculateTehranTransaction({toman_amount:'1000000',toman_rate:'225.000',afghani_rate:'64.5'}), {usd:'4444.444',afghani:'286666.667',profit:'0.286666667'})
  assert.deepEqual(calculateTehranTransaction({toman_amount:'1000000',toman_rate:'225,000',afghani_rate:'64.5'}), {usd:'4.444',afghani:'286.667',profit:'0.000286667'})
})

test('Tehran formulas use original inputs and preserve nine decimal places for the ratio', () => {
  assert.deepEqual(calculateTehranTransaction({toman_amount:'1,000',toman_rate:'3',afghani_rate:'70'}), {usd:'333.333',afghani:'23333.333',profit:'23.333333333'})
  assert.deepEqual(calculateTehranTransaction({toman_amount:'2000',toman_rate:'4',afghani_rate:'70'}), {usd:'500.000',afghani:'35000.000',profit:'17.500000000'})
})
test('Missing and zero divisors clear calculated results', () => {
  for (const toman_rate of ['', '0']) assert.deepEqual(calculateTehranTransaction({toman_amount:'1000',toman_rate,afghani_rate:'70'}), {usd:'0.000',afghani:'0.000',profit:'0.000000000'})
  for (const toman_amount of ['', '0']) assert.deepEqual(calculateTehranTransaction({toman_amount,toman_rate:'3',afghani_rate:'70'}), {usd:'0.000',afghani:'0.000',profit:'0.000000000'})
  assert.deepEqual(calculateTehranTransaction({toman_amount:'1000',toman_rate:'3',afghani_rate:''}), {usd:'333.333',afghani:'0.000',profit:'0.000000000'})
})
test('Half-up rounding and comma-separated inputs match the server', () => {
  assert.equal(calculateTehranTransaction({toman_amount:'1',toman_rate:'2000',afghani_rate:'1'}).usd,'0.001')
  assert.equal(transactionAmount('1,234.5675'),'1234.568')
  assert.equal(transactionAmount('۱۲۳٫۴۵۶'),'123.456')
})
test('formatNumber follows shared display policy regardless of legacy precision argument', () => {
  assert.equal(formatNumber('1,250,000'),'1,250,000')
  assert.equal(formatNumber('1250000',3),'1,250,000')
  assert.equal(formatNumber('0',3),'0')
})
