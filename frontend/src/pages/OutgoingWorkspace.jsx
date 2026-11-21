import {useState} from 'react'
import {Link,useNavigate,useParams,useSearchParams} from 'react-router-dom'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {FinancePage,EmptyState,FormField,Modal,StatCard,fieldClass,surface,primaryButton,secondaryButton} from '../components/FinanceUI'
import {AfghanDateInput,AfghanMonthInput} from '../components/AfghanDate'
import {businessToday,solarMonth,monthTitle} from '../utils/calendar'
import {shamsi} from '../utils/remittance'
import {presentNumber} from '../utils/presentation'
import {remittanceRequest} from '../remittanceApi'

const labels={RECEIPT:'دریافتی پول',DISTRIBUTION:'توزیع',SALARY:'معاش نماینده',EXPENSE:'مصارف',SHOP_RENT:'کرایه دکان',COLLEAGUE_LOAN:'بدهکار همکار',COLLEAGUE_DEPOSIT:'طلبکار همکار',CUSTOMER_LOAN:'بدهکار / قرض‌دار مردم',CUSTOMER_CREDIT:'طلب مردم از نمایندگی',PUBLIC_DEPOSIT:'پول امانت مردم',OPENING:'سرمایه نمایندگی',REVERSAL:'برگشت معامله'}
const outgoingFormFields=[
 {number:1,label:'دریافتی پول',amounts:[{key:'received_afn',category:'RECEIPT',currency:'AFN',label:'مبلغ افغانی'},{key:'received_toman',category:'RECEIPT',currency:'TOMAN',label:'مبلغ تومان'}]},
 {number:2,label:'توزیع افغانی',amounts:[{key:'distributed_afn',category:'DISTRIBUTION',currency:'AFN',label:'مبلغ افغانی'}]},
 {number:3,label:'توزیع تومان',amounts:[{key:'distributed_toman',category:'DISTRIBUTION',currency:'TOMAN',label:'مبلغ تومان'}]},
 {number:4,label:'معاش نماینده',amounts:[{key:'salary',category:'SALARY',currency:'AFN',label:'مبلغ افغانی'}]},
 {number:5,label:'مصارف',amounts:[{key:'expense',category:'EXPENSE',currency:'AFN',label:'مبلغ افغانی'}]},
 {number:6,label:'کرایه دوکان',amounts:[{key:'shop_rent',category:'SHOP_RENT',currency:'AFN',label:'مبلغ افغانی'}]},
 {number:7,label:'بدهکار همکار',partyKey:'colleague_debt_person',partyLabel:'نام همکار',amounts:[{key:'colleague_debt',category:'COLLEAGUE_LOAN',currency:'AFN',label:'مبلغ افغانی'}]},
 {number:8,label:'طلبکار همکار',partyKey:'colleague_credit_person',partyLabel:'نام همکار',amounts:[{key:'colleague_credit',category:'COLLEAGUE_DEPOSIT',currency:'AFN',label:'مبلغ افغانی'}]},
 {number:9,label:'بدهکاران یا قرض‌داران مردم',partyKey:'people_debt_person',partyLabel:'نام قرض‌دار',amounts:[{key:'people_debt',category:'CUSTOMER_LOAN',currency:'AFN',label:'مبلغ افغانی'}]},
 {number:10,label:'طلب مردم بالای نمایندگی',partyKey:'people_credit_person',partyLabel:'نام طلبکار',amounts:[{key:'people_credit',category:'CUSTOMER_CREDIT',currency:'AFN',label:'مبلغ افغانی'}]},
 {number:11,label:'پول امانت مردم',partyKey:'deposit_person',partyLabel:'نام امانت‌گذار',amounts:[{key:'people_deposit',category:'PUBLIC_DEPOSIT',currency:'AFN',label:'مبلغ افغانی'}]},
 {number:12,label:'سرمایه نمایندگی',amounts:[{key:'capital',category:'OPENING',currency:'AFN',label:'مبلغ افغانی'}]},
]
const currencyLabel={AFN:'افغانی',TOMAN:'تومان'}
function outgoingRate(toman,afn){
 const denominator=Number(afn)||0
 if(!denominator)return '0'
 return new Intl.NumberFormat('en-US',{maximumFractionDigits:9}).format((Number(toman)||0)/denominator)
}
const provinceCardBackgrounds=[
 'border-sky-200 bg-gradient-to-br from-sky-100 via-cyan-50 to-white text-sky-950 hover:border-sky-400 dark:border-sky-900 dark:from-sky-950 dark:via-cyan-950/60 dark:to-gray-900 dark:text-sky-100',
 'border-violet-200 bg-gradient-to-br from-violet-100 via-fuchsia-50 to-white text-violet-950 hover:border-violet-400 dark:border-violet-900 dark:from-violet-950 dark:via-fuchsia-950/60 dark:to-gray-900 dark:text-violet-100',
 'border-amber-200 bg-gradient-to-br from-amber-100 via-orange-50 to-white text-amber-950 hover:border-amber-400 dark:border-amber-900 dark:from-amber-950 dark:via-orange-950/60 dark:to-gray-900 dark:text-amber-100',
 'border-emerald-200 bg-gradient-to-br from-emerald-100 via-teal-50 to-white text-emerald-950 hover:border-emerald-400 dark:border-emerald-900 dark:from-emerald-950 dark:via-teal-950/60 dark:to-gray-900 dark:text-emerald-100',
 'border-rose-200 bg-gradient-to-br from-rose-100 via-pink-50 to-white text-rose-950 hover:border-rose-400 dark:border-rose-900 dark:from-rose-950 dark:via-pink-950/60 dark:to-gray-900 dark:text-rose-100',
 'border-indigo-200 bg-gradient-to-br from-indigo-100 via-blue-50 to-white text-indigo-950 hover:border-indigo-400 dark:border-indigo-900 dark:from-indigo-950 dark:via-blue-950/60 dark:to-gray-900 dark:text-indigo-100',
]

