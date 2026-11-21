import {useQuery} from '@tanstack/react-query'
import {FaList,FaSearch,FaSort,FaThLarge} from 'react-icons/fa'
import AgencyMonthlyReport from '../components/AgencyMonthlyReport'
import { ManualProfitFields } from './ProvincialForms'
import { ledgerConversion, sumAllocations, projectedBalances } from '../utils/ledgerMath'
import { parseAmount } from '../utils/remittance'
import { bucketLabel, statusLabel } from '../utils/accountLabels'
import { printFinancialReceipt } from '../utils/printReceipt'
import { downloadAccountReport } from '../utils/exportReport'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useLocation } from 'react-router-dom'
import useLanguage from '../hooks/useLanguage'
import { FinancePage, FormField, Modal, fieldClass, primaryButton, secondaryButton, surface } from '../components/FinanceUI'
import { AfghanDateInput, AfghanMonthInput } from '../components/AfghanDate'
import { businessToday, solarMonth, monthTitle } from '../utils/calendar'
import { shamsi } from '../utils/remittance'
import { presentNumber } from '../utils/presentation'
import { API_BASE, getCustomers } from '../api'
import { authHeaders, handleAuthResponse } from '../utils/authSession'

const types={KABUL_DEBTOR:'بدهکار کابل',IRAN_DEBTOR:'بدهکار ایران',CREDITOR:'طلبکار',COLLEAGUE:'همکار',AGENCY:'نمایندگی',CASH:'امانت نقدی',HAWALA:'حواله پرداخت‌نشده',EXCHANGE:'انتظار تبدیل ارز',TERM:'امانت قراردادی'}
const categories={OPENING:'مانده افتتاحیه',LOAN:'قرض جدید',OBLIGATION:'تعهد جدید',COLLECTION:'وصول طلب',PAYMENT:'پرداخت',DEPOSIT:'دریافت اصل امانت',RELEASE:'آزادسازی امانت',CONVERT:'تعهد تبدیل ارز',TEHRAN_RECEIPT:'دریافتی پول تهران',TEHRAN_REMITTANCE:'حواله تهران',PROVINCIAL_IN:'حواله ولایتی وارده',PROVINCIAL_OUT:'حواله ولایتی صادره',BENEFICIARY_PAYOUT:'پرداخت به گیرنده',AGENCY_RECEIPT:'دریافت از نمایندگی',AGENCY_PAYMENT:'پرداخت به نمایندگی',RECEIPT:'دریافت',PUBLIC_DEPOSIT:'سپرده عمومی',COLLEAGUE_DEPOSIT:'سپرده همکار',DISTRIBUTION:'توزیع',SALARY:'معاش',EXPENSE:'مصرف',SHOP_RENT:'کرایه دوکان',CUSTOMER_LOAN:'قرض مشتری',CUSTOMER_CREDIT:'اعتبار مشتری',COLLEAGUE_LOAN:'قرض همکار'}
const detailLabels={sender_name:'نام فرستنده',sender_father:'نام پدر فرستنده',sender_phone:'تماس فرستنده',sender_id:'تذکره فرستنده',sender_location:'محل فرستنده',recipient_name:'نام گیرنده',recipient_father:'نام پدر گیرنده',recipient_phone:'تماس گیرنده',recipient_id:'تذکره گیرنده',province:'ولایت',district:'ولسوالی',village:'قریه یا محل دقیق',payment_location:'محل پرداخت',paying_agency_name:'نمایندگی پرداخت‌کننده',paying_agency_phone:'تماس نمایندگی',agency_settlement:'مبلغ تسویه نمایندگی',agency_currency:'واحد تسویه نمایندگی',payer:'نام پرداخت‌کننده',payee:'نام دریافت‌کننده',payer_phone:'تماس پرداخت‌کننده',payee_phone:'تماس دریافت‌کننده',amount_words:'مبلغ به حروف',purpose:'مرجع مصرف پول',depositor_name:'نام صاحب کارت واریزکننده',depositor_card:'کارت واریزکننده',recipient_card:'کارت گیرنده',duration:'مدت',return_date:'تاریخ برگشت',contract_number:'نمبر قرارداد',office_name:'نام صرافی',office_phone:'تماس دفتر',responsible_officer:'مسئول',conditions:'شرایط نگهداری و آزادسازی',renewal_terms:'شرایط تمدید و فسخ',obligations:'تعهدات طرفین',witnesses:'شاهدان',acknowledgement:'تأیید دریافت‌کننده',owner_address:'آدرس مالک',office_address:'آدرس دفتر',receipt_reference:'مرجع رسید',guarantee:'شرایط ضمانت',early_termination:'فسخ پیش از موعد',special_agreements:'توافقات خاص',fee_notes:'شرح فیس جدا از اصل',actual_received:'مبلغ واقعی دریافت',actual_received_currency:'واحد دریافت',actual_delivered:'مبلغ واقعی تحویل',actual_delivery_currency:'واحد تحویل',final_recipient:'دریافت‌کننده نهایی',acknowledgement_by_depositor:'تأیید سپارنده',acknowledgement_by_cashier:'تأیید صندوقدار',signature_depositor:'امضای سپارنده',signature_cashier:'امضای صندوقدار',signature_recipient:'امضای گیرنده',company_stamp:'مهر شرکت',delay_reason:'دلیل تأخیر',notes:'یادداشت'}
const currencies=['AFN','USD','TOMAN','EUR','TRY','PKR']
const transactionSections={
 PROVINCIAL_IN:{to:'/provincial-inbound',label:'حواله ولایتی وارده'},
 PROVINCIAL_OUT:{to:'/provincial-outbound',label:'حواله ولایتی صادره'},
 TEHRAN_REMITTANCE:{to:'/tehran-remittances',label:'حواله تهران'},
 TEHRAN_RECEIPT:{to:'/tehran-remittances',label:'دریافتی تهران'},
 BENEFICIARY_PAYOUT:{to:'/unpaid-remittances',label:'تسویه گیرنده حواله'},
 AGENCY_RECEIPT:{to:'/provincial-remittances',label:'تسویه نمایندگی'},
 AGENCY_PAYMENT:{to:'/provincial-remittances',label:'تسویه نمایندگی'},
 CUSTOMER_LOAN:{to:'/debtors',label:'قرض مشتری'},
 CUSTOMER_CREDIT:{to:'/creditors',label:'طلبکاری مشتری'},
 COLLEAGUE_LOAN:{to:'/colleagues',label:'معاملات همکار'},
 COLLEAGUE_DEPOSIT:{to:'/colleagues',label:'سپرده همکار'},
 PUBLIC_DEPOSIT:{to:'/custody',label:'سپرده عمومی'},
 DEPOSIT:{to:'/custody',label:'دریافت امانت'},
 RELEASE:{to:'/custody',label:'آزادسازی امانت'},
 DISTRIBUTION:{to:'/outgoing',label:'توزیع نمایندگی'},
 SALARY:{to:'/outgoing',label:'معاش نمایندگی'},
 EXPENSE:{to:'/expenses',label:'مصارف'},
 SHOP_RENT:{to:'/outgoing',label:'کرایه نمایندگی'},
}
function transactionSection(doc,account){
 const section=transactionSections[doc.category]
 if(section)return section
 if(['KABUL_DEBTOR','IRAN_DEBTOR'].includes(account.kind))return {to:'/debtors',label:'حساب بدهکاران'}
 if(account.kind==='CREDITOR')return {to:`/creditors/${account.id}`,label:'حساب طلبکار'}
 if(account.kind==='COLLEAGUE')return {to:account.colleague?`/colleagues/${account.colleague}`:'/colleagues',label:'حساب همکار'}
 if(['CASH','TERM','HAWALA','EXCHANGE'].includes(account.kind))return {to:'/custody',label:'امانت‌ها و سپرده‌ها'}
 return {to:`/financial-accounts/${account.id}`,label:'جزئیات همین حساب'}
}
function transactionSearchText(doc){
 return [doc.number,doc.date,categories[doc.category],doc.category,doc.amount,doc.currency,doc.operator,
  doc.details?.sender_name,doc.details?.recipient_name,doc.details?.province,doc.details?.notes]
  .filter(Boolean).join(' ').toLocaleLowerCase()
}
async function api(path,data,method){
 const response=await fetch(`${API_BASE}/ledger${path}`,{method:method||(data?'POST':'GET'),headers:{'Content-Type':'application/json',...authHeaders()},...(data?{body:JSON.stringify(data)}:{})})
 handleAuthResponse(response)
 const result=await response.json()
 if(!response.ok){const error=new Error(response.status===401?'برای دسترسی امن، خارج شوید و دوباره وارد شوید.':Object.entries(result).map(([k,v])=>`${k}: ${Array.isArray(v)?v.join('، '):v}`).join('؛ '));error.fields=result;throw error}
 return result
}
function Select({value,onChange,values,optional=false,disabled=false}){return <select disabled={disabled} className={fieldClass} value={value||''} onChange={e=>onChange(e.target.value)}>{optional&&<option value="">انتخاب اختیاری</option>}{Object.entries(values).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select>}

export default function LedgerPage(){
 const {ui}=useLanguage(),{accountId}=useParams(),location=useLocation()
 const [loading,setLoading]=useState(true),[accounts,setAccounts]=useState([]),[agencies,setAgencies]=useState([]),[customers,setCustomers]=useState([]),[options,setOptions]=useState(null),[detail,setDetail]=useState(null),[error,setError]=useState(''),[modal,setModal]=useState(''),[month,setMonth]=useState(solarMonth),[agency,setAgency]=useState('')
 const [accountSearch,setAccountSearch]=useState(''),[accountSort,setAccountSort]=useState('name'),[accountSortDirection,setAccountSortDirection]=useState('asc'),[balanceCurrency,setBalanceCurrency]=useState('AFN')
 const [accountView,setAccountView]=useState('table')
 const [documentSearch,setDocumentSearch]=useState(''),[documentSort,setDocumentSort]=useState('date'),[documentSortDirection,setDocumentSortDirection]=useState('desc')
 const [workflowRows,setWorkflowRows]=useState([]),[legacyRows,setLegacyRows]=useState([]),[identityGroups,setIdentityGroups]=useState(null),[linkedSource,setLinkedSource]=useState(null)
 const workflow=location.pathname==='/provincial-inbound'?'PROVINCIAL_IN':location.pathname==='/provincial-outbound'?'PROVINCIAL_OUT':null
 const unpaidMode=location.pathname==='/unpaid-remittances',identityMode=location.pathname==='/identity-review'
 const reportMode=location.pathname==='/agency-reports'||location.pathname==='/agency-reports/representatives'
 const reload=useCallback(async()=>{setLoading(true);try{setError('');const [a,g,o,c]=await Promise.all([api('/accounts/'),api('/agencies/'),api('/options/'),getCustomers()]);setAccounts(a.results);setAgencies(g.results);setOptions(o);setCustomers(c.customers||[]);if(!accountId)setDetail(null);if(workflow||unpaidMode){const docs=await api('/documents/?'+(workflow?'category='+workflow:'unexecuted=true'));setWorkflowRows(docs.results);if(unpaidMode)setLegacyRows((await api('/legacy-unpaid/')).results)}if(identityMode)setIdentityGroups(await api('/missing-identity/'));if(accountId)setDetail(await api(`/accounts/${accountId}/?month=${month}`))}catch(e){setError(e.message)}finally{setLoading(false)}},[accountId,month,workflow,unpaidMode,identityMode])
 useEffect(()=>{reload()},[reload])
 const reportQuery=useQuery({queryKey:['agency-monthly-report',agency,month],queryFn:()=>api(`/agencies/${agency}/monthly/?month=${month}`),enabled:reportMode&&!!agency})
 const report=reportQuery.data
 const kindFilter=new URLSearchParams(location.search).get('kind')
 const searchAccountText=accountSearch.trim().toLocaleLowerCase()
 const eligibleAccounts=accounts.filter(a=>kindFilter?a.kind===kindFilter:location.pathname==='/custody'?['CASH','HAWALA','EXCHANGE','TERM'].includes(a.kind):location.pathname==='/creditors'?a.kind==='CREDITOR':true)
 const filtered=eligibleAccounts.filter(a=>{
  const searchable=[a.name,types[a.kind],a.kind,a.profile?.phone,a.profile?.identity_number,a.profile?.notes].filter(Boolean).join(' ').toLocaleLowerCase()
  return !searchAccountText||searchable.includes(searchAccountText)
 })
 const sortedAccounts=[...filtered].sort((a,b)=>{
  let order=0
  if(accountSort==='kind')order=(types[a.kind]||a.kind).localeCompare(types[b.kind]||b.kind,'fa')
  else if(accountSort==='balance'){
   const total=row=>(row.balances||[]).reduce((sum,balance)=>balance.currency_id===balanceCurrency?sum+Number(balance.amount||0):sum,0)
   order=total(a)-total(b)
  }else order=a.name.localeCompare(b.name,'fa')
  if(!order)order=a.id-b.id
  return accountSortDirection==='asc'?order:-order
 })
 const visibleDocuments=(detail?.documents||[]).filter(doc=>!documentSearch.trim()||transactionSearchText(doc).includes(documentSearch.trim().toLocaleLowerCase())).sort((a,b)=>{
  let order=documentSort==='amount'?Number(a.amount)-Number(b.amount):documentSort==='category'?(categories[a.category]||a.category).localeCompare(categories[b.category]||b.category,'fa'):String(a.date).localeCompare(String(b.date))
  if(!order)order=a.id-b.id
  return documentSortDirection==='asc'?order:-order
 })
 return <FinancePage title={ui(reportMode?'گزارش نمایندگی‌ها':workflow?categories[workflow]:unpaidMode?'حواله‌های پرداخت‌نشده':identityMode?'نواقص هویت و تماس':detail?detail.name:'حساب‌ها و ثبت مالی')} action={<div className="flex gap-2"><button className={primaryButton} onClick={()=>setModal('account')}>حساب جدید</button><button className={secondaryButton} onClick={()=>setModal('agency')}>نمایندگی جدید</button></div>}>
  <nav className="flex flex-wrap gap-3 text-blue-700"><Link to="/provincial-inbound">حواله ولایتی وارده</Link><Link to="/provincial-outbound">حواله ولایتی صادره</Link><Link to="/unpaid-remittances">حواله‌های پرداخت‌نشده</Link><Link to="/identity-review">نواقص هویت و تماس</Link><Link to="/financial-accounts">حساب‌ها</Link><Link to="/creditors">طلبکاران</Link><Link to="/custody">امانت‌ها</Link><Link to="/agency-reports">گزارش نمایندگی‌ها</Link></nav>
  {(error||reportQuery.error)&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error||reportQuery.error?.message}</p>}
  {loading&&<p role="status" className="p-4 text-gray-500">در حال دریافت حساب‌ها و مانده‌ها…</p>}
  {!loading&&!error&&!accountId&&!reportMode&&!workflow&&!unpaidMode&&!identityMode&&accounts.length===0&&<div className={`${surface} p-8 text-center`}><p>در این بخش هنوز حسابی ثبت نشده است.</p><button className={primaryButton+' mt-4'} onClick={()=>setModal('account')}>ثبت اولین حساب</button></div>}
  {(workflow||unpaidMode)&&<section className={`${surface} space-y-4 p-5`}><button className={primaryButton} onClick={()=>{setLinkedSource(null);setModal('document')}}>ثبت حواله در حساب موجود</button>{workflowRows.map(doc=><div key={doc.id} className="border-t py-3"><Link className="text-blue-700 underline" to={`/financial-accounts/${doc.account}`}>{doc.number} — {shamsi(doc.date)}</Link><p>{presentNumber(doc.amount)} {doc.currency} · مانده گیرنده: {presentNumber(doc.beneficiary?.outstanding)} · مانده نمایندگی: {presentNumber(doc.agency?.outstanding)}</p></div>)}{unpaidMode&&legacyRows.map((source,index)=><div key={index} className="border-t py-3"><span>{source.number} — {shamsi(source.date)} — {presentNumber(source.amount)} {source.currency}</span><button className={secondaryButton} onClick={()=>{setLinkedSource(source);setModal('document')}}>اتصال حواله اصلی به پرداخت‌ها؛ بدون تعهد تکراری</button></div>)}</section>}
  {identityMode&&identityGroups&&<div className="grid gap-4 sm:grid-cols-3">{[['missing_id_only','فقط تذکره ندارد'],['missing_phone_only','فقط تماس ندارد'],['both_missing','تذکره و تماس ندارد']].map(([key,label])=><section key={key} className={`${surface} p-5`}><h2>{label} — {presentNumber(identityGroups[key].length)}</h2><p>{presentNumber(identityGroups.totals?.[key]?.AFN)} AFN / {presentNumber(identityGroups.totals?.[key]?.TOMAN)} TOMAN</p>{identityGroups[key].map(doc=><p key={doc.id}>{doc.number} — {doc.details.sender_name}</p>)}</section>)}</div>}
  {!(workflow||unpaidMode||identityMode)&&(reportMode?<><div className="flex flex-wrap gap-3"><Select value={agency} onChange={setAgency} optional values={Object.fromEntries(agencies.map(a=>[a.id,a.name]))}/><AfghanMonthInput value={month} onChange={e=>setMonth(e.target.value)} className={fieldClass}/></div>{report&&<AgencyMonthlyReport report={report}/>}</>:detail?<>
   <section className={`${surface} p-5`}><div className="flex justify-between"><h2>{types[detail.kind]} — {detail.active?'فعال':'غیرفعال'}</h2><button className={secondaryButton} onClick={()=>setModal('profile')}>ویرایش مشخصات حساب</button></div><dl className="grid gap-3 pt-4 sm:grid-cols-2">{Object.entries(detail.profile).map(([key,value])=><div key={key}><dt className="text-gray-500">{options?.profile_fields[key]||key}</dt><dd>{key==='due_date'?shamsi(value):key==='identity_image'?(value?'ثبت شده':'ثبت نشده'):String(value||'—')}</dd></div>)}</dl></section><div className="flex flex-wrap gap-3">{detail.balances.map(b=><div key={b.currency_id+b.bucket} className={`${surface} p-4`}>{bucketLabel(b.bucket)} <b dir="ltr">{presentNumber(b.amount)} {b.currency_id}</b></div>)}</div>
   <button className={primaryButton} onClick={()=>setModal('document')}>ثبت معامله برای این حساب</button><button className={secondaryButton} onClick={()=>downloadAccountReport(detail,month,categories)}>صدور گزارش ماه انتخاب‌شده</button><AfghanMonthInput value={month} onChange={e=>setMonth(e.target.value)} className={fieldClass}/>
   <section className={`${surface} p-5`}><h2>جمع معاملات و تسویه‌های {monthTitle(month)}</h2>{detail.monthly_totals.map((row,index)=><p key={index} className={['COLLECTION','PAYMENT','RELEASE','BENEFICIARY_PAYOUT','AGENCY_PAYMENT'].includes(row.document__category)?'text-red-700':''}>{categories[row.document__category]||row.document__category}: {presentNumber(row.amount)} {row.currency_id} ({bucketLabel(row.bucket)})</p>)}</section>
   <section className={`${surface} overflow-hidden`}>
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-100 p-4 dark:border-gray-800">
     <div><h2 className="font-bold">فهرست معاملات این حساب</h2><p className="mt-1 text-xs text-gray-500">نوع معامله لینک مستقیم به بخش اصلی مربوط است.</p></div>
     <div className="flex flex-wrap gap-2">
      <label className="relative min-w-60 flex-1"><span className="sr-only">جست‌وجوی معامله</span><FaSearch aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-gray-400"/><input className={`${fieldClass} !py-2.5 ps-9`} value={documentSearch} onChange={e=>setDocumentSearch(e.target.value)} placeholder="جست‌وجو: رسید، نام فرستنده یا گیرنده"/></label>
      <select aria-label="مرتب‌سازی معاملات" className={`${fieldClass} !w-auto !py-2.5`} value={documentSort} onChange={e=>setDocumentSort(e.target.value)}><option value="date">مرتب‌سازی بر اساس تاریخ</option><option value="category">مرتب‌سازی بر اساس نوع معامله</option><option value="amount">مرتب‌سازی بر اساس مبلغ</option></select>
      <button type="button" className={secondaryButton} onClick={()=>setDocumentSortDirection(value=>value==='asc'?'desc':'asc')}><FaSort aria-hidden="true"/>{documentSortDirection==='asc'?'صعودی':'نزولی'}</button>
     </div>
     <p className="w-full text-xs text-gray-500">نمایش {presentNumber(visibleDocuments.length)} معامله از {presentNumber(detail.documents.length)}</p>
    </div>
    <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-start text-sm">
     <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-300"><tr>{['رسید','تاریخ شمسی','نوع معامله / بخش اصلی','مبلغ','واحد','نرخ مؤثر / نتیجه','حالت','مفاد دستی','عملیات'].map(h=><th className="whitespace-nowrap p-3" key={h}>{h}</th>)}</tr></thead>
     <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
      {visibleDocuments.map(doc=><tr key={doc.id} className="hover:bg-blue-50/50 dark:hover:bg-gray-800/60">
       <td className="whitespace-nowrap p-3 font-semibold" dir="ltr">{doc.number}</td><td className="whitespace-nowrap p-3" dir="ltr">{shamsi(doc.date)}</td>
       <td className="min-w-48 p-3"><Link className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4 hover:text-blue-900 dark:text-blue-300" to={transactionSection(doc,detail).to}>{categories[doc.category]||doc.category}</Link><p className="mt-1 text-xs text-gray-500">{transactionSection(doc,detail).label}</p></td>
       <td className="whitespace-nowrap p-3 font-semibold tabular-nums" dir="ltr">{presentNumber(doc.amount)}</td><td className="p-3">{doc.currency}</td>
       <td className="min-w-44 p-3">{doc.conversion?.net?`${presentNumber(doc.conversion.net)} ${doc.conversion.destination}`:'—'}{doc.beneficiary&&<p className="mt-1 text-xs">مانده گیرنده: {presentNumber(doc.beneficiary.outstanding)} ({statusLabel(doc.beneficiary.status)})</p>}{doc.agency&&doc.agency.outstanding!==undefined&&<p className="mt-1 text-xs">مانده نمایندگی: {presentNumber(doc.agency.outstanding)}</p>}</td>
       <td className="p-3">{doc.reversal_of?'برگشت اصلاحی':statusLabel(doc.status)}</td><td className="whitespace-nowrap p-3">{presentNumber(doc.manual_profit)} {doc.profit_currency||''}</td>
       <td className="p-3"><div className="flex gap-2"><button className={secondaryButton} onClick={()=>printFinancialReceipt(doc,detail,categories[doc.category])}>چاپ رسید</button><button className={secondaryButton} onClick={()=>{const reason=window.prompt('دلیل برگشت یا اصلاح');if(reason)api('/documents/',{request_key:crypto.randomUUID(),account:detail.id,category:'REVERSAL',date:businessToday(),currency:doc.currency,amount:doc.amount,reversal_of:doc.id,details:{reason}}).then(reload).catch(e=>setError(e.message))}}>برگشت با ثبت سابقه</button></div></td>
      </tr>)}
      {!visibleDocuments.length&&<tr><td colSpan={9} className="p-8 text-center text-gray-500">{documentSearch?'معامله‌ای با این جست‌وجو یافت نشد.':'برای این حساب هنوز معامله‌ای ثبت نشده است.'}</td></tr>}
     </tbody>
    </table></div>
   </section>
  </>:<section className={`${surface} overflow-hidden`}>
   <div className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-100 p-4 dark:border-gray-800">
    <div><h2 className="font-bold">فهرست حساب‌ها</h2><p className="mt-1 text-xs text-gray-500">جست‌وجو در نام، نوع حساب، شماره تماس و مشخصات ثبت‌شده.</p></div>
    <div className="flex flex-wrap gap-2">
     <div role="group" aria-label="روش نمایش حساب‌ها" className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800">
      <button type="button" aria-pressed={accountView==='cards'} className={`${accountView==='cards'?primaryButton:secondaryButton} !min-h-9 !px-3 !py-2`} onClick={()=>setAccountView('cards')}><FaThLarge aria-hidden="true"/> کارتی</button>
      <button type="button" aria-pressed={accountView==='table'} className={`${accountView==='table'?primaryButton:secondaryButton} !min-h-9 !px-3 !py-2`} onClick={()=>setAccountView('table')}><FaList aria-hidden="true"/> جدولی</button>
     </div>
     <label className="relative min-w-60 flex-1"><span className="sr-only">جست‌وجوی حساب</span><FaSearch aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-gray-400"/><input className={`${fieldClass} !py-2.5 ps-9`} value={accountSearch} onChange={e=>setAccountSearch(e.target.value)} placeholder="نام، نوع حساب یا شماره تماس"/></label>
     <select aria-label="مرتب‌سازی حساب‌ها" className={`${fieldClass} !w-auto !py-2.5`} value={accountSort} onChange={e=>setAccountSort(e.target.value)}><option value="name">مرتب‌سازی بر اساس نام</option><option value="kind">مرتب‌سازی بر اساس نوع حساب</option><option value="balance">مرتب‌سازی بر اساس مانده</option></select>
     {accountSort==='balance'&&<select aria-label="واحد پول برای مرتب‌سازی مانده" className={`${fieldClass} !w-auto !py-2.5`} value={balanceCurrency} onChange={e=>setBalanceCurrency(e.target.value)}>{currencies.map(currency=><option key={currency} value={currency}>{currency}</option>)}</select>}
     <button type="button" className={secondaryButton} onClick={()=>setAccountSortDirection(value=>value==='asc'?'desc':'asc')}><FaSort aria-hidden="true"/>{accountSortDirection==='asc'?'صعودی':'نزولی'}</button>
    </div>
    <p className="w-full text-xs text-gray-500">نمایش {presentNumber(sortedAccounts.length)} حساب از {presentNumber(eligibleAccounts.length)}</p>
   </div>
   {accountView==='table'?<div className="overflow-x-auto"><table className="w-full min-w-[900px] text-start text-sm">
    <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-300"><tr>{['نام حساب','نوع حساب','مانده‌ها به تفکیک واحد','وضعیت'].map(h=><th key={h} className="whitespace-nowrap p-4">{h}</th>)}</tr></thead>
    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
     {sortedAccounts.map(a=><tr key={a.id} className="transition-colors hover:bg-blue-50/60 dark:hover:bg-gray-800/70">
      <td className="p-4"><Link className="font-bold text-blue-700 underline decoration-blue-300 underline-offset-4 hover:text-blue-900 dark:text-blue-300" to={`/financial-accounts/${a.id}`}>{a.name}</Link>{a.profile?.phone&&<p className="mt-1 text-xs text-gray-500" dir="ltr">{a.profile.phone}</p>}</td>
      <td className="p-4"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200">{types[a.kind]||a.kind}</span></td>
      <td className="min-w-80 p-4"><div className="flex flex-wrap gap-2">{(a.balances||[]).length?a.balances.map((b,index)=><span key={`${b.currency_id}-${b.bucket}-${index}`} className="inline-flex items-baseline gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 dark:border-gray-700 dark:bg-gray-900"><b dir="ltr" className="tabular-nums">{presentNumber(b.amount)} {b.currency_id}</b><small className="text-gray-500">{bucketLabel(b.bucket)}</small></span>):<span className="text-xs text-gray-400">بدون ماندهٔ ثبت‌شده</span>}</div></td>
      <td className="p-4">{a.active===false?<span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">غیرفعال</span>:<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">فعال</span>}</td>
     </tr>)}
     {!sortedAccounts.length&&<tr><td colSpan={4} className="p-8 text-center text-gray-500">{accountSearch?'حسابی با این جست‌وجو یافت نشد.':'حسابی برای نمایش وجود ندارد.'}</td></tr>}
    </tbody>
   </table></div>:<div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
    {sortedAccounts.map(a=><Link key={a.id} to={`/financial-accounts/${a.id}`} className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-700">
     <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-lg font-bold text-gray-900 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">{a.name}</h3>{a.profile?.phone&&<p className="mt-1 text-sm text-gray-500" dir="ltr">{a.profile.phone}</p>}</div>{a.active===false?<span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">غیرفعال</span>:<span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">فعال</span>}</div>
     <p className="mt-4"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200">{types[a.kind]||a.kind}</span></p>
     <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800"><p className="mb-2 text-xs font-semibold text-gray-500">مانده‌ها به تفکیک واحد</p><div className="flex flex-wrap gap-2">{(a.balances||[]).length?a.balances.map((b,index)=><span key={`${b.currency_id}-${b.bucket}-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 dark:border-gray-700 dark:bg-gray-800"><b className="block tabular-nums text-gray-900 dark:text-white" dir="ltr">{presentNumber(b.amount)} {b.currency_id}</b><small className="mt-1 block text-gray-500">{bucketLabel(b.bucket)}</small></span>):<span className="text-sm text-gray-400">بدون ماندهٔ ثبت‌شده</span>}</div></div>
     <p className="mt-4 text-sm font-semibold text-blue-700 group-hover:underline dark:text-blue-300">مشاهدهٔ حساب ←</p>
    </Link>)}
    {!sortedAccounts.length&&<p className="col-span-full p-8 text-center text-gray-500">{accountSearch?'حسابی با این جست‌وجو یافت نشد.':'حسابی برای نمایش وجود ندارد.'}</p>}
   </div>}
  </section>)}
  {modal&&options&&<LedgerForm defaultKind={kindFilter||(location.pathname==='/creditors'?'CREDITOR':location.pathname==='/custody'?'CASH':'KABUL_DEBTOR')} mode={modal} account={detail} accounts={accounts} workflow={workflow} linkedSource={linkedSource} customers={customers} agencies={agencies} options={options} onClose={()=>setModal('')} onSaved={async()=>{setModal('');await reload()}}/>}
 </FinancePage>
}

