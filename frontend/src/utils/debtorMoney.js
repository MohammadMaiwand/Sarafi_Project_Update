import { parseAmount } from './remittance.js'
const rational=value=>{const raw=parseAmount(value);if(!/^\d+(\.\d*)?$/.test(raw))return [0n,1n];const [whole,fraction='']=raw.split('.');return [BigInt(whole+fraction),10n**BigInt(fraction.length)]}
const round=(a,b)=>(a+b/2n)/b
export const cents=value=>{const [a,b]=rational(value);return round(a*100n,b)}
export const fixedCents=value=>`${value<0n?'-':''}${(value<0n?-value:value)/100n}.${String((value<0n?-value:value)%100n).padStart(2,'0')}`
export const fixedMoney=value=>fixedCents(cents(value))
export function debtorAfn(amount,rate){const [a,b]=rational(amount),[r,s]=rational(rate);return fixedCents(round(a*r*100n,b*s))}
export function projectedDebt(customer,kind,amount,initial){
 let balance=cents(customer.remaining_usd)
 if(initial)balance-=cents(initial.payment_usd_amount)*(initial.payment_type==='LOAN'?1n:-1n)
 return balance+cents(amount)*(kind==='LOAN'?1n:-1n)
}
