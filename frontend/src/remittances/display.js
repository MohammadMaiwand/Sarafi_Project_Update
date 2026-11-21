import {shamsi,formatAmount} from '../utils/remittance'
import {presentRate} from '../utils/presentation'
import {numericFields} from './config'
export function remittanceValue(row,key,ui=text=>text){
 if(key==='transactionDate')return shamsi(row[key])
 if(key==='tomanAmount'&&row.kind==='incoming'&&row.tomanAmountKnown===false)return '—'
 if(key==='afnAmount'&&row.kind==='incoming'&&row.afnAmountKnown===false)return '—'
 if(['afnUsdRate','usdRate'].includes(key)){
  const rate=presentRate(row[key],key==='usdRate'?'USD':'TOMAN','AFN',key==='afnUsdRate'&&row.kind==='incoming'?(row.rateBaseAmount||1):1)
  return `${rate.value} ${rate.unit}`
 }
 if(numericFields.includes(key))return formatAmount(row[key])
 if(key==='manualProfitCurrency'&&row.manualProfit!==null)return row[key]||ui('واحد نامشخص')
 return key==='moneyTransaction'?ui(row[key]):row[key]||'—'
}
