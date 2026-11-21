import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FaEdit, FaEye, FaTrashAlt, FaUserFriends } from 'react-icons/fa'
import useLanguage from '../hooks/useLanguage'
import { FinancePage, FormField, StatCard, TableShell, fieldClass, primaryButton, secondaryButton, surface } from '../components/FinanceUI'
import { ConfirmDelete, ErrorBanner, Pagination, TableToolbar } from '../remittances/UI'
import { emptyFilters, defaultOptions } from '../remittances/config'
import { filterParams, useDebounced } from '../remittances/hooks'
import { formatAmount, shamsi } from '../utils/remittance'
import { DebtBadge, DebtorForm, DebtorTransactionModal } from '../debtors/Forms'
import { fetchDebtors, fetchDebtor, fetchPayments, saveDebtor, deleteDebtor, savePayment, deletePayment, invalidateDebtors } from '../debtors/api'

function RowActions({view,edit,remove}){
 const {ui}=useLanguage()
 return <div className="flex gap-2" onClick={event=>event.stopPropagation()}>{[[view,'مشاهده',FaEye,'text-blue-600'],[edit,'ویرایش',FaEdit,'text-amber-600'],[remove,'حذف',FaTrashAlt,'text-red-600']].filter(([action])=>action).map(([action,label,Icon,color])=><button type="button" key={label} title={ui(label)} aria-label={ui(label)} onClick={action} className={`${secondaryButton} !h-10 !w-10 !min-w-10 !px-0 ${color}`}><Icon aria-hidden="true"/></button>)}</div>
}

