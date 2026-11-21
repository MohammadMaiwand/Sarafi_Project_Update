import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LuArrowDownToLine, LuArrowLeft, LuArrowLeftRight, LuBadgeDollarSign, LuBanknote, LuBriefcase, LuClock3, LuCoins, LuContact, LuFileChartColumn, LuGlobe, LuHandshake, LuLandmark, LuMap, LuMapPin, LuReceipt, LuRefreshCw, LuSettings, LuShield, LuTrendingUp, LuUsers, LuWallet } from 'react-icons/lu'
import { AfghanMonthInput } from '../components/AfghanDate'
import DonutChart from '../components/DonutChart'
import { ErrorBanner } from '../remittances/UI'
import { remittanceRequest } from '../remittanceApi'
import { monthTitle, solarMonth } from '../utils/calendar'
import { presentNumber } from '../utils/presentation'
import { reportSections } from '../utils/navigation'
import { shamsi } from '../utils/remittance'
import useLanguage from '../hooks/useLanguage'

// Every card maps to one aggregate returned by /api/dashboard/workspace/ and to
// the registered route of the module that owns the number.
const GROUPS = [
  { id: 'remittances', label: 'عملیات حواله', cards: [
    { key: 'tehran_receipts', label: 'دریافتی و حواله به تهران', icon: LuBanknote, mode: 'amount' },
    { key: 'tehran_kabul_remaining', label: 'حواله تهران کابل', icon: LuArrowLeftRight, mode: 'amount' },
    { key: 'provincial_net', label: 'حواله ولایتی', icon: LuMapPin, mode: 'amount' },
    { key: 'provincial_incoming', label: 'دریافتی ولایتی', icon: LuArrowDownToLine, mode: 'amount' },
    { key: 'unpaid_remittances', label: 'حواله‌های پرداخت‌نشده', icon: LuClock3, mode: 'count', unitLabel: 'حواله' },
    { key: 'identity_exceptions', label: 'نواقص هویت و تماس', icon: LuContact, mode: 'count', unitLabel: 'رکورد' },
  ]},
  { id: 'customers', label: 'مشتریان و همکاران', cards: [
    { key: 'debtors', label: 'مشتری‌های بدهکار', icon: LuUsers, mode: 'count', unitLabel: 'حساب', detail: (metric, ui) => metric?.amount ? `${presentNumber(metric.amount)} ${metric.amount_unit || ''} ${ui('بدهی').trim()}` : null, detailDir: 'ltr' },
    { key: 'colleagues', label: 'گرفت و پرداخت همکاران', icon: LuHandshake, mode: 'amount' },
    { key: 'customer_deposits', label: 'امانت مشتریان', icon: LuShield, mode: 'count', unitLabel: 'حساب' },
  ]},
  { id: 'finance', label: 'امور مالی', cards: [
    { key: 'financial_accounts', label: 'حساب‌های مالی', icon: LuWallet, mode: 'amount' },
    { key: 'kabul_debtors', label: 'بدهکاران کابل', icon: LuMap, mode: 'amount' },
    { key: 'iran_debtors', label: 'بدهکاران ایران', icon: LuGlobe, mode: 'amount' },
    { key: 'creditors', label: 'طلبکاران', icon: LuBadgeDollarSign, mode: 'amount' },
    { key: 'deposit_liability', label: 'امانت‌ها و سپرده‌ها', icon: LuLandmark, mode: 'amount' },
    { key: 'mudarabah', label: 'مضاربه', icon: LuBriefcase, mode: 'count', unitLabel: 'قرارداد' },
    { key: 'expenses', label: 'مصارف', icon: LuReceipt, mode: 'amount' },
  ]},
  { id: 'reports', label: 'گزارش‌ها', cards: [
    { key: 'reports_center', label: 'مرکز گزارش‌های مالی', icon: LuFileChartColumn, mode: 'count', unitLabel: 'گزارش', route: '/agency-reports', local: () => ({ state: 'ok', unit: 'count', value: reportSections.length, route: '/agency-reports' }) },
    { key: 'profit', label: 'مفاد', icon: LuTrendingUp, mode: 'status' },
    { key: 'capital', label: 'سرمایه', icon: LuCoins, mode: 'status' },
  ]},
  { id: 'settings', label: 'تنظیمات', cards: [
    { key: 'settings', label: 'تنظیمات شخصی‌سازی', icon: LuSettings, mode: 'status', route: '/settings' },
  ]},
]

function metricOf(card, data) {
  if (card.local) return card.local(data)
  return data?.metrics?.[card.key]
}

function MetricCard({ card, metric, groupId }) {
  const { ui } = useLanguage()
  const Icon = card.icon
  const statusOnly = card.mode === 'status' || (metric && metric.state !== 'ok')
  const route = metric?.route || card.route
  const value = statusOnly ? (metric?.label || metric?.value || '—') : presentNumber(metric?.value)
  const unit = statusOnly ? '' : card.mode === 'count' ? (card.unitLabel || 'مورد') : (metric?.unit || '')
  const detail = statusOnly ? null : card.detail?.(metric, ui)
  const body = <>
    <span className="flex min-w-0 items-start justify-between gap-3">
      <span className="flex min-w-0 items-center gap-3">
        <span className="ws-card-icon" aria-hidden="true"><Icon/></span>
        <span className="ws-card-label">{ui(card.label)}</span>
      </span>
      {route && <LuArrowLeft className="ws-card-arrow" aria-hidden="true"/>}
    </span>
    <span dir="ltr" className="ws-card-value">{value}{unit && <small className="ws-card-unit">{ui(unit)}</small>}</span>
    {detail && <span className="ws-card-detail" dir={card.detailDir}>{detail}</span>}
  </>
  const className = `ws-card ws-card--${groupId}`
  return route ? <Link to={route} className={className}>{body}</Link> : <div className={`${className} ws-card--static`}>{body}</div>
}

