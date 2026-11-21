import { presentNumber } from './presentation.js'
import { businessToday, solarMonth } from './calendar.js'
export const financeNumber = value => presentNumber(value)

export function financeRaw(value) {
  const number = Number(String(value ?? 0).replaceAll(',', ''))
  return Number.isFinite(number) ? number : 0
}

export function financeRound(value, decimals = 2) {
  return financeRaw(value).toFixed(decimals)
}

export const currentMonth = solarMonth
export const currentDate = businessToday
