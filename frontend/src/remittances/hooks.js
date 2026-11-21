import { useEffect, useState } from 'react'
import { isoDate, normalizeDigits } from '../utils/remittance'
export function useDebounced(value,delay=350){
 const [debounced,setDebounced]=useState(value)
 useEffect(()=>{const timer=setTimeout(()=>setDebounced(value),delay);return()=>clearTimeout(timer)},[value,delay])
 return debounced
}
export function filterParams(filters){
 const result={...filters}
 if(result.dateFrom)result.dateFrom=isoDate(result.dateFrom)
 if(result.dateTo)result.dateTo=isoDate(result.dateTo)
 if(result.year){
  const year=normalizeDigits(result.year)
  if(!/^\d{4}$/.test(year))throw new Error('سال شمسی باید چهار رقم باشد.')
  result.dateFrom=isoDate(`${year}/01/01`)
  const next=new Date(`${isoDate(`${Number(year)+1}/01/01`)}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate()-1);result.dateTo=next.toISOString().slice(0,10)
 }
 if(result.dateFrom&&result.dateTo&&result.dateFrom>result.dateTo)throw new Error('بازه تاریخ معتبر نیست.')
 delete result.year
 return result
}