export function DebtorListPage(){
 const {ui}=useLanguage(),navigate=useNavigate(),[searchParams,setSearchParams]=useSearchParams(),client=useQueryClient()
 const kind=searchParams.get('type')==='LARGE'?'LARGE':'SMALL'
 const [filters,setFilters]=useState({...emptyFilters,sortBy:'created_at',debtStatus:''}),debounced=useDebounced(filters)
 const [card,setCard]=useState(()=>localStorage.getItem('debtors-view')==='card'),[deleting,setDeleting]=useState(null)
 let params,filterError;try{params=filterParams(debounced)}catch(error){filterError=error}
 const query=useQuery({queryKey:['debtor-customers',kind,params],queryFn:({signal})=>fetchDebtors({...params,type:kind},signal),enabled:!!params})
 const deletion=useMutation({mutationFn:deleteDebtor,onSuccess:async()=>{setDeleting(null);await invalidateDebtors(client)}})
 const change=(key,value)=>setFilters(current=>({...current,[key]:value,page:key==='page'?value:1}))
 const tab=type=>{setSearchParams(type==='LARGE'?{type:'LARGE'}:{},{replace:true});change('page',1)}
 const rows=query.data?.results||[]
 const actions=row=><RowActions view={()=>navigate(`/debtors/${row.id}`)} edit={()=>navigate(`/debtors/${row.id}/edit`)} remove={()=>{deletion.reset();setDeleting(row)}}/>
 const open=row=>navigate(`/debtors/${row.id}`)
 const keyOpen=(event,row)=>{if(event.target===event.currentTarget&&['Enter',' '].includes(event.key)){event.preventDefault();open(row)}}
 return <FinancePage title="مشتری‌های بدهکار" subtitle="مدیریت مشتریان بدهکار، ثبت قرض جدید و دریافت پرداخت‌ها." icon={FaUserFriends} action={<Link className={primaryButton} to={`/debtors/new${kind==='LARGE'?'?type=LARGE':''}`}>{ui(kind==='LARGE'?'ثبت بدهکار معاملات بزرگ':'ثبت بدهکار عادی')}</Link>}>
  <div role="tablist" aria-label={ui('نوع بدهکار')} className="flex gap-2"><button role="tab" aria-selected={kind==='SMALL'} className={kind==='SMALL'?primaryButton:secondaryButton} onClick={()=>tab('SMALL')}>{ui('عادی')}</button><button role="tab" aria-selected={kind==='LARGE'} className={kind==='LARGE'?primaryButton:secondaryButton} onClick={()=>tab('LARGE')}>{ui('معاملات بزرگ')}</button></div>
  <div className="grid gap-3 sm:grid-cols-2"><StatCard label="مجموع باقی‌مانده به دالر" value={formatAmount(query.data?.summary?.remaining_usd||'0.00')} suffix=" USD"/><StatCard label="تعداد مشتریان" value={query.data?.count||0}/></div>
  <TableToolbar filters={filters} onChange={change} onReset={()=>setFilters({...emptyFilters,sortBy:'created_at',debtStatus:''})} onRefresh={()=>params&&query.refetch()} isFetching={query.isFetching} options={defaultOptions} card={card} onView={()=>setCard(value=>{localStorage.setItem('debtors-view',value?'table':'card');return !value})}>
   <FormField label="وضعیت قرض" id="debt-status"><select id="debt-status" className={fieldClass} value={filters.debtStatus} onChange={event=>change('debtStatus',event.target.value)}><option value="">{ui('همه')}</option><option value="OPEN">{ui('قرض باز')}</option><option value="PAID">{ui('کاملاً پرداخت‌شده')}</option></select></FormField>
   <button type="button" disabled title={ui('اتصال دستگاه اثر انگشت در انتظار تکمیل است.')} data-feature="FINGERPRINT_DEVICE_INTEGRATION" className={secondaryButton}>{ui('جستجو با اثر انگشت — در انتظار تکمیل')}</button>
  </TableToolbar>
  <ErrorBanner error={filterError||query.error} onRetry={query.error?()=>query.refetch():undefined}/>
  {query.isFetching&&<p role="status">{ui('در حال بارگذاری…')}</p>}
  {card?<section className="grid gap-4 md:grid-cols-2">{rows.map(row=><article role="link" tabIndex={0} key={row.id} onClick={()=>open(row)} onKeyDown={event=>keyOpen(event,row)} className={`${surface} cursor-pointer p-5 transition hover:border-blue-400 hover:shadow-md`}><div className="flex items-start justify-between gap-2"><div><h2 className="font-bold">{row.customer_name}</h2><p className="mt-1 text-xs text-gray-500" dir="ltr">{row.customer_number}</p></div>{actions(row)}</div><p className="mt-3 text-sm text-gray-500">{kind==='LARGE'?`${row.national_id} — ${row.location}`:`${row.father_name} — ${row.phone_number}`}</p><dl className="my-4 space-y-2">{[['original_usd_amount','اصل قرض'],['total_paid_usd','مجموع پرداخت شده'],['remaining_usd','باقی‌مانده']].map(([key,label])=><div className="flex justify-between gap-3" key={key}><dt>{ui(label)}</dt><dd dir="ltr">{formatAmount(row[key])} USD</dd></div>)}</dl><DebtBadge paid={row.is_fully_paid}/></article>)}{!query.isPending&&!rows.length&&<p className={`${surface} p-8 text-center text-gray-500`}>{ui('مشتری بدهکار یافت نشد')}</p>}</section>:<section className={surface}><TableShell loading={query.isPending} headers={['شماره','نام مشتری',...(kind==='SMALL'?['ولد','شماره تماس']:['شماره تذکره','مکان']),'اصل قرض','مجموع پرداخت شده','باقی‌مانده','عملیات']} rows={rows.map(row=><tr key={row.id} role="link" tabIndex={0} onClick={()=>open(row)} onKeyDown={event=>keyOpen(event,row)} className="cursor-pointer hover:bg-blue-50/70 dark:hover:bg-gray-800"><td className="whitespace-nowrap p-4" dir="ltr">{row.customer_number}</td><td className="p-4 font-semibold">{row.customer_name}</td>{(kind==='SMALL'?['father_name','phone_number']:['national_id','location']).map(key=><td className="p-4" key={key}>{row[key]||'—'}</td>)}<td className="p-4" dir="ltr">{formatAmount(row.original_usd_amount)}</td><td className="p-4" dir="ltr">{formatAmount(row.total_paid_usd)}</td><td className="p-4"><div className="flex flex-wrap items-center gap-2"><b dir="ltr">{formatAmount(row.remaining_usd)}</b><DebtBadge paid={row.is_fully_paid}/></div></td><td className="p-3">{actions(row)}</td></tr>)}/></section>}
  <Pagination data={query.data} page={filters.page} onPage={page=>change('page',page)}/>
  {deleting&&<ConfirmDelete title="حذف پرونده بدهکار" number={deleting.customer_number} pending={deletion.isPending} error={deletion.error} onClose={()=>setDeleting(null)} onConfirm={()=>deletion.mutate(deleting.id)}/>}
 </FinancePage>
}

export function DebtorFormPage(){
 const {ui}=useLanguage(),{debtorId}=useParams(),[params]=useSearchParams(),navigate=useNavigate(),client=useQueryClient()
 const kind=params.get('type')==='LARGE'?'LARGE':'SMALL'
 const query=useQuery({queryKey:['debtor-customer',debtorId],queryFn:({signal})=>fetchDebtor(debtorId,signal),enabled:!!debtorId})
 const save=useMutation({mutationFn:values=>saveDebtor(values,debtorId),onSuccess:async row=>{await invalidateDebtors(client);navigate(debtorId?`/debtors/${row.id}`:`/debtors${row.debtor_type==='LARGE'?'?type=LARGE':''}`)}})
 return <FinancePage title={debtorId?'ویرایش مشتری بدهکار':'ثبت مشتری بدهکار'} action={<Link className={secondaryButton} to={debtorId?`/debtors/${debtorId}`:`/debtors${kind==='LARGE'?'?type=LARGE':''}`}>{ui('بازگشت')}</Link>}>
  <ErrorBanner error={query.error} onRetry={()=>query.refetch()}/>
  {debtorId&&query.isPending?<p role="status">{ui('در حال بارگذاری…')}</p>:!query.error&&<section className={`${surface} p-5 sm:p-6`}><DebtorForm key={debtorId||kind} initial={query.data} type={kind} mode={debtorId?'edit':'create'} onSave={save.mutate} pending={save.isPending} error={save.error}/></section>}
 </FinancePage>
}

