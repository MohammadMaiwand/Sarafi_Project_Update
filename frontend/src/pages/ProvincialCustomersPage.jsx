import { afghanMonths, englishMonths } from '../utils/calendar'
import { useState } from 'react'
import { Link,useNavigate,useParams } from 'react-router-dom'
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query'
import useLanguage from '../hooks/useLanguage'
import { FinancePage,FormField,Modal,StatCard,TableShell,fieldClass,surface,primaryButton,secondaryButton } from '../components/FinanceUI'
import { BalanceCards,ErrorBanner } from '../remittances/UI'
import { useRemittanceActions } from '../remittances/useRemittanceActions'
import { invalidateRemittances } from '../remittances/query'
import { fetchProvincialCustomerLedger,updateProvincialReceivedCustomer,fetchProvincialReceivedCustomersSummary,fetchCustomerRemaining,fetchCustomerTransactions,createRemainingTransaction } from '../remittanceApi'
import { formatAmount,shamsi } from '../utils/remittance'
import { units,fixedUnits } from '../utils/colleagueMoney'
import { today } from '../remittances/config'

const currentYear=()=>Number(shamsi(today()).split('/')[0])
const customerRoute=row=>row.recipientName?`/provincial-received/customer/${encodeURIComponent(row.recipientName)}`:`/provincial-received/customer-by-id/${row.sourceRemittanceId}`

export function ProvincialCustomersPage(){
 const {ui,lang}=useLanguage(),navigate=useNavigate(),[year,setYear]=useState(currentYear),[month,setMonth]=useState('')
 const valid=Number.isInteger(Number(year))&&Number(year)>=1200&&Number(year)<=1600
 const query=useQuery({queryKey:['provincial-received-customers-summary',year,month||'all'],queryFn:({signal})=>fetchProvincialReceivedCustomersSummary({year,month},signal),enabled:valid})
 const data=query.data,rows=data?.customers||[],grand=data?.grandTotal
 return <FinancePage title="خلاصه مشتریان ولایتی" action={<Link className={secondaryButton} to="/provincial-received">{ui('بازگشت به فهرست')}</Link>}>
  <section className={`${surface} flex flex-wrap items-end gap-4 p-4`}><FormField label="سال شمسی" id="report-year"><input id="report-year" type="number" min="1200" max="1600" className={fieldClass} value={year} onChange={event=>setYear(event.target.value)}/></FormField><FormField label="ماه شمسی" id="report-month"><select id="report-month" className={fieldClass} value={month} onChange={event=>setMonth(event.target.value)}><option value="">{ui('همه ماه‌ها')}</option>{Array.from({length:12},(_,index)=>index+1).map(value=><option key={value} value={value}>{(lang==='en'?englishMonths:afghanMonths)[value-1]}</option>)}</select></FormField><button className={secondaryButton} onClick={()=>query.refetch()} disabled={!valid||query.isFetching}>{ui('تازه‌سازی')}</button>{data&&valid&&<p className="text-sm text-gray-500">{ui('بازه گزارش')}: <span dir="ltr">{shamsi(data.period.fromDate)} — {shamsi(data.period.toDate)}</span> · AFN</p>}</section>
  <ErrorBanner error={!valid?'سال شمسی معتبر نیست.':query.error} onRetry={query.error?()=>query.refetch():undefined}/>
  {query.isFetching&&<p role="status">{ui('در حال بارگذاری…')}</p>}
  <BalanceCards balance={{received:grand?.totalReceived,paid:grand?.totalDistributed,remaining:grand?.remaining}}/>
  {!query.isPending&&!rows.length&&<p className="text-sm text-gray-500">{ui('در این بازه معامله‌ای یافت نشد.')}</p>}
  <section className={surface}><TableShell loading={query.isPending} headers={['#','نام دریافت‌کننده','نام پدر دریافت‌کننده','تعداد معاملات','مجموع دریافتی (افغانی)','مجموع توزیع (افغانی)','مانده دوره (افغانی)']} rows={[
   ...rows.map((row,index)=><tr key={row.recipientName||`source-${row.sourceRemittanceId}`} role="link" tabIndex={0} className="cursor-pointer hover:bg-blue-50/60 dark:hover:bg-gray-800" onClick={()=>navigate(customerRoute(row))} onKeyDown={event=>{if(event.target===event.currentTarget&&['Enter',' '].includes(event.key)){event.preventDefault();navigate(customerRoute(row))}}}><td className="p-4">{index+1}</td><td className="p-4 font-semibold"><Link to={customerRoute(row)}>{row.recipientName||ui('نام ثبت نشده')}</Link></td><td className="p-4">{row.recipientFatherName||'—'}</td><td className="p-4">{row.transactionCount}</td>{['totalReceived','totalDistributed','remaining'].map(key=><td key={key} className="p-4" dir="ltr">{formatAmount(row[key])}</td>)}</tr>),
   <tr key="grand-total" className="financial-report-total-row bg-emerald-50 font-bold dark:bg-emerald-950/40"><th scope="row" className="p-4">{ui('مجموع کل')}</th><td className="p-4">—</td><td className="p-4">—</td><td className="p-4">{grand?.transactionCount||0}</td>{['totalReceived','totalDistributed','remaining'].map(key=><td key={key} className="p-4" dir="ltr">{formatAmount(grand?.[key]||'0.000')}</td>)}</tr>
  ]}/></section>
  <p className="text-xs text-gray-500">{ui('این گزارش خالص همان دوره است؛ موجودی واقعی هر مشتری در پرونده او نمایش داده می‌شود.')}</p>
 </FinancePage>
}

