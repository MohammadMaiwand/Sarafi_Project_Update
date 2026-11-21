import {Link} from 'react-router-dom'
import {surface} from './FinanceUI'
import {AgencyBalanceStatus} from './AgencyMonthlyReport'
import {presentNumber} from '../utils/presentation'
import {monthTitle} from '../utils/calendar'

export default function RepresentativeSummary({report}){
 return <section className={`${surface} p-5`}><h2 className="mb-4 font-bold">دفتر ماهانهٔ {report.name} — {monthTitle(report.month)}</h2><p className="mb-4 text-sm text-gray-500">مانده و گردش این دفتر مربوط به کل حساب در هر دو جهت است. وضعیت اصلی از دید نمایندگی است؛ دید صرافی جدا نوشته شده است.</p><div className="grid gap-4 lg:grid-cols-2">{(report.balances_by_currency||[report]).map(row=><article key={row.currency} className="space-y-3 rounded-xl border p-4 dark:border-gray-700"><b>{row.currency}</b><p>ماندهٔ انتقالی از ماه قبل: <span dir="ltr">{presentNumber(row.opening_status.amount)} {row.currency}</span></p>{row.agency_opening_status?<AgencyBalanceStatus status={row.agency_opening_status}/>:<p>از دید صرافی: {row.opening_status.label} · {row.opening_status.message}</p>}<p>گردش ماه جاری: {presentNumber(row.movement)} · دریافت: {presentNumber(row.money_received)} · ارسال: {presentNumber(row.money_sent)}</p><p className="font-bold">ماندهٔ پایان ماه: <span dir="ltr">{presentNumber(row.closing_status.amount)} {row.currency}</span></p>{row.agency_closing_status?<AgencyBalanceStatus status={row.agency_closing_status}/>:<p>از دید صرافی: {row.closing_status.label} · {row.closing_status.message}</p>}</article>)}</div><Link className="mt-4 inline-block text-blue-700 underline" to={`/provincial-accounts/${report.account}`}>تاریخچه کامل و ثبت گردش حساب</Link></section>
}