export function LedgerForm({mode,account,accounts=[],customers=[],agencies=[],options={profile_fields:{}},defaultKind='KABUL_DEBTOR',workflow,linkedSource,onClose,onSaved}){
 const [data,setData]=useState({kind:mode==='profile'?account.kind:defaultKind,name:mode==='profile'?account.name:'',customer:mode==='profile'?(account.customer||''):'',colleague:mode==='profile'?(account.colleague||''):'',agency:account?.agency||'',account:account?.id||'',category:linkedSource?(linkedSource.kind==='TEHRAN'?'TEHRAN_REMITTANCE':linkedSource.kind==='outgoing'?'PROVINCIAL_OUT':'PROVINCIAL_IN'):(workflow||'OPENING'),date:businessToday(),currency:linkedSource?.currency||'AFN',amount:linkedSource?.amount||'',destination:'',source_rate:'',destination_rate:'',manual_profit:'',profit_currency:'AFN',fee:'0',fee_currency:'AFN',collection:'SEPARATE',active:account?.active??true,profile:mode==='profile'?{...account.profile}:{},details:linkedSource?{sender_name:linkedSource.sender_name,recipient_name:linkedSource.recipient_name}:{}}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[fieldErrors,setFieldErrors]=useState({}),[allocationAmounts,setAllocationAmounts]=useState({}),[availableRemittances,setAvailableRemittances]=useState([])
 const [requestKey,setRequestKey]=useState(()=>crypto.randomUUID())
 const set=(key,value)=>{if(['account','agency','category','currency'].includes(key)){setAllocationAmounts({});setAvailableRemittances([])}setFieldErrors(current=>({...current,[key]:undefined}));setData(current=>({...current,[key]:value}));setRequestKey(crypto.randomUUID())}
 const nested=(group,key,value)=>set(group,{...data[group],[key]:value})
 const input=(key,label,group=null)=>((key==='amount'&&allocation)||(group==='details'&&['agency_settlement','agency_currency'].includes(key)))?<FormField key={key} label={label} id={`ledger-${key}`}><input id={`ledger-${key}`} readOnly aria-readonly="true" className={`${fieldClass} !bg-blue-50 dark:!bg-blue-950`} value={key==='agency_currency'?(data.destination||data.currency):presentNumber(key==='agency_settlement'?(preview?.net??effectiveAmount):effectiveAmount)}/></FormField>:<FormField key={key} label={label} id={`ledger-${key}`}><input id={`ledger-${key}`} className={`${fieldClass} ${fieldErrors[key]?'!border-red-500 !bg-red-50':''}`} aria-invalid={Boolean(fieldErrors[key])} value={group?data[group][key]||'':data[key]||''} onChange={e=>group?nested(group,key,e.target.value):set(key,e.target.value)}/>{fieldErrors[key]&&<p className="text-sm text-red-600">{String(fieldErrors[key])}</p>}</FormField>
 async function submit(event){event.preventDefault();setBusy(true);setError('');try{let path,payload;if(mode==='profile'){path=`/accounts/${account.id}/`;payload={active:data.active,profile:Object.fromEntries(Object.entries(data.profile).filter(([key,value])=>value!==account.profile[key]))}}else if(mode==='account'){path='/accounts/';payload={kind:data.kind,name:data.name,customer:data.customer||undefined,colleague:data.colleague||undefined,agency:data.agency||undefined,profile:data.profile}}else if(mode==='agency'){path='/agencies/';payload={name:data.name,phone:data.phone,location:data.location}}else{path='/documents/';payload={...data,manual_profit:data.manual_profit===''?null:parseAmount(data.manual_profit),profit_currency:data.manual_profit===''?'':data.profit_currency,amount:parseAmount(effectiveAmount),source_rate:parseAmount(data.source_rate),destination_rate:parseAmount(data.destination_rate),fee:parseAmount(data.fee||'0'),details:{...data.details,...(['PROVINCIAL_IN','PROVINCIAL_OUT','TEHRAN_REMITTANCE'].includes(data.category)?{agency_settlement:preview?.net??parseAmount(effectiveAmount),agency_currency:data.destination||data.currency}:{})},account:account?.id||data.account,...(linkedSource?.legacy_remittance?{legacy_remittance:linkedSource.legacy_remittance}:{}),...(linkedSource?.tehran_transaction?{tehran_transaction:linkedSource.tehran_transaction}:{}),request_key:requestKey,agency:data.agency||undefined,...(['BENEFICIARY_PAYOUT','AGENCY_RECEIPT','AGENCY_PAYMENT'].includes(data.category)?{allocations:Object.entries(allocationAmounts).filter(([,amount])=>Number(parseAmount(amount))>0).map(([remittance,amount])=>({remittance:Number(remittance),amount:parseAmount(amount)}))}:{})}}await api(path,payload,mode==='profile'?'PATCH':undefined);await onSaved()}catch(e){setError(e.message);setFieldErrors(e.fields||{})}finally{setBusy(false)}}
 const allocation=['BENEFICIARY_PAYOUT','AGENCY_RECEIPT','AGENCY_PAYMENT'].includes(data.category)
 const effectiveAmount=allocation?(sumAllocations(allocationAmounts)??''):data.amount
 const preview=ledgerConversion({...data,amount:effectiveAmount})
 const selectedAccount=account||accounts.find(row=>String(row.id)===String(data.account))
 const projected=projectedBalances(selectedAccount,{...data,amount:effectiveAmount},preview)
 useEffect(()=>{if(!allocation)return;let active=true;api('/documents/?'+(data.category==='BENEFICIARY_PAYOUT'?`account=${account?.id||data.account}`:`agency=${data.agency}`)).then(result=>{if(active)setAvailableRemittances(result.results.filter(doc=>doc.beneficiary&&doc.status!=='REVERSED'&&Number(data.category==='BENEFICIARY_PAYOUT'?doc.beneficiary.outstanding:doc.agency?.outstanding)>0))}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[allocation,data.category,data.account,data.agency,account])
 return <Modal title={mode==='document'?'ثبت مالی و رسید':mode==='agency'?'نمایندگی جدید':'حساب جدید'} onClose={onClose} width="max-w-4xl"><form onSubmit={submit} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2">
 {['account','profile'].includes(mode)?<><FormField label="نوع حساب" id="ledger-kind"><Select disabled={mode==='profile'} value={data.kind} onChange={v=>set('kind',v)} values={types}/></FormField><FormField label="مشتری موجود" id="ledger-customer"><Select disabled={mode==='profile'} optional value={data.customer} onChange={v=>set('customer',v)} values={Object.fromEntries(customers.map(c=>[c.id,c.name]))}/></FormField>{data.kind==='COLLEAGUE'&&<FormField label="همکار موجود" id="existing-colleague"><Select disabled={mode==='profile'} optional value={data.colleague} onChange={v=>set('colleague',v)} values={Object.fromEntries((options.colleagues||[]).map(c=>[c.id,c.colleagueName]))}/></FormField>}{!data.customer&&!data.colleague&&input('name','نام کامل')}{mode==='profile'&&<label className="flex gap-3"><input type="checkbox" checked={data.active} onChange={e=>set('active',e.target.checked)}/>حساب فعال</label>}<FormField label="تصویر تذکره؛ اختیاری" id="identity-file"><input id="identity-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>5*1024*1024){setError('حداکثر حجم تصویر ۵ مگابایت است.');return}const reader=new FileReader();reader.onload=()=>nested('profile','identity_image',reader.result);reader.readAsDataURL(file)}}/></FormField>{Object.entries(options.profile_fields).filter(([key])=>key!=='identity_image').map(([key,label])=>['approval','loan_type','classification'].includes(key)?<FormField key={key} label={label} id={`profile-${key}`}><Select optional value={data.profile[key]} onChange={v=>nested('profile',key,v)} values={key==='approval'?{APPROVED:'تأیید شده',PENDING:'در انتظار تأیید',REJECTED:'رد شده'}:key==='loan_type'?{CASH:'نقدی',ACCOUNT:'حساب'}:{PERSONAL:'شخصی',BUSINESS:'تجارتی'}}/></FormField>:key==='due_date'?<FormField key={key} label={label} id="account-due"><AfghanDateInput className={fieldClass} value={data.profile[key]||''} onChange={e=>nested('profile',key,e.target.value)}/></FormField>:input(key,label,'profile'))}</>:mode==='agency'?<>{input('name','نام نمایندگی')}{input('phone','شماره تماس')}{input('location','موقعیت')}</>:<>
 {!account&&<FormField label="حساب مشتری یا نمایندگی" id="document-account"><Select optional value={data.account} onChange={v=>set('account',v)} values={Object.fromEntries(accounts.map(a=>[a.id,a.name+' — '+types[a.kind]]))}/></FormField>}
 <FormField label="نوع معامله" id="ledger-category"><Select value={data.category} onChange={v=>set('category',v)} values={categories}/></FormField><FormField label="تاریخ شمسی" id="ledger-date"><AfghanDateInput required className={fieldClass} value={data.date} onChange={e=>set('date',e.target.value)}/></FormField>
 <FormField label="واحد مبدأ / رسید" id="ledger-currency"><Select value={data.currency} onChange={v=>set('currency',v)} values={Object.fromEntries(currencies.map(c=>[c,c]))}/></FormField>{input('amount','مبلغ')}
 <FormField label="تبدیل مقصد؛ اختیاری" id="ledger-destination"><Select optional value={data.destination} onChange={v=>set('destination',v)} values={Object.fromEntries(currencies.map(c=>[c,c]))}/></FormField>{data.currency!=='USD'&&input('source_rate',`${data.currency} برای یک دالر؛ نرخ دستی`)}{data.destination&&data.destination!=='USD'&&input('destination_rate',`${data.destination} برای یک دالر؛ نرخ دستی`)}
 {input('fee','فیس')}<FormField label="واحد فیس" id="ledger-fee-currency"><Select value={data.fee_currency} onChange={v=>set('fee_currency',v)} values={Object.fromEntries(currencies.map(c=>[c,c]))}/></FormField><FormField label="روش فیس" id="ledger-collection"><Select value={data.collection} onChange={v=>set('collection',v)} values={{SEPARATE:'دریافت جداگانه',DEDUCTED:'کسر از مبلغ مقصد'}}/></FormField>
 {allocation&&<section className="sm:col-span-2 space-y-3 rounded-xl border p-4"><h3>تخصیص صریح رسید؛ مجموع مبالغ باید با مبلغ رسید برابر باشد</h3>{availableRemittances.map(doc=><label key={doc.id} className="flex items-center gap-3"><span>{doc.number} — {presentNumber(data.category==='BENEFICIARY_PAYOUT'?doc.beneficiary?.outstanding:doc.agency?.outstanding)}</span><input aria-label={`مبلغ تخصیص ${doc.number}`} className={fieldClass} value={allocationAmounts[doc.id]||''} onChange={e=>{setAllocationAmounts(current=>({...current,[doc.id]:e.target.value}));setRequestKey(crypto.randomUUID())}}/><button type="button" className={secondaryButton} onClick={()=>{setAllocationAmounts(current=>({...current,[doc.id]:data.category==='BENEFICIARY_PAYOUT'?doc.beneficiary.outstanding:doc.agency.outstanding}));setRequestKey(crypto.randomUUID())}}>پرداخت تمام مانده</button></label>)}</section>}
 {['CUSTOMER_LOAN','COLLEAGUE_LOAN','PUBLIC_DEPOSIT','COLLEAGUE_DEPOSIT'].includes(data.category)&&<FormField label="حساب طرف مقابل" id="counterparty-account"><Select optional value={data.details.counterparty_account} onChange={v=>nested('details','counterparty_account',v)} values={Object.fromEntries(accounts.map(a=>[a.id,a.name+' — '+types[a.kind]]))}/></FormField>}

 {['PROVINCIAL_IN','PROVINCIAL_OUT'].includes(data.category)&&<ManualProfitFields value={data.manual_profit} currency={data.profit_currency} onValue={value=>set('manual_profit',value)} onCurrency={value=>set('profit_currency',value)}/>}
 {Object.entries(detailLabels).map(([key,label])=>key==='return_date'?<FormField key={key} label={label} id="return-date"><AfghanDateInput className={fieldClass} value={data.details[key]||''} onChange={e=>nested('details',key,e.target.value)}/></FormField>:input(key,label,'details'))}
 </>}
 <FormField label="نمایندگی مرتبط" id="ledger-agency"><Select optional value={data.agency} onChange={v=>set('agency',v)} values={Object.fromEntries(agencies.map(a=>[a.id,a.name]))}/></FormField></div>
 {mode==='document'&&<LedgerCalculatedAmounts preview={preview} projected={projected}/>}

 {error&&<p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">{error}</p>}<div className="flex gap-3"><button disabled={busy} className={primaryButton}>ثبت تأییدشده و صدور رسید</button><button type="button" className={secondaryButton} onClick={onClose}>بازگشت</button></div></form></Modal>
}

export function LedgerCalculatedAmounts({preview,projected=[]}){
 return <section className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/30"><h3 className="font-bold">محاسبات خودکار معامله</h3><div className="grid gap-4 sm:grid-cols-3">{[['usd','معادل دالر','USD'],['gross','مقصد ناخالص',preview?.destination],['net','قابل پرداخت خالص',preview?.destination]].map(([key,label,currency])=><FormField key={key} label={`${label} ${currency||''}`} id={`calculated-${key}`}><input id={`calculated-${key}`} readOnly aria-readonly="true" className={fieldClass} dir="ltr" value={presentNumber(preview?.[key])}/></FormField>)}</div>{projected.map(row=><div key={row.currency+row.bucket} className="grid gap-4 sm:grid-cols-2"><FormField label={`مانده فعلی — ${bucketLabel(row.bucket)} ${row.currency}`} id={`current-${row.currency}-${row.bucket}`}><input id={`current-${row.currency}-${row.bucket}`} readOnly className={fieldClass} dir="ltr" value={presentNumber(row.current)}/></FormField><FormField label={`مانده پس از معامله — ${row.currency}`} id={`after-${row.currency}-${row.bucket}`}><input id={`after-${row.currency}-${row.bucket}`} readOnly className={`${fieldClass} ${row.after.startsWith('-')?'!border-red-500 !text-red-700':''}`} dir="ltr" value={presentNumber(row.after)}/></FormField></div>)}<p className="text-xs text-gray-500">مقدار تبدیل، جمع تخصیص‌ها و مانده از مبلغ، نرخ و معاملات تأییدشده حساب می‌شوند. سود واقعی بدون اطلاعات هزینه و فروش قابل محاسبه نیست.</p></section>
}
