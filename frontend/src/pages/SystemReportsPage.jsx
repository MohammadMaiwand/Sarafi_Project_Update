import {useState} from 'react'
import {Link} from 'react-router-dom'
import {useQuery} from '@tanstack/react-query'
import {FinancePage,FormField,fieldClass,surface,primaryButton,secondaryButton} from '../components/FinanceUI'
import {ErrorBanner} from '../remittances/UI'
import {AfghanDateInput,AfghanMonthInput} from '../components/AfghanDate'
import {solarMonth,businessToday} from '../utils/calendar'
import {remittanceRequest} from '../remittanceApi'
import {provinceQuery} from '../provincialApi'
import SystemReportDocument from '../components/SystemReportDocument'
import '../report.css'

export default function SystemReportsPage(){
 const [type,setType]=useState('tehran'),[mode,setMode]=useState('month'),[month,setMonth]=useState(solarMonth),[from,setFrom]=useState(''),[to,setTo]=useState(businessToday),[showEmpty,setShowEmpty]=useState(false),[printError,setPrintError]=useState(null)
 const valid=mode!=='range'||!!to&&(!from||from<=to)
 const params={type,...(mode==='all'?{all:true}:mode==='month'?{month}:{dateFrom:from,dateTo:to})}
 const query=useQuery({queryKey:['system-report',params],queryFn:()=>remittanceRequest(`/reports/system/?${provinceQuery(params)}`),enabled:valid,staleTime:0})
 async function print(){setPrintError(null);try{const {printSystemReport}=await import('../utils/systemReportPrint');await printSystemReport(query.data,showEmpty)}catch(e){setPrintError(e)}}
 return <FinancePage title="مرکز گزارش‌های مالی" subtitle="گزارش حواله تهران و راپور جامع سیستم، با تفکیک واحد پول و خروجی مخصوص چاپ." action={<Link className={secondaryButton} to="/agency-reports/representatives">گزارش ماهانه نمایندگی‌ها</Link>}>
  <section className={`${surface} space-y-4 p-5`}><div role="group" aria-label="نوع گزارش" className="flex flex-wrap gap-3">{[['tehran','گزارش حواله تهران'],['system','گزارش جامع سیستم']].map(([value,label])=><button key={value} className={type===value?primaryButton:secondaryButton} aria-pressed={type===value} onClick={()=>setType(value)}>{label}</button>)}</div><div className="flex flex-wrap items-end gap-4"><FormField id="report-period-mode" label="بازه گزارش"><select id="report-period-mode" className={fieldClass} value={mode} onChange={e=>setMode(e.target.value)}><option value="month">ماه شمسی</option><option value="range">بازه دلخواه</option><option value="all">تمام سوابق تا امروز</option></select></FormField>{mode==='month'&&<FormField label="ماه شمسی"><AfghanMonthInput className={fieldClass} value={month} onChange={e=>setMonth(e.target.value)}/></FormField>}{mode==='range'&&<><FormField label="از تاریخ شمسی" id="report-from"><AfghanDateInput className={fieldClass} id="report-from" value={from} onChange={e=>setFrom(e.target.value)}/></FormField><FormField label="تا تاریخ شمسی" id="report-to"><AfghanDateInput required className={fieldClass} id="report-to" value={to} onChange={e=>setTo(e.target.value)}/></FormField></>}<button className={secondaryButton} onClick={()=>query.refetch()} disabled={!valid||query.isFetching}>تازه‌سازی گزارش</button><button className={primaryButton} onClick={print} disabled={!query.data||query.isFetching||!valid}>چاپ گزارش / ذخیره PDF</button></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showEmpty} onChange={e=>setShowEmpty(e.target.checked)}/>نمایش بخش‌های بدون معامله</label><p className="text-xs text-gray-500">چاپ روی A4 افقی با تکرار عنوان ستون‌ها انجام می‌شود؛ در پنجره چاپ می‌توانید «ذخیره به PDF» را انتخاب کنید.</p></section>
  <ErrorBanner error={!valid?'بازه تاریخ معتبر نیست.':query.error||printError}/>{query.isFetching&&<p role="status">در حال تهیه گزارش و محاسبه مانده‌ها…</p>}{query.data&&valid&&!query.isFetching&&<SystemReportDocument report={query.data} showEmpty={showEmpty}/>}
 </FinancePage>
}