function EditCustomerModal({person,onClose,onSave,pending,error}){
 const {ui}=useLanguage(),[name,setName]=useState(person.recipientName),[father,setFather]=useState(person.recipientFatherName||'')
 return <Modal title="ویرایش مشتری ولایتی" onClose={()=>!pending&&onClose()} width="max-w-xl"><form className="space-y-5" onSubmit={event=>{event.preventDefault();onSave({currentRecipientName:person.recipientName,recipientName:name.trim(),recipientFatherName:father.trim()})}}>
  <ErrorBanner error={error}/><p className="text-sm text-gray-500">{ui('نام و ولد در تمام حواله‌ها و حساب توزیع همین مشتری یکجا اصلاح می‌شوند.')}</p>
  <FormField label="نام دریافت‌کننده" id="history-recipientName"><input id="history-recipientName" required maxLength={200} className={fieldClass} value={name} onChange={event=>setName(event.target.value)}/></FormField><FormField label="نام پدر دریافت‌کننده" id="history-fatherName"><input id="history-fatherName" maxLength={200} className={fieldClass} value={father} onChange={event=>setFather(event.target.value)}/></FormField>
  <div className="flex gap-3"><button disabled={pending||!name.trim()} className={primaryButton}>{ui(pending?'در حال ذخیره…':'ذخیره')}</button><button type="button" disabled={pending} className={secondaryButton} onClick={onClose}>{ui('انصراف')}</button></div>
 </form></Modal>
}