export function DebtorViewPage(){
 const {ui}=useLanguage(),{debtorId}=useParams(),client=useQueryClient()
 const query=useQuery({queryKey:['debtor-customer',debtorId],queryFn:({signal})=>fetchDebtor(debtorId,signal)})
 const history=useQuery({queryKey:['debtor-payment-history',debtorId],queryFn:({signal})=>fetchPayments(debtorId,signal)})
 const [transaction,setTransaction]=useState(null),[deleting,setDeleting]=useState(null)
 const save=useMutation({mutationFn:values=>savePayment(debtorId,values,transaction?.initial?.id),onSuccess:async()=>{setTransaction(null);await invalidateDebtors(client)}})
 const deletion=useMutation({mutationFn:id=>deletePayment(debtorId,id),onSuccess:async()=>{setDeleting(null);await invalidateDebtors(client)}})
 const row=query.data
 const open=(kind,initial)=>{save.reset();setTransaction({kind,initial})}
 return <FinancePage title={row?`${ui('مشاهده مشتری بدهکار')} — ${row.customer_name}`:'مشاهده مشتری بدهکار'} icon={FaUserFriends} action={row&&<div className="flex flex-wrap gap-2"><button className={primaryButton+' !bg-red-600'} onClick={()=>open('LOAN')}>{ui('ثبت گرفت پول')}</button><button className={primaryButton+' !bg-emerald-600'} onClick={()=>open('PAYMENT')}>{ui('ثبت رسید پول')}</button><Link className={secondaryButton} to={`/debtors/${debtorId}/edit`}>{ui('ویرایش')}</Link></div>}>
  <ErrorBanner error={query.error||history.error} onRetry={()=>{query.refetch();history.refetch()}}/>
  {query.isPending&&<p role="status">{ui('در حال بارگذاری…')}</p>}
  {row&&<><div className="flex flex-wrap items-center gap-3"><Link className={secondaryButton} to={`/debtors${row.debtor_type==='LARGE'?'?type=LARGE':''}`}>{ui('بازگشت به فهرست')}</Link><DebtBadge paid={row.is_fully_paid}/></div>
   <section className={`${surface} p-5 sm:p-6`}><h2 className="mb-5 font-bold">{ui('معلومات هویتی و حساب مشتری')}</h2><DebtorForm key={`${debtorId}-${row.updated_at}-${row.remaining_usd}`} mode="view" initial={row}/></section>
   <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['original_usd_amount','اصل قرض'],['total_loan_usd','مجموع گرفت پول'],['total_paid_usd','مجموع پرداخت شده'],['remaining_usd','باقی‌مانده']].map(([key,label])=><StatCard key={key} label={label} value={formatAmount(row[key])} suffix=" USD"/>)}</section>
   <section className={surface}><h2 className="p-5 font-bold">{ui('تاریخچهٔ قرض و پرداخت')}</h2><TableShell loading={history.isPending} headers={['تاریخ شمسی','نوع رویداد','مبلغ دالر','معادل افغانی','نرخ دالر تاریخی','یادداشت','عملیات']} rows={(history.data?.payments||row.payments||[]).map(payment=><tr key={payment.id}><td className="whitespace-nowrap p-4" dir="ltr">{shamsi(payment.payment_date)}<small className="mt-1 block text-gray-500">{new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kabul',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(payment.created_at))}</small></td><td className={`p-4 font-semibold ${payment.payment_type==='LOAN'?'text-red-600':'text-emerald-600'}`}>{ui(payment.payment_type==='LOAN'?'گرفت پول':'رسید پول')}</td><td className="p-4" dir="ltr">{formatAmount(payment.payment_usd_amount)}</td><td className="p-4" dir="ltr">{formatAmount(payment.payment_afn_amount)}</td><td className="p-4" dir="ltr">{formatAmount(payment.usd_rate)}</td><td className="p-4">{payment.note||payment.payment_description||'—'}</td><td className="p-3"><RowActions edit={()=>open(payment.payment_type,payment)} remove={()=>{deletion.reset();setDeleting(payment)}}/></td></tr>)}/></section>
  </>}
  {row&&transaction&&<DebtorTransactionModal key={transaction.initial?.id||transaction.kind} customer={row} kind={transaction.kind} initial={transaction.initial} onClose={()=>setTransaction(null)} onSave={save.mutate} pending={save.isPending} error={save.error}/>}
  {deleting&&<ConfirmDelete title="حذف رویداد قرض" number={formatAmount(deleting.payment_usd_amount)} pending={deletion.isPending} error={deletion.error} onClose={()=>setDeleting(null)} onConfirm={()=>deletion.mutate(deleting.id)}/>}
 </FinancePage>
}

export default function DebtorsPage(){
 const {debtorId}=useParams(),location=useLocation()
 return location.pathname.endsWith('/new')||location.pathname.endsWith('/edit')?<DebtorFormPage/>:debtorId?<DebtorViewPage/>:<DebtorListPage/>
}