function stampLabel(date) {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kabul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kabul', hour: '2-digit', minute: '2-digit' }).format(date)
  return `${shamsi(iso)} ${time}`
}

export default function WorkspaceDashboard() {
  const { ui, lang } = useLanguage()
  const [month, setMonth] = useState(solarMonth)
  const [currency, setCurrency] = useState('AFN')
  const query = useQuery({
    queryKey: ['dashboard', 'workspace', month, currency],
    queryFn: ({ signal }) => remittanceRequest(`/dashboard/workspace/?month=${encodeURIComponent(month)}&currency=${encodeURIComponent(currency)}`, null, 'GET', signal),
  })
  const { data, error, isLoading, isFetching, refetch, dataUpdatedAt } = query

  useEffect(() => {
    const onUpdate = () => refetch()
    window.addEventListener('finance-updated', onUpdate)
    return () => window.removeEventListener('finance-updated', onUpdate)
  }, [refetch])

  const updatedAt = data ? new Date(dataUpdatedAt) : null
  const period = data?.period
  const provincial = data?.charts?.provincial
  const payments = data?.charts?.payments

  return <main className="ws-page">
    <header className="ws-header">
      <div className="min-w-0">
        <p className="ws-header-eyebrow">{ui('فضای کاری امیری')}</p>
        <h1 className="ws-header-title">{ui('داشبورد مالی')}</h1>
        <p className="ws-header-period">{ui('دوره گزارش')}: <b>{monthTitle(month, lang === 'en')}</b>{period && <> · {shamsi(period.from)} {ui('تا')} {shamsi(period.to)}</>} · <b dir="ltr">{currency}</b></p>
      </div>
      <div className="ws-controls">
        <label className="ws-control"><span className="ws-control-label">{ui('ماه شمسی')}</span><AfghanMonthInput value={month} onChange={event => setMonth(event.target.value)} className="ws-control-input" disabled={isLoading}/></label>
        <label className="ws-control"><span className="ws-control-label">{ui('واحد پول')}</span>
          <select className="ws-control-input" value={currency} onChange={event => setCurrency(event.target.value)} disabled={isLoading}>
            {(data?.currencies?.length ? data.currencies : [currency]).map(code => <option key={code} value={code}>{code}</option>)}
          </select>
        </label>
        <button type="button" className="ws-refresh" onClick={() => refetch()} disabled={isFetching}>
          <LuRefreshCw aria-hidden="true" className={isFetching ? 'ws-spin' : ''}/>{ui(isFetching ? 'در حال تازه‌سازی' : 'تازه‌سازی')}
        </button>
        {updatedAt && <p className="ws-updated">{ui('آخرین به‌روزرسانی موفق')}: <span dir="ltr">{stampLabel(updatedAt)}</span></p>}
      </div>
    </header>

    {!data && isLoading && <p role="status" className="ws-status">{ui('در حال بارگذاری داشبورد…')}</p>}
    {!data && error && <ErrorBanner error={error} onRetry={() => refetch()}/>}
    {data && error && <div role="alert" className="ws-stale">{ui('تازه‌سازی ناموفق بود؛ ارقام نشان‌داده‌شده مربوط به آخرین به‌روزرسانی موفق است.')} {updatedAt && <span dir="ltr">{stampLabel(updatedAt)}</span>}</div>}

    {data && <>
      <section className="ws-charts">
        <DonutChart title="گردش حواله ولایتی" tone="provincial" total={provincial?.total} centerUnit={currency} centerLabel="مجموع گردش"
          segments={[
            { label: 'حواله رفت', value: provincial?.outgoing, color: '#087B69', unit: currency },
            { label: 'حواله آمد', value: provincial?.incoming, color: '#71BCAE', unit: currency },
          ]}
          footer={<span className="ws-chart-net">{ui('ماندهٔ ماه')}: <b dir="ltr">{presentNumber(provincial?.net)} {currency}</b></span>}
          actionHref={provincial?.route || '/provincial-remittances'} actionLabel="مشاهدهٔ حواله‌ها"/>
        <DonutChart title="وضعیت پرداخت حواله‌ها" tone="payments" total={payments?.total} centerUnit="حواله" centerLabel="صادرشده در این ماه"
          segments={[
            { label: 'تکمیل‌شده', value: payments?.completed, color: '#5B48AA' },
            { label: 'پرداخت‌نشده یا قسمی', value: payments?.open, color: '#D6A458' },
          ]}
          footer={ui('این چارت فقط حواله‌های صادرشده در ماه انتخابی را می‌سنجد؛ کارت «حواله‌های پرداخت‌نشده» حواله‌های قدیمی‌تر را نیز دربر می‌گیرد.')}
          actionHref={payments?.route || '/unpaid-remittances'} actionLabel="فهرست پرداخت‌نشده‌ها"/>
      </section>

      {GROUPS.map(group => <section key={group.id} className="ws-group" aria-label={ui(group.label)}>
        <h2 className="ws-group-title">{ui(group.label)}</h2>
        <div className="ws-grid" data-group={group.id}>
          {group.cards.map(card => <MetricCard key={card.key} card={card} metric={metricOf(card, data)} groupId={group.id}/>)}
        </div>
      </section>)}
    </>}
  </main>
}