export function ProvincialCustomerHistoryPage(){
 const {ui}=useLanguage(),{customer,id}=useParams(),client=useQueryClient(),navigate=useNavigate(),[editing,setEditing]=useState(false)
 const query=useQuery({queryKey:['provincial-history',customer,id],queryFn:({signal})=>fetchProvincialCustomerLedger(customer,id,signal)})
 const {actions,confirmation,actionError}=useRemittanceActions('provincial-received'),data=query.data,person=data?.customer
 const rename=useMutation({mutationFn:updateProvincialReceivedCustomer,onSuccess:async result=>{setEditing(false);await invalidateRemittances(client);navigate(`/provincial-received/customer/${encodeURIComponent(result.customer.recipientName)}`,{replace:true})}})
 const source=data?.sourceRemittanceId,newParams=new URLSearchParams({customer:person?.recipientName||customer||'',father:person?.recipientFatherName||'',...(source?{sourceRemittance:String(source)}:{})})
 return <FinancePage title="تاریخچه تبادلات مشتری" action={<div className="flex flex-wrap gap-2"><Link className={primaryButton} to={`/provincial-received/new?${newParams}`}>{ui('حواله جدید برای این مشتری')}</Link>{person?.recipientName&&<button className={secondaryButton} onClick={()=>{rename.reset();setEditing(true)}}>{ui('ویرایش مشتری')}</button>}<Link className={secondaryButton} to="/provincial-received">{ui('بازگشت به فهرست')}</Link></div>}>
  <ErrorBanner error={query.error||actionError} onRetry={()=>query.refetch()}/>
  {query.isFetching&&<p role="status">{ui('در حال بارگذاری…')}</p>}
  {data?.missingRecipientName&&<div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{ui('نام دریافت‌کننده این حواله ثبت نشده است؛ این صفحه فقط همین رکورد را نشان می‌دهد. از ویرایش حواله نام را تکمیل کنید.')}</div>}
  {data?.singleRecordMode&&!data.missingRecipientName&&<p className="text-sm text-gray-500">{ui('نمای تاریخی یک حواله')} · <Link className="text-blue-700 underline dark:text-blue-300" to={`/provincial-received/customer/${encodeURIComponent(person.recipientName)}`}>{ui('نمایش تمام معاملات این مشتری')}</Link></p>}
  {data&&<><section className={`${surface} grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4`}>{[['نام دریافت‌کننده',person.recipientName||'—'],['نام پدر دریافت‌کننده',person.recipientFatherName||'—'],['تعداد معاملات',data.totals.transactionCount],['باقی‌مانده تومان',`${formatAmount(data.tomanBalance.remainingToman)} TOMAN`]].map(([label,value])=><div key={label}><p className="text-xs text-gray-500">{ui(label)}</p><p className="mt-2 break-words font-bold">{value}</p></div>)}</section>
   <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['totalToman','مجموع تومان','TOMAN'],['totalUsd','مجموع دالر','USD'],['totalAfn','مجموع افغانی','AFN']].map(([key,label,currency])=><StatCard key={key} label={label} value={formatAmount(data.totals[key])} suffix={` ${currency}`}/>)}<StatCard label="تعداد معاملات" value={data.totals.transactionCount}/></section>
   {person.id&&<div className="flex flex-wrap gap-3"><Link className={primaryButton} to={`/provincial-received/customer/remittance/${person.id}`}>{ui('کسر باقی‌مانده تومان')}</Link><Link className={secondaryButton} to={`/provincial-received/distributions/${person.id}/entries/new`}>{ui('ثبت توزیع افغانی')}</Link><Link className={secondaryButton} to="/provincial-received/customers-summary">{ui('گزارش ماهانه مشتریان')}</Link></div>}
   <section className={surface}><TableShell loading={query.isPending} headers={['تاریخ شمسی','نرخ دالر','دالر','افغانی به عدد','افغانی به حروف','نوع معامله','شرح','عملیات']} rows={data.results.map(row=><tr key={row.id}><td className="whitespace-nowrap p-4" dir="ltr">{shamsi(row.transactionDate)}</td><td className="p-4" dir="ltr">{formatAmount(row.usdRate)}</td><td className="p-4" dir="ltr">{formatAmount(row.usdAmount)} USD</td><td className="bg-blue-50/40 p-4 dark:bg-blue-950/20" dir="ltr">{formatAmount(row.afnAmount)} AFN</td><td className="min-w-52 p-4">{row.afnAmountInWords}</td><td className="p-4">{ui(row.moneyTransaction)}</td><td className="p-4">{row.description||'—'}</td><td className="p-3">{actions(row)}</td></tr>)}/></section>
   <section><h2 className="mb-3 font-bold">{ui('حساب افغانی — جدا از تومان')}</h2><BalanceCards balance={data.balance}/></section>
   <section className={surface}><h2 className="px-4 pt-5 font-bold">{ui('توزیعات افغانی این مشتری')}</h2><TableShell headers={['تاریخ شمسی','مبلغ افغانی','توضیحات','عملیات']} rows={data.distributions.map(entry=><tr key={entry.id}><td className="p-4">{shamsi(entry.transactionDate)}</td><td className="p-4" dir="ltr">{formatAmount(entry.afnAmount)}</td><td className="p-4">{entry.description||'—'}</td><td className="p-4"><Link className={secondaryButton} to={`/provincial-received/distributions/${entry.person}/entries/${entry.id}/edit`}>{ui('ویرایش')}</Link></td></tr>)}/></section>
  </>}
  {editing&&person&&<EditCustomerModal person={person} onClose={()=>setEditing(false)} onSave={rename.mutate} pending={rename.isPending} error={rename.error}/>}{confirmation}
 </FinancePage>
}