export default function OutgoingWorkspace({account=false}){
 const {accountId}=useParams()
 return account&&accountId?<OutgoingAgencyDashboard accountId={accountId}/>:<OutgoingAgencyList/>
}

function OutgoingAgencyList(){
 const [params]=useSearchParams()
 const province=params.get('province')||''
 const [search,setSearch]=useState(''),[modal,setModal]=useState(false),[error,setError]=useState(null)
 const client=useQueryClient(),navigate=useNavigate()
 const catalog=useQuery({queryKey:['provinces'],queryFn:()=>remittanceRequest('/provinces/')})
 const query=useQuery({
  queryKey:['outgoing-agencies',province],
  queryFn:()=>remittanceRequest(`/outgoing/agencies/${province?`?province=${encodeURIComponent(province)}`:''}`),
 })
 const rows=query.data?.results||[]
 const selected=catalog.data?.results.find(row=>row.code===province)
 const unassigned=province==='unassigned'
 const normalizedSearch=search.trim().toLowerCase()
 const results=rows.filter(row=>`${row.name} ${row.phone}`.toLowerCase().includes(normalizedSearch))
 const provinceResults=(catalog.data?.results||[]).filter(row=>`${row.name} ${row.english_name}`.toLowerCase().includes(normalizedSearch))
 const unassignedCount=(province?rows:query.data?.results||[]).filter(row=>!row.province).length
 async function saved(row){
  setModal(false);setError(null)
  await client.invalidateQueries({queryKey:['outgoing-agencies']})
  if(row?.id)navigate(`/outgoing/accounts/${row.id}`)
 }
 const actions=province?<div className="flex flex-wrap gap-2"><Link className={secondaryButton} to="/outgoing">همه ولایت‌ها</Link>{selected&&<button className={primaryButton} onClick={()=>setModal(true)}>+ ایجاد نمایندگی</button>}</div>:null
 return <FinancePage title={selected?`نمایندگی‌های ${selected.name}`:unassigned?'نمایندگی‌های بدون ولایت':'نمایندگی‌های ولایات'} subtitle={selected?'مدیران و دفتر مستقل نمایندگی‌های همین ولایت را مدیریت کنید.':'ابتدا ولایت را انتخاب کنید؛ دفترهای این صفحه از حواله‌های مشتری جدا هستند.'} action={actions}>
  {error&&<p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">{error.message}</p>}
  {(catalog.error||query.error)&&<p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">{(catalog.error||query.error).message}</p>}
  <FormField label={province?'جستجوی نام مدیر یا شماره تماس':'جستجوی ولایت'} id="outgoing-agency-search"><input id="outgoing-agency-search" type="search" className={fieldClass} value={search} onChange={e=>setSearch(e.target.value)} placeholder="جستجو…"/></FormField>
  {!province?<section aria-label="ولایت‌های افغانستان" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
   {catalog.isPending?<p role="status" className="p-4">در حال دریافت فهرست ولایت‌ها…</p>:provinceResults.map((row,index)=>{
    const count=(query.data?.results||[]).filter(account=>account.province===row.code).length
    return <Link key={row.code} to={`?province=${encodeURIComponent(row.code)}`} className={`group relative overflow-hidden rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25 ${provinceCardBackgrounds[index%provinceCardBackgrounds.length]}`}>
     <span aria-hidden="true" className="absolute -left-7 -top-8 h-28 w-28 rounded-full bg-white/35"/>
     <span className="relative flex items-start justify-between gap-3"><span><span className="text-xs font-bold opacity-65">ولایت افغانستان</span><span className="mt-1 block text-xl font-extrabold">{row.name}</span><span className="mt-3 inline-flex rounded-full bg-white/65 px-3 py-1 text-xs font-semibold dark:bg-black/20">{count} نمایندگی</span></span><span aria-hidden="true" className="mt-2 text-2xl transition-transform group-hover:-translate-x-1">←</span></span>
    </Link>
   })}
   {!catalog.isPending&&unassignedCount>0&&<Link to="?province=unassigned" className="group rounded-2xl border border-dashed border-amber-400 bg-gradient-to-br from-amber-50 to-orange-100 p-5 text-amber-950 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:from-amber-950 dark:to-orange-950 dark:text-amber-100"><span className="text-xs font-bold opacity-70">نیازمند تعیین ولایت</span><span className="mt-1 block text-xl font-extrabold">ولایت ثبت‌نشده</span><span className="mt-3 inline-flex rounded-full bg-white/70 px-3 py-1 text-xs font-semibold dark:bg-black/20">{unassignedCount} نمایندگی</span></Link>}
  </section>:<section className={`${surface} overflow-x-auto`}>
   <div className="grid min-w-[850px] grid-cols-[1.15fr_0.9fr_1.5fr_0.8fr] gap-3 border-b bg-gray-50 p-4 text-sm font-bold dark:bg-gray-800"><span>نام مدیر نمایندگی</span><span>شماره تماس</span><span>حساب تومان نمایندگی</span><span>دفتر مالی</span></div>
   {query.isPending?<p role="status" className="p-5">در حال دریافت نمایندگی‌ها…</p>:results.map(row=><Link key={row.id} to={`/outgoing/accounts/${row.id}`} className="grid min-w-[850px] grid-cols-[1.15fr_0.9fr_1.5fr_0.8fr] items-center gap-3 border-b p-4 text-sm transition hover:bg-sky-50 focus:bg-sky-50 dark:border-gray-700 dark:hover:bg-gray-800"><b>{row.name}</b><span dir="ltr" className="text-right">{row.phone||'—'}</span><span><b dir="ltr" className="block text-base">{presentNumber(row.toman_balance||'0')} TOMAN</b><small className={`mt-1 block font-semibold ${Number(row.toman_balance)>0?'text-rose-700 dark:text-rose-300':Number(row.toman_balance)<0?'text-emerald-700 dark:text-emerald-300':'text-gray-600 dark:text-gray-400'}`}>{row.toman_balance_status||'حساب تومان تصفیه است'}</small></span><span className="font-semibold text-blue-700">داشبورد و معاملات ←</span></Link>)}
   {!query.isPending&&!results.length&&<EmptyState title={unassigned?'نمایندگی بدون ولایت دیگری نیست':'هنوز نمایندگی‌ای در این ولایت ثبت نشده است'} description={unassigned?'برای تعیین ولایت، نمایندگی را باز و گزینهٔ «ویرایش مدیر» را انتخاب کنید.':'برای افزودن مدیر نمایندگی از دکمهٔ «ایجاد نمایندگی» استفاده کنید.'}/>}
  </section>}
  <Link className="text-sm text-blue-700 underline" to="/outgoing/records">نمایش سوابق حواله‌های قدیمی</Link>
  {modal&&selected&&<OutgoingAgencyForm province={selected.code} provinces={catalog.data?.results||[]} onClose={()=>setModal(false)} onSaved={saved} onError={setError}/>}
 </FinancePage>
}

function OutgoingAgencyForm({onClose,onSaved,onError,initial,province:initialProvince='',provinces=[]}){
 const [name,setName]=useState(initial?.name||''),[phone,setPhone]=useState(initial?.phone||''),[province,setProvince]=useState(initial?.province||initialProvince),[busy,setBusy]=useState(false),[error,setError]=useState(null)
 const catalog=useQuery({queryKey:['provinces'],queryFn:()=>remittanceRequest('/provinces/'),enabled:provinces.length===0})
 const provinceRows=provinces.length?provinces:(catalog.data?.results||[])
 async function submit(event){event.preventDefault();setBusy(true);setError(null);try{const data={name,phone,province};const row=initial?await remittanceRequest(`/outgoing/agencies/${initial.id}/`,data,'PATCH'):await remittanceRequest('/outgoing/agencies/',data);await onSaved(row)}catch(err){setError(err);onError?.(err)}finally{setBusy(false)}}
 return <Modal title={initial?'ویرایش مشخصات مدیر نمایندگی':'ایجاد نمایندگی'} onClose={onClose}><form onSubmit={submit} className="space-y-4">
  <FormField label="ولایت نمایندگی" id="outgoing-agency-province"><select id="outgoing-agency-province" required className={fieldClass} value={province} onChange={e=>setProvince(e.target.value)}><option value="">انتخاب ولایت…</option>{provinceRows.map(row=><option key={row.code} value={row.code}>{row.name}</option>)}</select></FormField>
  <FormField label="نام مدیر نمایندگی" id="outgoing-manager-name"><input id="outgoing-manager-name" required maxLength={200} className={fieldClass} value={name} onChange={e=>setName(e.target.value)}/></FormField>
  <FormField label="شماره تماس مدیر نمایندگی" id="outgoing-manager-phone"><input id="outgoing-manager-phone" required type="tel" maxLength={50} className={fieldClass} value={phone} onChange={e=>setPhone(e.target.value)}/></FormField>
  {error&&<p role="alert" className="text-red-700">{error.message}</p>}<button disabled={busy} className={primaryButton}>{busy?'در حال ذخیره…':initial?'ذخیره تغییرات':'ایجاد دفتر نمایندگی'}</button>
 </form></Modal>
}

function OutgoingAgencyDashboard({accountId}){
 const [month,setMonth]=useState(solarMonth),[all,setAll]=useState(false),[page,setPage]=useState(1),[modal,setModal]=useState(''),[error,setError]=useState(null)
 const client=useQueryClient(),navigate=useNavigate(),period=all?'':month
 const account=useQuery({queryKey:['outgoing-agency',accountId],queryFn:()=>remittanceRequest(`/outgoing/agencies/${accountId}/`)})
 const transactions=useQuery({queryKey:['outgoing-agency-transactions',accountId,period,page],queryFn:()=>remittanceRequest(`/outgoing/agencies/${accountId}/transactions/?${new URLSearchParams({month:period,page,pageSize:50})}`)})
 async function saved(){setModal('');setError(null);await Promise.all([client.invalidateQueries({queryKey:['outgoing-agency',accountId]}),client.invalidateQueries({queryKey:['outgoing-agency-transactions',accountId]}),client.invalidateQueries({queryKey:['outgoing-agencies']})])}
 async function reverse(row){const reason=window.prompt(`دلیل برگشت معامله ${row.number} را بنویسید:`);if(!reason?.trim())return;try{await remittanceRequest('/ledger/documents/',{request_key:crypto.randomUUID(),account:Number(accountId),agency:account.data.agency,category:'REVERSAL',date:businessToday(),currency:row.currency,amount:row.amount,reversal_of:row.id,details:{reason:reason.trim()}});await saved()}catch(err){setError(err)}}
 const summary=transactions.data?.summary||{},money=(key,unit)=>`${presentNumber(summary[key]||'0')} ${unit}`
 const listPath=account.data?.province?`/outgoing?province=${encodeURIComponent(account.data.province)}`:'/outgoing'
 const subtitle=[account.data?.province_name,account.data?.phone?`شماره تماس مدیر: ${account.data.phone}`:''].filter(Boolean).join(' · ')||'نمایش معامله‌ها و حساب‌های مستقل نمایندگی'
 return <FinancePage title={account.data?.name?`داشبورد نمایندگی ${account.data.name}`:'داشبورد نمایندگی'} subtitle={subtitle} action={<div className="flex flex-wrap gap-2"><button className={secondaryButton} onClick={()=>setModal('edit')} disabled={!account.data}>ویرایش مدیر</button><button className={secondaryButton} onClick={()=>navigate(listPath)}>بازگشت به ولایت</button></div>}>
  {(account.error||transactions.error||error)&&<p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">{(error||account.error||transactions.error).message}</p>}
  <section className={`${surface} flex flex-wrap items-end gap-4 p-4 sm:p-5`}><FormField label="ماه شمسی" id="outgoing-dashboard-month"><AfghanMonthInput id="outgoing-dashboard-month" className={fieldClass} disabled={all} value={month} onChange={e=>{setMonth(e.target.value);setPage(1)}}/></FormField><label className="flex items-center gap-2 py-3"><input type="checkbox" checked={all} onChange={e=>{setAll(e.target.checked);setPage(1)}}/>تمام سابقه</label><button className={secondaryButton} onClick={()=>window.print()}>چاپ داشبورد</button></section>
  {transactions.isPending?<p role="status" className="p-4">در حال محاسبهٔ داشبورد…</p>:<section aria-label="خلاصه نمایندگی" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
   <StatCard label="مقدار دریافتی" value={`${presentNumber(summary.received_afn||'0')} AFN · ${presentNumber(summary.received_toman||'0')} TOMAN`} accent="emerald"/>
   <StatCard label="توزیع افغانی" value={money('distributed_afn','AFN')} accent="blue"/>
   <StatCard label="توزیع تومان" value={money('distributed_toman','TOMAN')} accent="violet"/>
   <StatCard label="مصارف" value={money('expenses','AFN')} accent="rose"/>
   <StatCard label="مفاد تومان" value={`${outgoingRate(summary.toman_profit||'0','1')} TOMAN / AFN`} accent="amber"/>
   <div className={`${surface} stat-card min-w-0 border-2 p-4 sm:p-5 ${Number(summary.toman_balance)>0?'border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/20':Number(summary.toman_balance)<0?'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20':'border-gray-200 dark:border-gray-700'}`}><p className="text-sm font-semibold text-gray-500 dark:text-gray-400">حساب تومان نمایندگی {account.data?.name||''}</p><p dir="ltr" className="mt-3 break-words text-xl font-bold tabular-nums text-gray-950 dark:text-white sm:text-2xl">{money('toman_balance','TOMAN')}</p><p className={`mt-2 text-sm font-bold ${Number(summary.toman_balance)>0?'text-rose-700 dark:text-rose-300':Number(summary.toman_balance)<0?'text-emerald-700 dark:text-emerald-300':'text-gray-600 dark:text-gray-400'}`}>{summary.toman_balance_status||'حساب تومان تصفیه است'}</p><p className="mt-1 text-xs text-gray-500">محاسبه: دریافتی تومان منهای توزیع تومان</p></div>
  </section>}
  {!transactions.isPending&&<><section className={`${surface} grid gap-4 p-4 sm:grid-cols-2 sm:p-5`}><div className="rounded-xl border p-4"><h2 className="font-bold">حساب با دفتر مرکزی — افغانی</h2><p className="mt-2 text-xl font-bold" dir="ltr">{money('central_office_balance_afn','AFN')}</p><p className={`mt-1 font-semibold ${Number(summary.central_office_balance_afn)>0?'text-rose-700':Number(summary.central_office_balance_afn)<0?'text-emerald-700':'text-gray-600'}`}>{summary.central_office_status||'تصفیه‌شده'}</p><p className="mt-2 text-xs text-gray-500">محاسبه: دریافتی افغانی منهای توزیع افغانی</p></div><div className="rounded-xl border p-4"><h2 className="font-bold">سایر حساب‌های نمایندگی</h2><dl className="mt-2 grid grid-cols-2 gap-2 text-sm">{[['معاش','salary','AFN'],['کرایه دکان','shop_rent','AFN'],['بدهکار همکار','colleague_debt','AFN'],['طلبکار همکار','colleague_credit','AFN'],['بدهکاران مردم','people_debt','AFN'],['طلب مردم','people_credit','AFN'],['امانت مردم','people_deposit','AFN'],['سرمایه نمایندگی','capital','AFN']].map(([label,key,unit])=><div key={key} className="rounded-lg bg-gray-50 p-2 dark:bg-gray-800"><dt className="text-gray-500">{label}</dt><dd dir="ltr" className="mt-1 font-semibold">{presentNumber(summary[key]||'0')} {unit}</dd></div>)}</dl></div></section>
  <section className={`${surface} overflow-x-auto`}><header className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><h2 className="font-bold">معاملات {all?'تمام سابقه':monthTitle(month)}</h2><button className={primaryButton} onClick={()=>setModal('transaction')}>+ ایجاد معامله</button></header><table className="w-full min-w-[900px] text-right text-sm"><thead className="bg-gray-50 dark:bg-gray-800"><tr>{['رسید','تاریخ','نوع معامله','مبلغ','واحد','شخص مرتبط / یادداشت','عملیات'].map(label=><th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{(transactions.data?.results||[]).map(row=><tr key={row.id} className="border-t dark:border-gray-700"><td className="p-3" dir="ltr">{row.number}</td><td>{shamsi(row.date)}</td><td>{labels[row.reversal_of?'REVERSAL':row.category]||row.category}{row.reversal_of&&<small className="block text-gray-500">برگشت سند {row.reversal_of}</small>}</td><td dir="ltr">{presentNumber(row.amount)}</td><td>{currencyLabel[row.currency]||row.currency}</td><td>{row.details.counterparty_name||row.details.purpose||row.details.notes||'—'}</td><td>{!row.reversal_of&&<button className={secondaryButton} onClick={()=>reverse(row)}>برگشت با ثبت دلیل</button>}</td></tr>)}</tbody></table>
   {!transactions.data?.results?.length&&<EmptyState title="در این بازه معامله‌ای ثبت نشده است" description="برای افزودن دریافتی، توزیع، معاش، مصارف، امانت، بدهی یا سرمایه روی «ایجاد معامله» بزنید."/>}
   {transactions.data?.totalPages>1&&<div className="flex items-center justify-center gap-3 border-t p-4"><button className={secondaryButton} disabled={page<=1} onClick={()=>setPage(page-1)}>قبلی</button><span>{page} از {transactions.data.totalPages}</span><button className={secondaryButton} disabled={page>=transactions.data.totalPages} onClick={()=>setPage(page+1)}>بعدی</button></div>}
  </section><OutgoingCentralOfficeReport summary={summary} period={all?'تمام سابقه':monthTitle(month)}/></>}
  {modal==='edit'&&account.data&&<OutgoingAgencyForm initial={account.data} onClose={()=>setModal('')} onSaved={async()=>{setModal('');await saved()}}/>}
  {modal==='transaction'&&account.data&&<OutgoingTransactionForm account={account.data} summary={summary} onClose={()=>setModal('')} onSaved={saved}/>}
 </FinancePage>
}

function OutgoingCentralOfficeReport({summary,period}){
 const addedRows=[['دریافتی پول (افغانی)','received_afn'],['پول امانت مردم','people_deposit'],['طلبکار همکار','colleague_credit']]
 const deductedRows=[['توزیع افغانی','distributed_afn'],['مصارف','expenses'],['بدهکاران یا قرض‌داران مردم','people_debt'],['طلب مردم بالای نمایندگی','people_credit']]
 const result=Number(summary.central_report_balance_afn||0)
 const resultStatus=summary.central_report_status||'حساب دفتر مرکزی تصفیه است'
 return <section aria-labelledby="outgoing-central-report-title" className={`${surface} space-y-4 p-4 sm:p-5`}>
  <header><h2 id="outgoing-central-report-title" className="text-lg font-bold">گزارش نمایندگی به دفتر مرکزی</h2><p className="mt-1 text-sm text-gray-500">دوره: {period} · تمام مبالغ این گزارش به افغانی است.</p></header>
  <div className="grid gap-4 lg:grid-cols-2">
   <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/20"><h3 className="font-bold text-emerald-800 dark:text-emerald-200">موارد جمع‌شده (+)</h3><dl className="mt-3 space-y-2">{addedRows.map(([label,key])=><div key={key} className="flex items-center justify-between gap-3 border-b border-emerald-100 pb-2 text-sm last:border-0 dark:border-emerald-900"><dt>+ {label}</dt><dd dir="ltr" className="font-semibold">{presentNumber(summary[key]||'0')} AFN</dd></div>)}</dl><p className="mt-3 flex justify-between gap-3 font-bold"><span>مجموع موارد جمع‌شده</span><span dir="ltr">{presentNumber(summary.central_report_additions_afn||'0')} AFN</span></p></div>
   <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900 dark:bg-rose-950/20"><h3 className="font-bold text-rose-800 dark:text-rose-200">موارد منفی‌شده (−)</h3><dl className="mt-3 space-y-2">{deductedRows.map(([label,key])=><div key={key} className="flex items-center justify-between gap-3 border-b border-rose-100 pb-2 text-sm last:border-0 dark:border-rose-900"><dt>− {label}</dt><dd dir="ltr" className="font-semibold">{presentNumber(summary[key]||'0')} AFN</dd></div>)}</dl><p className="mt-3 flex justify-between gap-3 font-bold"><span>مجموع موارد منفی‌شده</span><span dir="ltr">{presentNumber(summary.central_report_deductions_afn||'0')} AFN</span></p></div>
  </div>
  <div className={`rounded-xl border p-4 ${result>0?'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30':result<0?'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30':'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'}`}><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">نتیجهٔ نهایی گزارش</h3><p dir="ltr" className="text-xl font-extrabold">{presentNumber(summary.central_report_balance_afn||'0')} AFN</p></div><p className="mt-1 font-semibold">{resultStatus}</p><p className="mt-2 text-xs text-gray-600 dark:text-gray-300">دریافتی تومان، معاش، کرایه و بدهکار همکار در این محاسبه وارد نشده‌اند؛ گزارش دقیقاً بر اساس اقلام بالا است.</p></div>
 </section>
}

function OutgoingTransactionForm({account,summary,onClose,onSaved}){
 const initialValues=Object.fromEntries(outgoingFormFields.flatMap(field=>[
  ...field.amounts.map(entry=>[entry.key,'']),
  ...(field.partyKey?[[field.partyKey,'']]:[]),
 ]))
 const [values,setValues]=useState(initialValues),[date,setDate]=useState(businessToday),[notes,setNotes]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(null)
 const [batchKey]=useState(()=>crypto.randomUUID())
 const previewReceived=Number(summary.central_office_balance_afn||0)+Number(values.received_afn||0)-Number(values.distributed_afn||0)
 const previewToman=Number(summary.distributed_toman||0)+Number(values.distributed_toman||0)
 const previewAfn=Number(summary.distributed_afn||0)+Number(values.distributed_afn||0)
 const previewStatus=previewReceived>0?'نمایندگی بدهکار دفتر مرکزی است':previewReceived<0?'دفتر مرکزی بدهکار نمایندگی است':'حساب دفتر مرکزی تصفیه است'
 function updateValue(key,value){setValues(current=>({...current,[key]:value}))}
 async function submit(event){
  event.preventDefault();setBusy(true);setError(null)
  const entries=outgoingFormFields.flatMap(field=>field.amounts.map(entry=>({...entry,partyKey:field.partyKey})))
   .filter(entry=>String(values[entry.key]||'').trim())
  if(!entries.length){setError({message:'حداقل مبلغ یکی از بخش‌ها را وارد کنید.'});setBusy(false);return}
  const transactions=entries.map((entry,index)=>({request_key:`${batchKey}-${index}`,category:entry.category,currency:entry.currency,amount:values[entry.key],details:{
   ...(entry.partyKey?{counterparty_name:String(values[entry.partyKey]||'').trim()}:{}),
   ...(notes.trim()?{notes:notes.trim()}:{}),
   ...(entry.category==='SHOP_RENT'?{purpose:'کرایه دوکان'}:{}),
  }}))
  try{await remittanceRequest(`/outgoing/agencies/${account.id}/transactions/`,{date,transactions});await onSaved()}
  catch(err){setError(err)}
  finally{setBusy(false)}
 }
 return <Modal title="ثبت حساب‌های نمایندگی" subtitle={account.name} onClose={onClose} width="max-w-5xl"><form onSubmit={submit} className="space-y-5">
  <FormField label="تاریخ شمسی تمام ثبت‌ها" id="outgoing-transaction-date"><AfghanDateInput id="outgoing-transaction-date" required className={fieldClass} value={date} onChange={e=>setDate(e.target.value)}/></FormField>
  <section aria-label="بخش‌های مالی نمایندگی" className="grid gap-3 sm:grid-cols-2">
   {outgoingFormFields.map(field=><section key={field.number} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
    <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">{field.number}</span>{field.label}</h3>
    <div className={`grid gap-3 ${field.amounts.length>1?'sm:grid-cols-2':''}`}>
     {field.amounts.map(entry=><FormField key={entry.key} label={entry.label} id={`outgoing-${entry.key}`}><input id={`outgoing-${entry.key}`} type="number" min="0.001" step="0.001" inputMode="decimal" className={fieldClass} value={values[entry.key]} onChange={e=>updateValue(entry.key,e.target.value)} dir="ltr"/></FormField>)}
    </div>
    {field.partyKey&&<FormField label={field.partyLabel} id={`outgoing-${field.partyKey}`}><input id={`outgoing-${field.partyKey}`} required={field.amounts.some(entry=>Boolean(values[entry.key]))} maxLength={200} className={fieldClass} value={values[field.partyKey]} onChange={e=>updateValue(field.partyKey,e.target.value)}/></FormField>}
   </section>)}
  </section>
  <section aria-live="polite" className="grid gap-3 sm:grid-cols-2">
   <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30"><h2 className="text-sm font-bold">۱۳. حساب با دفتر مرکزی</h2><p className="mt-2 text-xl font-extrabold" dir="ltr">{presentNumber(previewReceived)} AFN</p><p className="mt-1 text-sm font-semibold">{previewStatus}</p><p className="mt-1 text-xs text-gray-600 dark:text-gray-300">محاسبه: دریافتی افغانی منهای توزیع افغانی</p></div>
   <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30"><h2 className="text-sm font-bold">۱۴. مفاد تومان نمایندگی</h2><p className="mt-2 text-xl font-extrabold" dir="ltr">{outgoingRate(previewToman,previewAfn)} TOMAN / AFN</p><p className="mt-1 text-xs text-gray-600 dark:text-gray-300">محاسبه: مجموع توزیع تومان تقسیم بر مجموع توزیع افغانی</p></div>
  </section>
  <FormField label="یادداشت مشترک ثبت‌ها" id="outgoing-transaction-notes"><textarea id="outgoing-transaction-notes" rows={2} maxLength={2000} className={fieldClass} value={notes} onChange={e=>setNotes(e.target.value)}/></FormField>
  <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-800">فقط بخش‌هایی که مبلغ دارند ثبت می‌شوند. همهٔ ثبت‌ها یک‌جا ذخیره می‌شوند؛ در صورت خطا هیچ‌کدام ثبت نخواهند شد.</p>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error.message}</p>}<div className="flex flex-wrap gap-2"><button disabled={busy} className={primaryButton}>{busy?'در حال ذخیرهٔ همهٔ بخش‌ها…':'ثبت همهٔ بخش‌ها'}</button><button type="button" className={secondaryButton} onClick={onClose}>انصراف</button></div>
 </form></Modal>
}
