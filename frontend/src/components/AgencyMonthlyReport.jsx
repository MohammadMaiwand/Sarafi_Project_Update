import {Link} from 'react-router-dom'
import {presentNumber} from '../utils/presentation'
import {shamsi} from '../utils/remittance'
import {monthTitle} from '../utils/calendar'
import {surface,secondaryButton} from './FinanceUI'
import {agencyMovementLabels as representativeMovements} from '../provincialLabels'

export function AgencyBalanceStatus({status}){
 if(!status)return null
 return <span className="block"><span>از دید نمایندگی: <b>{status.label}</b> — {status.message}</span><span className="block">از دید صرافی: <b>{status.office?.label}</b> — {status.office?.message}</span><span className="block text-sm text-gray-500">{status.who_owes_whom}</span></span>
}

export default function AgencyMonthlyReport({report}){
 return <section className="space-y-5"><div className="flex flex-wrap justify-between gap-3"><h2 className="font-bold">گزارش نمایندگی‌ها — {report.agency} — {monthTitle(report.month)}</h2><button className={secondaryButton} onClick={()=>window.print()}>چاپ گزارش</button></div><p className="text-sm text-gray-500">{report.settlement_note}</p><div className="grid gap-5 xl:grid-cols-2">{(report.balances_by_currency||[report]).map(row=><article key={row.currency} className={`${surface} space-y-4 p-5`}><h3 className="text-lg font-bold">{row.currency}</h3><div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><p>ماندهٔ انتقالی از ماه قبل: <b dir="ltr">{presentNumber(row.opening_status.amount)} {row.currency}</b></p><AgencyBalanceStatus status={row.opening_status}/></div><table className="w-full text-start text-sm"><thead><tr><th className="p-2">قلم</th><th>جمع / کسر</th><th>مقدار</th><th>اثر بر مانده</th></tr></thead><tbody>{row.lines.map(line=><tr key={line.key} className="border-t"><td className="p-2">{line.label}</td><td>{line.operation==='ADD'?'جمع':'کسر'}</td><td dir="ltr">{presentNumber(line.amount)}</td><td dir="ltr">{presentNumber(line.effect)}</td></tr>)}</tbody></table><p>گردش خالص ماه جاری: <b dir="ltr">{presentNumber(row.movement)} {row.currency}</b></p><div className="rounded-xl border p-3"><p>ماندهٔ پایان ماه: <b dir="ltr">{presentNumber(row.closing_status.amount)} {row.currency}</b></p><AgencyBalanceStatus status={row.closing_status}/></div><p className="text-sm">اصل امانت؛ تعهد جداگانه در حساب مالی: <span dir="ltr">{presentNumber(row.deposit_liabilities)} {row.currency}</span></p><details><summary className="cursor-pointer text-blue-700">ریز گردش و تسویه‌های هشت قلم</summary>{row.lines.flatMap(line=>line.sources.map((source,index)=><p key={`${line.key}-${index}`} className="border-t py-2 text-sm">{shamsi(source.date)} · {source.reference} · {line.label} · {representativeMovements[source.category]||source.category}{source.reversal?' — برگشت':''} · اثر <span dir="ltr">{presentNumber(source.effect)} {row.currency}</span></p>))}</details></article>)}</div><Link className="text-blue-700 underline" to="/provincial-received">سوابق حواله‌های ولایتی قبلی</Link></section>
}
