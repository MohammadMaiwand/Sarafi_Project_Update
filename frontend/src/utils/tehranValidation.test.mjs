import test from 'node:test'
import assert from 'node:assert/strict'
import { validateTehranForm } from './tehranValidation.js'

const form = {customer_name:'Test',voucher_number:'201',toman_amount:'1000000',toman_rate:'225',afghani_rate:'64.5',expense:'کرایه و مصرف انتقال'}
test('Valid financial values accept descriptive expense and Shamsi date',()=>{
  assert.deepEqual(validateTehranForm(form,'1405/08/15',''),{})
})
test('Missing customer, number, invalid date and rates identify specific fields',()=>{
  const errors=validateTehranForm({...form,customer_name:' ',voucher_number:'',toman_amount:'0',toman_rate:'abc',afghani_rate:'-2'},'1405/13/40','')
  for(const key of ['customer_name','voucher_number','date','toman_amount','toman_rate','afghani_rate']) assert.ok(errors[key],key)
})
test('Existing customers do not require identity re-entry; computed overflow is flagged',()=>{
  assert.deepEqual(validateTehranForm({...form,customer_name:''},'1405/08/15',3),{})
  assert.ok(validateTehranForm({...form,toman_amount:'999999999999.999',toman_rate:'0.001'},'1405/08/15',3).toman_rate)
})
