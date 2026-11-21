import test from 'node:test'
import assert from 'node:assert/strict'
import {isoDate,shamsi,amountWords,calculateAfn,normalizeDigits,parseAmount,formatAmount} from './remittance.js'

test('Shamsi dates round-trip and accept Dari digits',()=>{
 assert.equal(isoDate('۱۴۰۵/۰۸/۱۴'),'2026-11-05')
 assert.equal(shamsi('2026-11-05'),'1405/08/14')
 assert.equal(isoDate('1403/12/30'),'2025-03-20')
 assert.equal(isoDate('1404/01/01'),'2025-03-21')
})
test('Invalid leap days, months and malformed dates are rejected',()=>{
 for(const date of ['1405/12/30','1405/13/01','1405/07/31','1405/00/01','bad','1405/01/00'])assert.throws(()=>isoDate(date))
})
test('Dari and Arabic digits and separators normalize',()=>{
 assert.equal(normalizeDigits('۱۲٣۴'),'1234')
 assert.equal(parseAmount('۱٬۲۳۴٫۵۶۷'),'1234.567')
 assert.equal(formatAmount('1234567.890'),'1,234,567.89')
})
test('Currency multiplication uses exact decimals and rounds half up',()=>{
 assert.equal(calculateAfn('1000000','0.0025'),'2500.000')
 assert.equal(calculateAfn('123.456','0.12345678'),'15.241')
 assert.equal(calculateAfn('1','0.0005'),'0.001')
 assert.equal(calculateAfn('999999999999999999999','0.001'),'999999999999999999.999')
 assert.equal(calculateAfn('not-a-number','1'),'0.000')
})
test('Dari words include thousandths without floating-point loss',()=>{
 assert.equal(amountWords('0'),'صفر')
 assert.equal(amountWords('123.456'),'صد و بیست و سه و چهارصد و پنجاه و شش هزارم')
 assert.equal(amountWords('1000000'),'یک میلیون')
 assert.equal(amountWords('-1'),'')
 assert.ok(amountWords('999999999999999999999').length>0)
})
