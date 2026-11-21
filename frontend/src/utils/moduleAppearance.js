import { LuArrowLeftRight, LuChartNoAxesCombined, LuContact, LuHandshake, LuLandmark, LuMapPin, LuReceipt, LuSettings, LuShield, LuUsers, LuWallet, LuClock3 } from 'react-icons/lu'

// Presentation metadata only; permissions, routes and queries remain owned by their modules.
export function moduleAppearance(path) {
  if (/^\/(agency-reports|toman-profit)/.test(path)) return { icon: LuChartNoAxesCombined, tone: 'reports' }
  if (/^\/(settings|personalization)/.test(path)) return { icon: LuSettings, tone: 'reports' }
  if (path.startsWith('/identity-review')) return { icon: LuContact, tone: 'customers' }
  if (path.startsWith('/unpaid-remittances')) return { icon: LuClock3, tone: 'remittances' }
  if (path.startsWith('/colleagues')) return { icon: LuHandshake, tone: 'customers' }
  if (/^\/(debtors|customer)/.test(path)) return { icon: LuUsers, tone: 'customers' }
  if (/^\/(custody|deposits)/.test(path)) return { icon: LuShield, tone: 'finance' }
  if (path.startsWith('/expenses')) return { icon: LuReceipt, tone: 'finance' }
  if (path.startsWith('/mudarabah')) return { icon: LuLandmark, tone: 'finance' }
  if (/^\/(financial-accounts|creditors)/.test(path)) return { icon: LuWallet, tone: 'finance' }
  if (/^\/(provincial|outgoing)/.test(path)) return { icon: LuMapPin, tone: 'remittances' }
  return { icon: LuArrowLeftRight, tone: 'remittances' }
}
