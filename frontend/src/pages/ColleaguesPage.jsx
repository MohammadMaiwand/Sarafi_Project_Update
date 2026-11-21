import { AfghanMonthInput } from '../components/AfghanDate'
import { solarMonth } from '../utils/calendar'
import { presentRate } from '../utils/presentation'
import { useState } from 'react'
import { Link,useLocation,useNavigate,useParams,useSearchParams } from 'react-router-dom'
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query'
import { FaArrowDown,FaArrowUp,FaEdit,FaEye,FaTrashAlt,FaUsers } from 'react-icons/fa'
import useLanguage from '../hooks/useLanguage'
import { FinancePage,FormField,TableShell,fieldClass,surface,primaryButton,secondaryButton } from '../components/FinanceUI'
import { BalanceCards,ConfirmDelete,ErrorBanner,Pagination,TableToolbar } from '../remittances/UI'
import { emptyFilters,defaultOptions } from '../remittances/config'
import { useDebounced } from '../remittances/hooks'
import { formatAmount,shamsi } from '../utils/remittance'
import { colleagueDateParams } from '../utils/colleagueMoney'
import { ColleagueForm,ColleagueTransactionForm } from '../colleagues/Forms'
import { transactionLabel,colleagueTitle } from '../colleagues/config'
import { fetchColleagues,fetchColleague,saveColleague,deleteColleague,fetchHistory,fetchTransaction,saveTransaction,deleteTransaction,invalidateColleagues } from '../colleagues/api'

