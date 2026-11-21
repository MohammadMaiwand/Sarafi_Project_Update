import { normalizeDigits,parseAmount,isoDate } from './remittance.js'
const rational=value=>{const raw=parseAmount(value);if(!/^\d+(\.\d*)?$/.test(raw))return [0n,1n];const [whole,fraction='']=raw.split('.');return [BigInt(whole+fraction),10n**BigInt(fraction.length)]}
const round=(a,b)=>b>0n?(a+b/2n)/b:0n
export const fixedUnits=value=>`${value<0n?'-':''}${(value<0n?-value:value)/1000n}.${String((value<0n?-value:value)%1000n).padStart(3,'0')}`
export const units=value=>{const raw=parseAmount(value),negative=raw.startsWith('-');const [a,b]=rational(negative?raw.slice(1):raw);return round(a*1000n,b)*(negative?-1n:1n)}
export function colleagueAmounts(currency,amount,rate){
 const [a,b]=rational(amount),[r,s]=rational(rate)
 if(!a||!r)return {afn:'0.000',usd:'0.000'}
 if(currency==='AFN')return {afn:fixedUnits(round(a*1000n,b)),usd:fixedUnits(round(a*s*1000n,b*r))}
 return {afn:fixedUnits(round(a*r*1000n,b*s)),usd:currency==='USD'?fixedUnits(round(a*1000n,b)):'0.000'}
}
export function candidateBalance(person,kind,afn,initial){
 let result=units(person.remainingAfn)
 if(initial)result-=units(initial.afnAmount)*(initial.transactionType==='RECEIVED'?1n:-1n)
 return result+units(afn)*(kind==='RECEIVED'?1n:-1n)
}
export const allowedBalance=(before,after)=>after>=0n||before<0n&&after>=before
export function colleagueDateParams(filters){
 const result={...filters};delete result.month;delete result.year
 if(filters.dateFrom)result.dateFrom=isoDate(filters.dateFrom)
 if(filters.dateTo)result.dateTo=isoDate(filters.dateTo)
 const month=normalizeDigits(filters.month||'').trim(),year=normalizeDigits(filters.year||'').trim()
 let first,next
 if(month){const match=month.match(/^(\d{4})[/-](\d{1,2})$/);if(!match||Number(match[2])<1||Number(match[2])>12)throw new Error('ماه شمسی را به شکل ۱۴۰۵/۰۸ وارد کنید.');const y=Number(match[1]),m=Number(match[2]);first=`${y}/${m}/01`;next=m===12?`${y+1}/01/01`:`${y}/${m+1}/01`}
 else if(year){if(!/^\d{4}$/.test(year))throw new Error('سال شمسی باید چهار رقم باشد.');first=`${year}/01/01`;next=`${Number(year)+1}/01/01`}
 if(first){result.dateFrom=isoDate(first);const last=new Date(`${isoDate(next)}T12:00:00Z`);last.setUTCDate(last.getUTCDate()-1);result.dateTo=last.toISOString().slice(0,10)}
 if(result.dateFrom&&result.dateTo&&result.dateFrom>result.dateTo)throw new Error('بازه تاریخ معتبر نیست.')
 return result
}
