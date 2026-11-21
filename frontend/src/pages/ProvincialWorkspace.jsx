import {useState} from 'react'
import {Link,useParams,useSearchParams} from 'react-router-dom'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {FinancePage,EmptyState,FormField,fieldClass,surface,primaryButton,secondaryButton} from '../components/FinanceUI'
import {ErrorBanner,Pagination} from '../remittances/UI'
import {AfghanMonthInput} from '../components/AfghanDate'
import {solarMonth,monthTitle} from '../utils/calendar'
import {presentNumber} from '../utils/presentation'
import {shamsi} from '../utils/remittance'
import {provincialRequest as api,provinceQuery} from '../provincialApi'
import {RepresentativeForm,ProvincialRemittanceForm,ProvincialPaymentForm,ProvincialPaymentPicker} from './ProvincialForms'
import ProvincialPartyForm from '../components/ProvincialPartyForm'
import ProvincialAccountSummary from '../components/ProvincialAccountSummary'
import {printFinancialReceipt} from '../utils/printReceipt'

const labels={PROVINCIAL_OUT:'حواله رفت',PROVINCIAL_IN:'حواله آمد'}
export default function ProvincialWorkspace({workspace='provincial'}){
 const received=workspace==='received',base=received?'/outgoing':'/provincial-remittances',accountBase=received?'/outgoing/accounts':'/provincial-accounts'
 const [params]=useSearchParams(),province=params.get('province')||''
 const [search,setSearch]=useState(''),[modal,setModal]=useState(false)
 const client=useQueryClient()
 const catalog=useQuery({queryKey:['provinces'],queryFn:()=>api('/provinces/')})
 const accounts=useQuery({queryKey:['province-accounts',workspace,province],queryFn:()=>api(`/provinces/${province}/accounts/?${provinceQuery({workspace})}`),enabled:!!province})
 const selected=catalog.data?.results.find(row=>row.code===province)
 return <FinancePage title={province?`اکونت‌های ${selected?.name||province}`:received?'لیست حواله دریافتی ولایتی':'حواله ولایتی'} subtitle="ولایت را انتخاب کنید، اکونت بسازید و معاملات رفت و آمد همان اکونت را مدیریت کنید." action={province?<div className="flex gap-2"><Link className={secondaryButton} to={base}>همه ولایت‌ها</Link><button className={primaryButton} onClick={()=>setModal(true)}>ایجاد اکونت</button></div>:null}>
  <ErrorBanner error={catalog.error||accounts.error}/>
  {received&&<div><Link className={secondaryButton} to="/outgoing/records">سوابق قبلی حواله دریافتی ولایتی</Link></div>}
  <input aria-label="جستجو" type="search" className={fieldClass} placeholder={province?'جستجوی نام یا شماره تماس اکونت…':'جستجوی ولایت…'} value={search} onChange={e=>setSearch(e.target.value)}/>
  {!province?<section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{catalog.isPending?<p role="status">در حال دریافت ولایت‌ها…</p>:catalog.data?.results.filter(row=>`${row.name} ${row.english_name}`.toLowerCase().includes(search.toLowerCase())).map(row=><Link key={row.code} to={`?province=${row.code}`} className={`${surface} p-6 text-lg font-bold text-blue-700 hover:border-blue-500`}>{row.name}<span className="mt-2 block text-sm font-normal text-gray-500">مشاهده اکونت‌ها ←</span></Link>)}</section>:<section className={surface}>
   <div className="ui-account-list-header grid grid-cols-3 gap-3 border-b p-4 font-bold"><span>نام اکونت</span><span>شماره تماس</span><span>معاملات</span></div>
   {accounts.isPending?<p role="status" className="p-5">در حال دریافت اکونت‌ها…</p>:accounts.data?.results.filter(row=>`${row.name} ${row.profile.phone||''}`.includes(search)).map(row=><Link key={row.id} to={`${accountBase}/${row.id}`} className="ui-account-row grid grid-cols-3 gap-3 border-b p-5 transition hover:bg-blue-50 focus:bg-blue-50 dark:hover:bg-gray-800"><b>{row.name}</b><span dir="ltr" className="text-right">{row.profile.phone||'—'}</span><span className="text-blue-700">تمام معاملات رفت و آمد ←</span></Link>)}
   {!accounts.isPending&&!accounts.data?.results.length&&<EmptyState title="هنوز اکونتی ساخته نشده است" description="با دکمهٔ ایجاد اکونت، مشخصات مشتری این ولایت را ثبت کنید."/>}
  </section>}
  {modal&&<RepresentativeForm workspace={workspace} province={province} agencies={accounts.data?.agencies||[]} onClose={()=>setModal(false)} onSaved={async()=>{setModal(false);await client.invalidateQueries({queryKey:['province-accounts']})}}/>}
 </FinancePage>
}