const blankFilters={...emptyFilters,month:'',transactionType:'',sortBy:'created_at'}
function LedgerBalance({balance}){return <BalanceCards balance={{received:balance?.totalReceivedAfn,paid:balance?.totalPaidAfn,remaining:balance?.remainingAfn}}/>}
function NegativeBadge({value,period}){const {ui}=useLanguage();if(!String(value).startsWith('-'))return null;return <span title={ui(period?'این مقدار خالص معاملات بازه انتخاب‌شده است.':'مانده منفی قدیمی؛ دریافت جدید می‌تواند آن را اصلاح کند.')} className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">{ui(period?'خالص منفی دوره':'مانده منفی قدیمی')}</span>}
function Actions({actions}){const {ui}=useLanguage();return <div className="flex flex-wrap gap-1.5" onClick={event=>event.stopPropagation()}>{actions.map(({label,to,action,icon:Icon,color})=>to?<Link key={label} to={to} title={ui(label)} aria-label={ui(label)} className={`${secondaryButton} !h-10 !w-10 !min-w-10 !px-0 ${color||''}`}><Icon aria-hidden="true"/></Link>:<button key={label} type="button" onClick={action} title={ui(label)} aria-label={ui(label)} className={`${secondaryButton} !h-10 !w-10 !min-w-10 !px-0 ${color||''}`}><Icon aria-hidden="true"/></button>)}</div>}
function SuccessNotice({message,onClose}){const {ui}=useLanguage();return message&&<div role="status" className="fixed bottom-4 start-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-xl dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{ui(message)}<button type="button" onClick={onClose} aria-label={ui('بستن')} className="px-2">×</button></div>}
function ColleagueToolbar({filters,setFilters,query,children,card,onView}){
 const {ui}=useLanguage();const change=(key,value)=>setFilters(current=>({...current,[key]:value,page:key==='page'?value:1}))
 return <TableToolbar filters={filters} onChange={change} onReset={()=>setFilters({...blankFilters})} onRefresh={()=>query.refetch()} isFetching={query.isFetching} options={defaultOptions} card={card} onView={onView}>
  <FormField label="ماه شمسی" id="colleague-month"><AfghanMonthInput value={(filters.month||solarMonth()).replace('/','-')} onChange={event=>change('month',event.target.value)} className={fieldClass}/><button type="button" className={secondaryButton} onClick={()=>change('month','')}>همه ماه‌ها</button></FormField>{children}
  {(filters.month||filters.year||filters.dateFrom||filters.dateTo)&&<p className="w-full text-xs text-gray-500">{ui('مجموع‌ها مربوط به بازه معاملات‌اند؛ پرداخت با موجودی واقعی کل حساب کنترل می‌شود.')}</p>}
 </TableToolbar>
}
function TransactionBoard({personId,rows,loading,onDelete}){
 const {ui}=useLanguage(),navigate=useNavigate(),url=id=>`/colleagues/${personId}/transactions/${id}`
 const open=(event,row)=>{if(!event.target.closest('a,button'))navigate(url(row.id))}
 return <section className={surface}><TableShell loading={loading} headers={['شماره معامله','تاریخ شمسی','نوع معامله','نوع پول','مبلغ','نرخ','افغانی','شرح','عملیات']} rows={rows.map(row=><tr key={row.id} tabIndex={0} role="link" className="cursor-pointer hover:bg-blue-50/70 dark:hover:bg-gray-800" onClick={event=>open(event,row)} onKeyDown={event=>{if(event.target===event.currentTarget&&['Enter',' '].includes(event.key)){event.preventDefault();navigate(url(row.id))}}}><td className="whitespace-nowrap p-4" dir="ltr"><Link to={url(row.id)}>{row.transactionNumber}</Link></td><td className="whitespace-nowrap p-4" dir="ltr">{shamsi(row.transactionDate)}</td><td className={`p-4 font-semibold ${row.transactionType==='RECEIVED'?'text-emerald-600':'text-red-600'}`}>{ui(transactionLabel(row.transactionType))}</td><td className="p-4">{row.currencyType}</td><td className="p-4" dir="ltr">{formatAmount(row.amount)}</td><td className="p-4" dir="ltr">{presentRate(row.usdRate,['USD','AFN'].includes(row.currencyType)?'USD':row.currencyType,'AFN').value} {presentRate(row.usdRate,['USD','AFN'].includes(row.currencyType)?'USD':row.currencyType,'AFN').unit}</td><td className="p-4" dir="ltr">{formatAmount(row.afnAmount)}</td><td className="max-w-xs p-4">{row.description||'—'}</td><td className="p-3"><Actions actions={[{label:'مشاهده',to:url(row.id),icon:FaEye},{label:'ویرایش',to:url(row.id)+'/edit',icon:FaEdit},{label:'حذف',action:()=>onDelete(row),icon:FaTrashAlt,color:'!text-red-600'}]}/></td></tr>)}/></section>
}

export function ColleagueListPage(){
 const {ui}=useLanguage(),navigate=useNavigate(),client=useQueryClient(),location=useLocation()
 const [filters,setFilters]=useState({...blankFilters}),debounced=useDebounced(filters),[card,setCard]=useState(()=>localStorage.getItem('colleagues-view')==='card'),[deleting,setDeleting]=useState(null),[notice,setNotice]=useState(location.state?.notice||'')
 let params,filterError;try{params=colleagueDateParams(debounced)}catch(error){filterError=error}
 const query=useQuery({queryKey:['colleagues',params],queryFn:({signal})=>fetchColleagues(params,signal),enabled:!!params})
 const deletion=useMutation({mutationFn:deleteColleague,onSuccess:async()=>{setDeleting(null);setNotice('همکار با موفقیت حذف شد.');await invalidateColleagues(client)}})
 const actions=row=><Actions actions={[{label:'مشاهده',to:`/colleagues/${row.id}`,icon:FaEye},{label:'ویرایش',to:`/colleagues/${row.id}/edit`,icon:FaEdit},{label:'ثبت دریافت',to:`/colleagues/${row.id}/transactions/new?type=RECEIVED`,icon:FaArrowDown,color:'!text-emerald-600'},{label:'ثبت پرداخت',to:`/colleagues/${row.id}/transactions/new?type=PAID`,icon:FaArrowUp,color:'!text-blue-600'},{label:'حذف',action:()=>{deletion.reset();setDeleting(row)},icon:FaTrashAlt,color:'!text-red-600'}]}/>
 const rows=query.data?.results||[],period=!!(params?.dateFrom||params?.dateTo)
 const open=(event,row)=>{if(!event.target.closest('a,button'))navigate(`/colleagues/${row.id}`)}
 return <FinancePage title={colleagueTitle} icon={FaUsers} action={<Link className={primaryButton} to="/colleagues/new">{ui('ثبت همکار')}</Link>}>
  <LedgerBalance balance={query.data?.balance}/><ColleagueToolbar filters={filters} setFilters={setFilters} query={query} card={card} onView={()=>setCard(value=>{localStorage.setItem('colleagues-view',value?'table':'card');return !value})}/>
  <ErrorBanner error={filterError||query.error} onRetry={query.error?()=>query.refetch():undefined}/>{query.isFetching&&<p role="status">{ui('در حال بارگذاری…')}</p>}
  {card?<section className="grid gap-4 md:grid-cols-2">{rows.map(row=><article key={row.id} tabIndex={0} role="link" onClick={event=>open(event,row)} onKeyDown={event=>{if(event.target===event.currentTarget&&['Enter',' '].includes(event.key)){event.preventDefault();navigate(`/colleagues/${row.id}`)}}} className={`${surface} cursor-pointer space-y-4 p-5 transition hover:border-blue-400 hover:shadow-md`}><div><Link to={`/colleagues/${row.id}`} className="font-bold">{row.colleagueName}</Link><p className="text-xs text-gray-500" dir="ltr">{row.colleagueNumber}</p><p className="mt-2 text-sm text-gray-500">{row.fatherName||'—'}</p></div><dl className="space-y-2">{[['totalReceivedAfn','مجموع گرفت'],['totalPaidAfn','مجموع پرداخت'],['remainingAfn','باقی‌مانده']].map(([key,label])=><div key={key} className="flex justify-between gap-3"><dt>{ui(label)}</dt><dd dir="ltr">{formatAmount(row[key])} AFN</dd></div>)}</dl><NegativeBadge value={row.remainingAfn} period={period}/>{actions(row)}</article>)}{!query.isPending&&!rows.length&&<p className={`${surface} p-8 text-center text-gray-500`}>{ui('همکاری یافت نشد.')}</p>}</section>:<section className={surface}><TableShell loading={query.isPending} headers={['شماره همکار','اسم','ولد','مجموع گرفت','مجموع پرداخت','باقی‌مانده','عملیات']} rows={rows.map(row=><tr key={row.id} role="link" tabIndex={0} onClick={event=>open(event,row)} onKeyDown={event=>{if(event.target===event.currentTarget&&['Enter',' '].includes(event.key)){event.preventDefault();navigate(`/colleagues/${row.id}`)}}} className="cursor-pointer hover:bg-blue-50/70 dark:hover:bg-gray-800"><td className="whitespace-nowrap p-4" dir="ltr"><Link to={`/colleagues/${row.id}`}>{row.colleagueNumber}</Link></td><td className="p-4 font-semibold"><Link to={`/colleagues/${row.id}`}>{row.colleagueName}</Link></td><td className="p-4">{row.fatherName||'—'}</td><td className="p-4" dir="ltr">{formatAmount(row.totalReceivedAfn)}</td><td className="p-4" dir="ltr">{formatAmount(row.totalPaidAfn)}</td><td className="p-4"><b dir="ltr">{formatAmount(row.remainingAfn)}</b><NegativeBadge value={row.remainingAfn} period={period}/></td><td className="p-3">{actions(row)}</td></tr>)}/></section>}
  <Pagination data={query.data} page={filters.page} onPage={page=>setFilters(value=>({...value,page}))}/>
  {deleting&&<ConfirmDelete title="حذف همکار و بستن پرونده" number={deleting.colleagueNumber} pending={deletion.isPending} error={deletion.error} onClose={()=>setDeleting(null)} onConfirm={()=>deletion.mutate(deleting.id)}/>}
  <SuccessNotice message={notice} onClose={()=>setNotice('')}/>
 </FinancePage>
}

export function ColleagueProfileFormPage(){
 const {ui}=useLanguage(),{colleagueId}=useParams(),navigate=useNavigate(),client=useQueryClient()
 const query=useQuery({queryKey:['colleague',colleagueId],queryFn:({signal})=>fetchColleague(colleagueId,signal),enabled:!!colleagueId})
 const save=useMutation({mutationFn:values=>saveColleague(values,colleagueId),onSuccess:async row=>{await invalidateColleagues(client);navigate(`/colleagues/${row.id}`,{state:{notice:'معلومات همکار با موفقیت ذخیره شد.'}})}})
 return <FinancePage title={colleagueId?'ویرایش همکار':'ثبت همکار جدید'} action={<Link className={secondaryButton} to={colleagueId?`/colleagues/${colleagueId}`:'/colleagues'}>{ui('بازگشت به لیست گرفت و پرداخت')}</Link>}><ErrorBanner error={query.error} onRetry={()=>query.refetch()}/>{colleagueId&&query.isPending?<p role="status">{ui('در حال بارگذاری…')}</p>:!query.error&&<section className={`${surface} p-5 sm:p-6`}><ColleagueForm key={colleagueId||'new'} mode={colleagueId?'edit':'create'} initial={query.data} onSave={save.mutate} pending={save.isPending} error={save.error}/></section>}</FinancePage>
}

export function ColleagueLedgerPage({historyOnly=false}){
 const {ui}=useLanguage(),{colleagueId}=useParams(),client=useQueryClient(),location=useLocation()
 const [filters,setFilters]=useState({...blankFilters}),debounced=useDebounced(filters),[deleting,setDeleting]=useState(null),[notice,setNotice]=useState(location.state?.notice||'')
 let params,filterError;try{params=colleagueDateParams(debounced)}catch(error){filterError=error}
 const person=useQuery({queryKey:['colleague',colleagueId],queryFn:({signal})=>fetchColleague(colleagueId,signal)})
 const history=useQuery({queryKey:['colleague-transactions-history',colleagueId,params],queryFn:({signal})=>fetchHistory(colleagueId,params,signal),enabled:!!params})
 const deletion=useMutation({mutationFn:tx=>deleteTransaction(colleagueId,tx.id),onSuccess:async()=>{setDeleting(null);setNotice('معامله با موفقیت حذف شد.');await invalidateColleagues(client)}})
 const row=person.data,period=!!(params?.dateFrom||params?.dateTo)
 return <FinancePage title={historyOnly?'تاریخچه معاملات همکار':'پرونده همکار'} subtitle={row?`${row.colleagueName} — ${row.colleagueNumber}`:''} icon={FaUsers} action={row&&<div className="flex flex-wrap gap-2"><Link className={primaryButton+' !bg-emerald-600'} to={`/colleagues/${row.id}/transactions/new?type=RECEIVED`}>{ui('ثبت دریافت')}</Link><Link className={primaryButton} to={`/colleagues/${row.id}/transactions/new?type=PAID`}>{ui('ثبت پرداخت')}</Link><Link className={secondaryButton} to={`/colleagues/${row.id}/edit`}>{ui('ویرایش مشخصات')}</Link></div>}>
  <ErrorBanner error={person.error||history.error||filterError} onRetry={()=>{person.refetch();history.refetch()}}/>
  {person.isPending&&<p role="status">{ui('در حال بارگذاری…')}</p>}
  {row&&<><div className="flex flex-wrap gap-3"><Link className={secondaryButton} to="/colleagues">{ui('بازگشت به لیست گرفت و پرداخت')}</Link><Link className={secondaryButton} to={historyOnly?`/colleagues/${row.id}`:`/colleagues/${row.id}/transactions`}>{ui(historyOnly?'مشاهده مشخصات همکار':'تمام معاملات این همکار')}</Link><NegativeBadge value={row.remainingAfn}/></div>
   {!historyOnly&&<section className={`${surface} p-5 sm:p-6`}><ColleagueForm key={`${row.id}-${row.updatedAt}`} mode="view" initial={row}/></section>}
   <LedgerBalance balance={history.data?.balance||row}/>
   <ColleagueToolbar filters={filters} setFilters={setFilters} query={history}><FormField label="نوع معامله" id="history-type"><select id="history-type" className={fieldClass} value={filters.transactionType} onChange={event=>setFilters(value=>({...value,transactionType:event.target.value,page:1}))}><option value="">{ui('همه')}</option><option value="RECEIVED">{ui('گرفت')}</option><option value="PAID">{ui('پرداخت')}</option></select></FormField></ColleagueToolbar>
   {period&&<p className="text-sm text-gray-500">{ui('موجودی واقعی حساب')}: <b dir="ltr">{formatAmount(row.remainingAfn)} AFN</b></p>}
   {history.isFetching&&<p role="status">{ui('در حال بارگذاری…')}</p>}
   <TransactionBoard personId={row.id} rows={history.data?.results||[]} loading={history.isPending} onDelete={tx=>{deletion.reset();setDeleting(tx)}}/>
   <Pagination data={history.data} page={filters.page} onPage={page=>setFilters(value=>({...value,page}))}/>
  </>}
  {deleting&&<ConfirmDelete title="حذف معامله همکار" number={deleting.transactionNumber} pending={deletion.isPending} error={deletion.error} onClose={()=>setDeleting(null)} onConfirm={()=>deletion.mutate(deleting)}/>}
  <SuccessNotice message={notice} onClose={()=>setNotice('')}/>
 </FinancePage>
}

export function ColleagueTransactionPage({mode='view'}){
 const {ui}=useLanguage(),{colleagueId,txId}=useParams(),[params]=useSearchParams(),navigate=useNavigate(),client=useQueryClient()
 const requested=params.get('type'),invalidType=mode==='create'&&requested&&!['PAID','RECEIVED'].includes(requested)
 const person=useQuery({queryKey:['colleague',colleagueId],queryFn:({signal})=>fetchColleague(colleagueId,signal)})
 const tx=useQuery({queryKey:['colleague-transaction',colleagueId,txId],queryFn:({signal})=>fetchTransaction(colleagueId,txId,signal),enabled:!!txId})
 const save=useMutation({mutationFn:values=>saveTransaction(colleagueId,values,mode==='edit'?txId:undefined),onSuccess:async()=>{await invalidateColleagues(client);navigate(`/colleagues/${colleagueId}/transactions`,{state:{notice:'معامله با موفقیت ذخیره شد.'}})}})
 const deletion=useMutation({mutationFn:()=>deleteTransaction(colleagueId,txId),onSuccess:async()=>{await invalidateColleagues(client);navigate(`/colleagues/${colleagueId}/transactions`,{state:{notice:'معامله با موفقیت حذف شد.'}})}})
 const [confirm,setConfirm]=useState(false),kind=tx.data?.transactionType||requested
 const title=mode==='view'?'مشاهده معامله همکار':mode==='edit'?'ویرایش معامله همکار':kind==='PAID'?'ثبت پرداخت':'ثبت دریافت'
 return <FinancePage title={title} action={<div className="flex flex-wrap gap-2"><Link className={secondaryButton} to={`/colleagues/${colleagueId}/transactions`}>{ui('بازگشت به تاریخچه معاملات')}</Link>{mode==='view'&&tx.data&&<><Link className={primaryButton} to={`/colleagues/${colleagueId}/transactions/${txId}/edit`}>{ui('ویرایش')}</Link><button className={secondaryButton+' !text-red-600'} onClick={()=>{deletion.reset();setConfirm(true)}}>{ui('حذف')}</button></>}</div>}>
  <ErrorBanner error={invalidType?'نوع معامله معتبر نیست.':person.error||tx.error}/>
  {person.isPending||txId&&tx.isPending?<p role="status">{ui('در حال بارگذاری…')}</p>:!person.error&&!tx.error&&!invalidType&&<section className={`${surface} p-5 sm:p-6`}><ColleagueTransactionForm key={`${mode}-${txId||'new'}`} mode={mode} person={person.data} initial={tx.data} lockedType={mode==='create'?requested:undefined} onSave={save.mutate} pending={save.isPending} error={save.error}/></section>}
  {confirm&&<ConfirmDelete title="حذف معامله همکار" number={tx.data?.transactionNumber} pending={deletion.isPending} error={deletion.error} onClose={()=>setConfirm(false)} onConfirm={()=>deletion.mutate()}/>}
 </FinancePage>
}
export default ColleagueListPage
