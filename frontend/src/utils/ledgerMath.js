import {parseAmount} from './remittance.js'

const SCALE=1000000000000n
function decimal(value,places=12){
 const raw=parseAmount(value).replace(/^\./,'0.'),match=raw.match(/^(-?)(\d+)(?:\.(\d*))?$/)
 if(!match)return null
 const fraction=(match[3]||'').replace(/0+$/,'')
 if(fraction.length>places)return null
 return (match[1]?-1n:1n)*(BigInt(match[2])*10n**BigInt(places)+BigInt(fraction.padEnd(places,'0')))
}
function fixed(value,places=3){const scale=10n**BigInt(places),sign=value<0n?'-':'';value=value<0n?-value:value;return `${sign}${value/scale}.${String(value%scale).padStart(places,'0')}`}
const divide=(a,b)=>b>0n?(a+b/2n)/b:0n

export function sumAllocations(values){
 let total=0n
 for(const value of Object.values(values)){if(value==='')continue;const amount=decimal(value,3);if(amount===null||amount<0n)return null;total+=amount}
 return fixed(total)
}

export function ledgerConversion(data){
 const amount=decimal(data.amount,3)
 if(amount===null||amount<=0n)return null
 const source=data.currency==='USD'?SCALE:decimal(data.source_rate)
 if(!data.destination&&((data.currency!=='USD'&&!parseAmount(data.source_rate))||data.collection==='DEDUCTED')){
  const fee=decimal(data.fee||'0',3)
  if(fee===null||fee<0n||data.collection==='DEDUCTED'&&data.fee_currency!==data.currency)return null
  const net=amount-(data.collection==='DEDUCTED'?fee:0n)
  if(net<0n)return null
  return {usd:source&&source>0n?fixed(divide(amount*SCALE,source)):null,gross:fixed(amount),net:fixed(net),destination:data.currency,fee:fixed(fee)}
 }
 if(source===null||source<=0n)return null
 const destination=data.destination?(data.destination==='USD'?SCALE:decimal(data.destination_rate)):null
 if(data.destination&&(destination===null||destination<=0n))return null
 const fee=decimal(data.fee||'0',3)
 if(fee===null||fee<0n)return null
 if(data.collection==='DEDUCTED'&&(!data.destination||data.fee_currency!==data.destination))return null
 const usd=divide(amount*SCALE,source)
 const gross=destination===null?null:divide(amount*destination,source)
 const net=gross===null?null:gross-(data.collection==='DEDUCTED'?fee:0n)
 if(net!==null&&net<0n)return null
 return {usd:fixed(usd),gross:gross===null?null:fixed(gross),net:net===null?null:fixed(net),destination:data.destination||null,fee:fixed(fee)}
}

export function projectedBalances(account,data,preview){
 if(!account)return []
 if(data.destination&&!preview)return []
 const balance=(currency,bucket='ACCOUNT')=>decimal(account.balances?.find(row=>row.currency_id===currency&&row.bucket===bucket)?.amount||'0',3)
 const amount=decimal(data.amount,3)
 if(amount===null||amount<0n)return []
 const net=preview?.net===null||preview?.net===undefined?amount:decimal(preview.net,3)
 if(net===null)return []
 const destination=data.destination||data.currency
 const row=(currency,change,bucket='ACCOUNT')=>{const current=balance(currency,bucket);return current===null?null:{currency,bucket,current:fixed(current),after:fixed(current+change)}}
 let rows=[]
 if(data.category==='CONVERT')rows=data.destination&&preview?.net?[row(data.currency,-amount),row(destination,net)]:[]
 else if(['PROVINCIAL_IN','PROVINCIAL_OUT','TEHRAN_REMITTANCE'].includes(data.category)){
  rows=[row(destination,net,'BENEFICIARY')]
  if(data.agency||account.agency)rows.push(row(destination,data.category==='PROVINCIAL_IN'?net:-net,'AGENCY'))
 }else if(data.category==='BENEFICIARY_PAYOUT')rows=[row(data.currency,-amount,'BENEFICIARY')]
 else if(['AGENCY_RECEIPT','AGENCY_PAYMENT'].includes(data.category))rows=[row(data.currency,data.category==='AGENCY_RECEIPT'?-amount:amount,'AGENCY')]
 else if(['OPENING','LOAN','OBLIGATION','DEPOSIT','RECEIPT','PUBLIC_DEPOSIT','COLLEAGUE_DEPOSIT','TEHRAN_RECEIPT'].includes(data.category))rows=[row(data.currency,amount)]
 else if(['COLLECTION','PAYMENT','RELEASE','DISTRIBUTION','SALARY','EXPENSE','CUSTOMER_LOAN','COLLEAGUE_LOAN'].includes(data.category))rows=[row(['COLLECTION','PAYMENT'].includes(data.category)?destination:data.currency,-(['COLLECTION','PAYMENT'].includes(data.category)?net:amount))]
 return rows.filter(Boolean)
}