export function ProvincialAccountWorkspace({workspace='provincial'}){
 const base=workspace==='received'?'/outgoing':'/provincial-remittances'
 const {accountId}=useParams(),client=useQueryClient()
 const [month,setMonth]=useState(solarMonth),[all,setAll]=useState(true),[direction,setDirection]=useState(''),[page,setPage]=useState(1),[modal,setModal]=useState(null)
 const period={month:all?'':month,history:all?'all':''}
 const summary=useQuery({queryKey:['provincial-account-summary',workspace,accountId,period],queryFn:()=>api(`/provincial/accounts/${accountId}/remittances-summary/?${provinceQuery({...period,workspace})}`)})
 const rows=useQuery({queryKey:['provincial-remittances',workspace,accountId,period,direction,page],queryFn:()=>api(`/provincial/remittances/?${provinceQuery({workspace,account:accountId,month:period.month,direction,page,pageSize:20})}`)})
 const account=summary.data?.account
 const catalog=useQuery({queryKey:['provinces'],queryFn:()=>api('/provinces/')})
 const provinceName=catalog.data?.results.find(row=>row.code===account?.province)?.name
 async function saved(){setModal(null);await Promise.all(['provincial-remittances','provincial-account-summary','province-accounts','province-ledger','provincial-payment-customers','provincial-payments'].map(key=>client.invalidateQueries({queryKey:[key]})))}
 return <FinancePage title={account?`معاملات ${account.name}`:'معاملات اکونت'} subtitle={`${provinceName||''} · ${account?.profile.phone||''}`} action={<Link className={secondaryButton} to={`${base}${account?`?province=${account.province}`:''}`}>بازگشت به اکونت‌ها</Link>}>
  <div className="flex flex-wrap gap-3">{Object.entries(labels).map(([key,label])=><button key={key} disabled={!account} className={primaryButton} onClick={()=>setModal({type:'new',direction:key})}>+ ثبت {label}</button>)}</div>
  <button disabled={!account} className={primaryButton} onClick={()=>setModal({type:'payment'})}>+ ثبت پرداخت / پیش‌پرداخت</button>
  <ErrorBanner error={summary.error||rows.error}/>
  <section className={`${surface} flex flex-wrap items-end gap-4 p-5`}><FormField label="ماه شمسی" id="account-month"><AfghanMonthInput id="account-month" className={fieldClass} disabled={all} value={month} onChange={e=>{setMonth(e.target.value);setPage(1)}}/></FormField><label className="flex items-center gap-2 py-3"><input type="checkbox" checked={all} onChange={e=>{setAll(e.target.checked);setPage(1)}}/>تمام معاملات اکونت</label><button className={secondaryButton} onClick={()=>window.print()}>چاپ معاملات</button></section>

  <section className={`${surface} overflow-x-auto p-4`}><h2 className="mb-3 font-bold">تمام پرداخت‌های مشتریان — هر پرداخت در یک سطر</h2><table className="w-full min-w-[750px] text-right text-sm"><thead><tr>{['رسید پرداخت','حواله مربوط','تاریخ','فرستنده','گیرنده','مبلغ کسرشده'].map(label=><th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{summary.data?.payments?.map(row=><tr key={row.id} className="border-t"><td className="p-3">{row.reference}{row.reversal?' — برگشت':''}</td><td>{row.remittance}</td><td>{shamsi(row.date)}</td><td>{row.details.sender_name}</td><td>{row.details.recipient_name}</td><td dir="ltr">{presentNumber(-Number(row.amount))} {row.currency}</td></tr>)}</tbody></table>{!summary.isPending&&!summary.data?.payments?.length&&<p className="p-3 text-gray-500">پرداختی در این بازه ثبت نشده است.</p>}</section>

  <div className="flex flex-wrap gap-3">{Object.entries(labels).map(([key,label])=><button key={key} disabled={!account} className={primaryButton} onClick={()=>setModal({type:'new',direction:key})}>+ ثبت {label}</button>)}</div>
  <section className={`${surface} overflow-x-auto`}><div className="flex flex-wrap gap-2 border-b p-4">{[['','تمام معاملات'],...Object.entries(labels)].map(([key,label])=><button key={key} className={direction===key?primaryButton:secondaryButton} onClick={()=>{setDirection(key);setPage(1)}}>{label}</button>)}<span className="p-2 text-sm text-gray-500">{presentNumber(rows.data?.count||0)} معامله</span></div>
   <table className="w-full min-w-[950px] text-right text-sm"><thead><tr>{['شماره','تاریخ','نوع','فرستنده','گیرنده','مبلغ اصلی','مبلغ نهایی','پرداخت‌شده','باقی‌ماندهٔ حواله','مفاد','عملیات'].map(label=><th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{rows.data?.results.map(row=><tr key={row.id} className="border-t dark:border-gray-700"><td className="p-3">{row.number}</td><td>{shamsi(row.date)}</td><td className={row.category==='PROVINCIAL_OUT'?'text-blue-700':'text-emerald-700'}>{labels[row.category]}</td><td>{row.details.sender_name}</td><td>{row.details.recipient_name}</td><td dir="ltr">{presentNumber(row.amount)} {row.currency}</td><td dir="ltr">{presentNumber(row.conversion.net??row.amount)} {row.conversion.destination||row.currency}</td><td dir="ltr">{presentNumber(row.beneficiary.paid)} {row.conversion.destination||row.currency}</td><td dir="ltr">{presentNumber(row.beneficiary.outstanding)} {row.conversion.destination||row.currency}</td><td dir="ltr">{presentNumber(row.manual_profit)} {row.profit_currency||''}</td><td className="flex flex-wrap gap-2 p-3"><button className={secondaryButton} onClick={()=>setModal({type:'details',row})}>جزئیات و پرداخت</button><button className={secondaryButton} onClick={()=>setModal({type:'party',row})}>ویرایش مشخصات</button><button className={secondaryButton} onClick={()=>printFinancialReceipt(row,{name:account?.name},labels[row.category])}>رسید</button></td></tr>)}</tbody></table>
   {rows.isPending?<p role="status" className="p-5">در حال دریافت معاملات…</p>:!rows.data?.results.length&&<EmptyState title="معامله‌ای در این بازه ثبت نشده است"/>}
   <Pagination data={rows.data} page={page} onPage={setPage}/>
  </section>
  <section className={`${surface} overflow-x-auto p-4`}><h2 className="mb-3 font-bold">حساب هر مشتری تا پایان بازه</h2><table className="w-full min-w-[800px] text-right text-sm"><thead><tr>{['مشتری','تماس','واحد پول','حواله آمد','حواله رفت','پرداخت‌ها','بدهکاری مشتری','طلبکاری مشتری','وضعیت','عملیات'].map(label=><th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{summary.data?.customers?.map(row=><tr key={`${row.key}-${row.currency}`} className="border-t"><td className="p-3">{row.name}</td><td>{row.phone||'—'}</td><td>{row.currency}</td>{['incoming','outgoing','paid','debt','credit'].map(key=><td key={key}>{presentNumber(row[key])}</td>)}<td>{row.status}</td><td><button className={secondaryButton} onClick={()=>setModal({type:'advance',row})}>پرداخت جدید</button></td></tr>)}</tbody></table>{!summary.isPending&&!summary.data?.customers?.length&&<p className="p-3">هنوز حساب مشتری ثبت نشده است.</p>}</section>
  <ProvincialAccountSummary totals={summary.data?.totals} all={all} title={`حساب نمایندگی با بخش مرکزی — ${all?'تمام معاملات':monthTitle(month)}`}  loading={summary.isPending}/>
  {modal?.type==='payment'&&<ProvincialPaymentPicker workspace={workspace} accountId={accountId} onClose={()=>setModal(null)} onSelect={row=>setModal({type:row.standalone?'advance':'details',row})}/> }
  {modal?.type==='new'&&account&&<ProvincialRemittanceForm workspace={workspace} province={account.province} provinceName={provinceName} direction={modal.direction} accounts={[account]} initialAccount={account.id} onClose={()=>setModal(null)} onSaved={saved}/>}
  {modal?.type==='advance'&&account&&<ProvincialRemittanceForm workspace={workspace} province={account.province} direction="PROVINCIAL_PAYMENT" accounts={[account]} initialAccount={account.id} initialParty={modal.row.details} onClose={()=>setModal(null)} onSaved={saved}/>}
  {modal?.type==='details'&&<ProvincialPaymentForm row={modal.row} onClose={()=>setModal(null)} onSaved={saved}/>}
  {modal?.type==='party'&&<ProvincialPartyForm row={modal.row} onClose={()=>setModal(null)} onSaved={saved}/>}
 </FinancePage>
}
