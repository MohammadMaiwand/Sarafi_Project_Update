import { AfghanMonthInput } from '../components/AfghanDate'
import { solarMonth, monthRange } from '../utils/calendar'
import { remittanceRequest } from '../remittanceApi'
import { formatAmount } from '../utils/remittance'
import NewTransaction from './NewTransaction'
import useLanguage from '../hooks/useLanguage'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaChartLine, FaCoins, FaDollarSign, FaMoneyBillWave, FaPlus, FaSearch } from 'react-icons/fa'
import { getCustomers, getDashboardStats } from '../api'
import { formatDecimal } from '../utils/format'
import { businessSections } from '../utils/navigation'
import { Link } from 'react-router-dom'

const todayMonth = solarMonth
const card = 'rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900'

export function DashboardFigures({stats}) {
 const {ui}=useLanguage()
  const summary = [
    { label: ui("مجموع تومان"), value: stats?.total_toman, icon: FaMoneyBillWave, accent: 'text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-950/70' },
    { label: ui("مجموع دالر"), value: stats?.total_usd, icon: FaDollarSign, accent: 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/60' },
    { label: ui("مجموع افغانی"), value: stats?.total_afghani, icon: FaCoins, accent: 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/60' },
    { label: ui("نرخ مؤثر افغانی برای یک تومان"), value: stats?.toman_purchase_profit, icon: FaChartLine, accent: 'text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/60', ratio: true },
  ]

 return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summary.map((item) => <div key={item.label} className="stat-card rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-gray-500 dark:text-gray-400">{item.label}</p><span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.accent}`}><item.icon className="h-5 w-5" aria-hidden="true" /></span></div><p className="mt-3 text-xl font-bold tabular-nums text-gray-900 dark:text-white" dir="ltr">{item.value == null ? '—' : item.ratio?formatAmount(item.value):formatDecimal(item.value)}</p></div>)}</div>
}

export default function Dashboard({ tehranOnly = false }) {
  const { ui } = useLanguage();
  const navigate = useNavigate()
  const [month, setMonth] = useState(todayMonth)
  const [stats, setStats] = useState(null)
  const [remittances, setRemittances] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showTransaction, setShowTransaction] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [customerData, statsData] = await Promise.allSettled([getCustomers(), getDashboardStats(month)])
      const errors=[]
      if(customerData.status==='fulfilled')setCustomers(customerData.value.customers||[])
      else errors.push(ui('فهرست مشتریان دریافت نشد.'))
      if(statsData.status==='fulfilled')setStats(statsData.value)
      else errors.push(ui('ارقام داشبورد دریافت نشد؛ اطلاعات صفر نشده است.'))
      if(errors.length)setError(errors.join(' '))
      if (tehranOnly) return
      const {dateFrom,dateBefore}=monthRange(month)
      const dateTo=new Date(new Date(dateBefore+'T12:00:00Z').getTime()-86400000).toISOString().slice(0,10)
      const kinds = ['incoming', 'outgoing', 'provincial-received']
      const results=await Promise.allSettled(kinds.map(async kind=>({kind,...await remittanceRequest(`/${kind}/?pageSize=1&dateFrom=${dateFrom}&dateTo=${dateTo}`)})))
      setRemittances(results.filter(result=>result.status==='fulfilled').map(result=>result.value))
      if(results.some(result=>result.status==='rejected'))setError(current=>`${current} ${ui('بعضی بخش‌های حواله دریافت نشد؛ دوباره تازه‌سازی کنید.')}`.trim())
    } catch { setError("بارگذاری اطلاعات انجام نشد. اتصال سرور را بررسی کنید.") }
    finally { setLoading(false) }
  }, [month, tehranOnly,ui])
  useEffect(() => { refresh() }, [refresh])

  useEffect(() => { window.addEventListener('finance-updated', refresh); return () => window.removeEventListener('finance-updated', refresh) }, [refresh])

  const filteredCustomers = customers.filter((customer) => `${customer.name} ${customer.phone}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))


  return <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 text-start">
    <div className="ui-page-heading dashboard-heading flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-blue-700 dark:text-blue-300">{ui("مدیریت حواله و تبادله")}</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{ui(tehranOnly ? 'دریافتی پول تهران و حواله تهران' : 'داشبورد')}</h1></div><button type="button" onClick={() => setShowTransaction(true)} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"><FaPlus aria-hidden="true" />{ui("ثبت حواله تهران")}</button></div>
    <section className={`${card} monthly-overview p-5`}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-gray-900 dark:text-white">{ui("خلاصهٔ ماهانه")}</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{ui("مجموع معاملات در ماه انتخاب‌شده")}</p></div><label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">{ui("ماه")}<AfghanMonthInput aria-label={ui("انتخاب ماه")}  value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" dir="ltr" /></label></div>
      <DashboardFigures stats={stats?.month===month?stats:null}/>
    </section>
    {error&&<div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700"><p>{error}</p><button type="button" className="rounded-lg border px-4 py-2" onClick={refresh}>{ui('تازه‌سازی')}</button></div>}
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={ui('بخش‌های جدید سیستم')}>{businessSections.map(section=><Link key={section.to} to={section.to} className={`${card} flex min-h-16 items-center justify-between gap-3 px-4 py-3 font-semibold text-blue-800 transition hover:border-blue-400 hover:bg-blue-50 dark:text-blue-200 dark:hover:bg-blue-950`}>{ui(section.label)}<span aria-hidden="true">←</span></Link>)}</section>
    <section className={`${card} overflow-hidden p-0`}><div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800"><div><h2 className="font-semibold text-gray-900 dark:text-white">{ui("دریافتی پول تهران و حواله تهران")}</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{ui("برای دیدن معاملات، مشتری را انتخاب کنید.")}</p></div>{loading && <span className="text-sm text-gray-500">{ui("در حال بارگذاری…")}</span>}</div>
      <div className="customer-search"><FaSearch aria-hidden="true" /><input aria-label={ui("جستجوی مشتری")} type="search" placeholder={ui("جستجو با نام یا شماره تماس")} value={search} onChange={(event) => setSearch(event.target.value)} /><span>{filteredCustomers.length} {ui("مشتری")}</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-start text-sm"><thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-800/60 dark:text-gray-400"><tr><th className="px-5 py-3 font-medium">{ui("نام مشتری")}</th><th className="px-5 py-3 font-medium">{ui("شماره تماس")}</th><th className="px-5 py-3 text-left font-medium">{ui("تومان")}</th><th className="px-5 py-3 text-left font-medium">{ui("دالر")}</th><th className="px-5 py-3 text-left font-medium">{ui("افغانی")}</th><th className="px-5 py-3 text-center font-medium">{ui("عملیات")}</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{filteredCustomers.map((customer) => <tr key={customer.id} tabIndex={0} role="link" onClick={() => navigate(`/customer/${customer.id}`)} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/customer/${customer.id}`) }} className="cursor-pointer text-gray-700 hover:bg-blue-50/70 dark:text-gray-200 dark:hover:bg-gray-800/50"><td className="px-5 py-4 font-medium text-gray-900 dark:text-white">{customer.name}</td><td className="px-5 py-4" dir="ltr">{customer.phone || '—'}</td><td className="px-5 py-4 text-left tabular-nums" dir="ltr">{formatDecimal(customer.total_toman)}</td><td className="px-5 py-4 text-left tabular-nums" dir="ltr">{formatDecimal(customer.total_usd)}</td><td className="px-5 py-4 text-left tabular-nums" dir="ltr">{formatDecimal(customer.total_afghani)}</td><td className="px-5 py-4 text-center"><span className="rounded-md px-2 py-1 text-blue-700 dark:text-blue-300">{ui("مشاهده ←")}</span></td></tr>)}{!loading && filteredCustomers.length === 0 && <tr><td colSpan="6" className="px-5 py-12 text-center text-gray-500 dark:text-gray-400">{search ? ui("مشتری یافت نشد.") : ui("برای شروع یک مشتری اضافه کنید.")}</td></tr>}</tbody></table></div>
    </section>
    <section className="grid gap-3 sm:grid-cols-3">{!tehranOnly && remittances.map(item=><button key={item.kind} onClick={()=>navigate(item.kind==='provincial-received'?'/agency-reports':`/${item.kind}`)} className={`${card} min-w-0 p-5 text-start`}><span className="font-bold">{ui({incoming:'حواله تهران کابل',outgoing:'لیست حواله دریافتی ولایتی','provincial-received':'گزارش نمایندگی‌ها'}[item.kind])}</span><p className="mt-3">{item.count} {ui('حواله')}</p><p className="mt-2 break-words">{formatAmount(item.totalAfn)} {ui('افغانی')}</p></button>)}</section>
    {showTransaction && <NewTransaction modal onClose={() => setShowTransaction(false)} onSaved={() => refresh()} />}
  </main>
}

