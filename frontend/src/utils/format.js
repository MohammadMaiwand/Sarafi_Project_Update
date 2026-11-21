import { presentNumber } from './presentation.js'
const numberValue = (value) => {
  const parsed = Number(String(value ?? 0).replaceAll(',', ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export const formatNumber = value => presentNumber(value)
export const formatDecimal = value => presentNumber(value)
export function roundDecimal(value) {
  const n = numberValue(value)
  return Number.isFinite(n) ? (Math.round((n + Number.EPSILON) * 1000) / 1000).toFixed(3) : '0.000'
}

export function numericInputValue(value) {
  return String(value ?? '').replaceAll(',', '')
}