export function ProvincialCustomerRemainingPage(){
 const {ui}=useLanguage(),{id}=useParams(),client=useQueryClient(),[selected,setSelected]=useState(null)
 const valid=/^[1-9]\d*$/.test(id||'')
 const query=useQuery({queryKey:['customer-remaining',id],queryFn:({signal})=>fetchCustomerRemaining(id,signal),enabled:valid})
 const history=useQuery({queryKey:['customer-transactions',id],queryFn:({signal})=>fetchCustomerTransactions(id,signal),enabled:valid})
 const deduction=useMutation({mutationFn:()=>createRemainingTransaction({customerId:Number(id),referenceId:selected.referenceId,amount:selected.amount}),onSuccess:async()=>{setSelected(null);await invalidateRemittances(client)}})
 const data=query.data,remaining=units(data?.balance||0),amount=units(selected?.amount||0)
 return <FinancePage title="کسر باقی‌مانده تومان" subtitle={data?.customer.recipientName||''} action={<Link className={secondaryButton} to={data?`/provincial-received/customer/${encodeURIComponent(data.customer.recipientName)}`:'/provincial-received'}>{ui('بازگشت به تاریخچه مشتری')}</Link>}>
  <ErrorBanner error={!valid?'شناسه مشتری معتبر نیست.':query.error||history.error||deduction.error} onRetry={valid?()=>{query.refetch();history.refetch()}:undefined}/>
  {query.isFetching&&<p role="status">{ui('در حال بارگذاری…')}</p>}
  {data&&<><div className="grid gap-3 sm:grid-cols-3"><StatCard label="باقی‌مانده تومان" value={formatAmount(data.balance)} suffix=" TOMAN"/><StatCard label="مبلغ انتخاب‌شده" value={formatAmount(selected?.amount||'0.000')} suffix=" TOMAN"/><StatCard label="مانده پس از کسر" value={formatAmount(fixedUnits(remaining-amount))} suffix=" TOMAN"/></div>
   <section className={`${surface} space-y-4 p-5`}><h2 className="font-bold">{ui('اقلام تومان قابل کسر')}</h2><p className="text-sm text-gray-500">{ui('هر قلم مبلغ تومان یک حواله است؛ پس از تأیید، همان قلم فقط یک بار کسر می‌شود. حساب افغانی تغییر نمی‌کند.')}</p><div className="grid gap-3 sm:grid-cols-2">{data.items.map(item=><button key={item.id} type="button" aria-pressed={selected?.id===item.id} onClick={()=>{setSelected(item);deduction.reset()}} className={`${secondaryButton} !justify-between !p-4 ${selected?.id===item.id?'!border-blue-500 !bg-blue-50 dark:!bg-blue-950/40':''}`}><span>{item.title}<small className="mt-1 block">{shamsi(item.transactionDate)}</small></span><strong dir="ltr">{formatAmount(item.amount)} TOMAN</strong></button>)}</div>{!data.items.length&&<p className="text-sm text-gray-500">{ui('قلم تومان قابل کسر باقی نمانده است.')}</p>}<button disabled={!selected||deduction.isPending||amount>remaining} className={primaryButton} onClick={()=>deduction.mutate()}>{ui(deduction.isPending?'در حال ذخیره…':'تأیید کسر تومان')}</button>{deduction.isSuccess&&<p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{ui('کسر تومان با موفقیت ثبت شد.')}</p>}</section>
   <section className={surface}><h2 className="p-5 font-bold">{ui('تاریخچه کسر تومان')}</h2><TableShell loading={history.isPending} headers={['#','نوع معامله','مبلغ (تومان)','مانده پس از کسر','تاریخ شمسی']} rows={(history.data?.transactions||[]).map((row,index)=><tr key={row.id}><td className="p-4">{index+1}</td><td className="p-4">{ui('کسر باقی‌مانده تومان')}</td><td className="p-4" dir="ltr">{formatAmount(row.amount)}</td><td className="p-4" dir="ltr">{formatAmount(row.balanceAfter)}</td><td className="p-4" dir="ltr">{shamsi(new Date(row.createdAt).toLocaleDateString('en-CA',{timeZone:'Asia/Kabul'}))}<small className="block">{new Date(row.createdAt).toLocaleTimeString('en-GB',{timeZone:'Asia/Kabul'})}</small></td></tr>)}/></section>
  </>}
 </FinancePage>
}
