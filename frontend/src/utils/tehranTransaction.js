import { parseAmount } from './remittance.js'

const roundedDivide = (numerator, denominator) => denominator > 0n ? (numerator + denominator / 2n) / denominator : 0n
const fixed = value => `${value / 1000n}.${String(value % 1000n).padStart(3, '0')}`

export function transactionAmount(value) {
  const raw = parseAmount(value)
  if (!/^\d+(\.\d*)?$/.test(raw)) return '0.000'
  const [whole, fraction = ''] = raw.split('.')
  return fixed(roundedDivide(BigInt(whole + fraction) * 1000n, 10n ** BigInt(fraction.length)))
}

// Calculate from original inputs; round only for storage and display.
export function calculateTehranTransaction(values) {
  if (values.source_currency) return calculateQuotedTransaction(values)
  const scaled = key => BigInt(transactionAmount(values[key]).replace('.', ''))
  const toman = scaled('toman_amount')
  const tomanRate = scaled('toman_rate')
  const afghaniRate = scaled('afghani_rate')
  const usd = roundedDivide(toman * 1000n, tomanRate)
  const afghani = roundedDivide(toman * afghaniRate, tomanRate)
  const profit = toman > 0n ? roundedDivide(afghaniRate * 1000000000n, tomanRate) : 0n
  return { usd: fixed(usd), afghani: fixed(afghani), profit: `${profit / 1000000000n}.${String(profit % 1000000000n).padStart(9, '0')}` }
}

function calculateQuotedTransaction(values) {
  const scale=1000000000000n
  const read=value=>{const raw=parseAmount(value);if(!/^\d+(\.\d*)?$/.test(raw))return 0n;const [a,b='']=raw.split('.');return BigInt(a)*scale+BigInt(b.padEnd(12,'0').slice(0,12))}
  const amount=read(values.toman_amount),rate=values.source_currency==='USD'?scale:read(values.toman_rate)
  const destination=values.destination_currency
  const destRate=destination==='USD'?scale:read(values.afghani_rate)
  const usd=roundedDivide(amount*1000n,rate)
  const gross=destination?roundedDivide(amount*destRate*1000n,rate*scale):0n
  const fee=values.fee_collection==='DEDUCTED'?roundedDivide(read(values.fee_amount)*1000n,scale):0n
  const net=gross>fee?gross-fee:0n
  const deduction=values.fee_collection==='DEDUCTED'?read(values.fee_amount):0n
  const effectiveNumerator=amount*destRate-deduction*rate
  const effective=destination&&amount&&effectiveNumerator>0n?roundedDivide(effectiveNumerator*1000000000n,amount*rate):0n
  return {usd:fixed(usd),afghani:destination?fixed(net):'',profit:destination?`${effective/1000000000n}.${String(effective%1000000000n).padStart(9,'0')}`:''}
}

