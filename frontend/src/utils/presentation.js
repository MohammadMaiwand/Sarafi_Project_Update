// Presentation only: decimal HALF_UP, at most two places. Arithmetic and inputs
// retain their own precision. Strings that are identifiers must never use this.
export function presentNumber(value) {
  if (value === null || value === undefined || value === '') return '—'
  const raw = String(value).replaceAll(',', '').trim()
  const match = raw.match(/^(-?)(\d+)(?:\.(\d*))?$/)
  if (!match) return '—'
  const [, sign, whole, fraction = ''] = match
  let cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2))
  if ((fraction[2] || '0') >= '5') cents++
  const decimals = String(cents % 100n).padStart(2, '0').replace(/0+$/, '')
  return `${sign && cents ? '-' : ''}${String(cents / 100n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${decimals ? '.' + decimals : ''}`
}

export function presentRate(value, base, quote,baseQuantity=1) {
  if (value === null || value === undefined || value === '') return {value:'—',unit:`${quote} / ${base}`}
  const raw = String(value).replace(/^\./,'0.')
  const match = raw.match(/^(\d+)(?:\.(\d*))?$/)
  if (!match) return {value:'—',unit:`${quote} / ${base}`}
  let unit = 1n, scaled = BigInt(match[1] + (match[2] || ''))
  const denominator = 10n ** BigInt((match[2] || '').length)
  while (scaled > 0n && scaled * unit * 100n < denominator && unit < 1000000000000n) unit *= 1000n
  const digits = (match[2] || '').length
  const expanded = String(scaled * unit).padStart(digits + 1,'0')
  return {value:presentNumber(digits ? expanded.slice(0,-digits)+'.'+expanded.slice(-digits) : expanded),unit:`${quote} / ${presentNumber(unit*BigInt(baseQuantity))} ${base}`}
}
