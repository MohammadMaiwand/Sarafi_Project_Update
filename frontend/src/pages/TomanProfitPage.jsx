import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FaCoins } from 'react-icons/fa'
import { AfghanMonthInput } from '../components/AfghanDate'
import { FinancePage, secondaryButton, StatCard, surface } from '../components/FinanceUI'
import { ErrorBanner } from '../remittances/UI'
import { remittanceRequest } from '../remittanceApi'
import { solarMonth } from '../utils/calendar'
import useLanguage from '../hooks/useLanguage'

const displayAmount = value => {
  if (value == null || value === '') return '—'
  const match = String(value).replaceAll(',', '').match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!match) return '—'
  const [, sign, whole, fraction = ''] = match
  const decimals = fraction.replace(/0+$/, '')
  return `${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${decimals ? `.${decimals}` : ''}`
}
const displayRate = displayAmount

export default function TomanProfitPage() {
  const { ui } = useLanguage()
  const [month, setMonth] = useState(solarMonth)
  const query = useQuery({
    queryKey: ['toman-profit', month],
    queryFn: ({ signal }) => remittanceRequest(`/toman-profit/?month=${encodeURIComponent(month)}`, null, 'GET', signal),
  })
  const report = query.data
  const provinces = report?.provinces || []

  return <FinancePage
    title="مفاد تومان"
    subtitle="نرخ خرید از دریافتی تهران و نرخ فروش از توزیع ماهانهٔ هر نمایندگی محاسبه می‌شود."
    icon={FaCoins}
    action={<Link className={secondaryButton} to="/tehran-remittances">{ui('بازگشت به دریافتی تهران')}</Link>}
  >
    <section className={`${surface} flex flex-wrap items-center justify-between gap-4 p-4`}>
      <div><h2 className="font-bold">{ui('گزارش ماهانهٔ مفاد تومان')}</h2><p className="mt-1 text-sm text-gray-500">{ui('دوره بر اساس ماه هجری شمسی است و با فیلتر دریافتی تهران هم‌خوانی دارد.')}</p></div>
      <label className="flex items-center gap-2 text-sm font-semibold">{ui('ماه')}
        <AfghanMonthInput value={month} onChange={event => setMonth(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" dir="ltr"/>
      </label>
    </section>
    <ErrorBanner error={query.error} onRetry={() => query.refetch()}/>
    {query.isFetching && <p role="status" className="text-sm text-gray-500">{ui('در حال محاسبهٔ گزارش…')}</p>}
    {report && <>
      <section className={`${surface} grid gap-4 p-4 sm:grid-cols-3`}>
        <div><p className="text-sm font-semibold text-gray-500">{ui('خرید تومان در تهران')}</p><p dir="ltr" className="mt-2 text-lg font-bold">{displayAmount(report.tehran_purchase.toman)} TOMAN</p><p dir="ltr" className="mt-1 text-sm">{displayAmount(report.tehran_purchase.afn)} AFN</p></div>
        <div><p className="text-sm font-semibold text-gray-500">{ui('نرخ خرید تهران')}</p><p dir="ltr" className="mt-2 text-lg font-bold">{displayRate(report.tehran_purchase.rate_per_1000)} AFN / 1,000 TOMAN</p></div>
        <div><p className="text-sm font-semibold text-gray-500">{ui('ماه گزارش')}</p><p dir="ltr" className="mt-2 text-lg font-bold">{report.month}</p><p className="mt-1 text-xs text-gray-500">{report.dateFrom} {ui('تا پیش از')} {report.dateBefore}</p></div>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="تومان دریافتی نمایندگی‌ها" value={displayAmount(report.totals.received_toman)} suffix=" TOMAN" accent="blue"/>
        <StatCard label="تومان توزیع‌شدهٔ همهٔ نمایندگی‌ها" value={displayAmount(report.totals.distributed_toman)} suffix=" TOMAN" accent="violet"/>
        <StatCard label="مفاد تومان مجموعه" value={displayAmount(report.totals.profit_afn)} suffix=" AFN" accent="emerald"/>
      </section>
      <p className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-7 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
        {ui('نرخ خرید تهران = مجموع افغانی ÷ مجموع تومان × ۱٬۰۰۰.')}
        {' '}{ui('نرخ فروش نمایندگی = افغانی توزیع‌شده ÷ تومان توزیع‌شده × ۱٬۰۰۰.')}
        {' '}{ui('مفاد نمایندگی = (نرخ خرید تهران − نرخ فروش نمایندگی) × تومان توزیع‌شده ÷ ۱٬۰۰۰.')}
        {' '}{ui('نرخ فروش پایین‌تر از خرید مفاد مثبت می‌دهد؛ نرخ بالاتر زیان را با مقدار منفی نشان می‌دهد.')}
      </p>
      <section className={`${surface} overflow-x-auto`}>
        <table className="w-full min-w-[950px] text-sm">
          <thead className="sticky top-0 bg-gray-50 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300"><tr>
            {['ولایت / نمایندگی','دریافتی تومان','توزیع تومان','توزیع افغانی','نرخ فروش AFN / 1,000 TOMAN','مفاد (AFN)'].map(label=><th key={label} className="whitespace-nowrap p-3 text-start">{ui(label)}</th>)}
          </tr></thead>
          {provinces.map(province=><tbody key={province.code||'unassigned'} className="border-t-2 border-gray-200 dark:border-gray-700">
            <tr className="bg-sky-50 font-bold dark:bg-sky-950/40">
              <th scope="row" className="whitespace-nowrap p-3 text-start">{province.name} · جمع ولایت</th>
              <td dir="ltr" className="p-3">{displayAmount(province.received_toman)}</td>
              <td dir="ltr" className="p-3">{displayAmount(province.distributed_toman)}</td>
              <td dir="ltr" className="p-3">{displayAmount(province.distributed_afn)}</td>
              <td dir="ltr" className="p-3">{displayRate(province.sale_rate_per_1000)}</td>
              <td dir="ltr" className="p-3">{displayAmount(province.profit_afn)}</td>
            </tr>
            {province.agencies.map(agency=><tr key={agency.id} className="border-t border-gray-100 dark:border-gray-800">
              <th scope="row" className="p-3 text-start font-medium"><span className="me-2 text-gray-400">↳</span>{agency.name}</th>
              <td dir="ltr" className="p-3">{displayAmount(agency.received_toman)}</td>
              <td dir="ltr" className="p-3">{displayAmount(agency.distributed_toman)}</td>
              <td dir="ltr" className="p-3">{displayAmount(agency.distributed_afn)}</td>
              <td dir="ltr" className="p-3">{displayRate(agency.sale_rate_per_1000)}</td>
              <td dir="ltr" className={`p-3 font-semibold ${Number(agency.profit_afn)>0?'text-emerald-700 dark:text-emerald-300':Number(agency.profit_afn)<0?'text-rose-700 dark:text-rose-300':'text-gray-600 dark:text-gray-400'}`}>{displayAmount(agency.profit_afn)}</td>
            </tr>)}
            {!province.agencies.length&&<tr><td colSpan={6} className="p-3 text-center text-gray-500">{ui('در این ولایت نمایندگی فعال ثبت نیست.')}</td></tr>}
          </tbody>)}
          {!query.isPending&&!provinces.length&&<tbody><tr><td colSpan={6} className="p-8 text-center text-gray-500">{ui('برای این ماه داده‌ای یافت نشد.')}</td></tr></tbody>}
        </table>
      </section>
    </>}
  </FinancePage>
}
