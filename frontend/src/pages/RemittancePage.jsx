import { remittanceValue } from '../remittances/display'
import { AfghanMonthInput } from '../components/AfghanDate'
import { solarMonth } from '../utils/calendar'
import { useRemittanceActions } from '../remittances/useRemittanceActions'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import useLanguage from '../hooks/useLanguage'
import { FinancePage, primaryButton, secondaryButton, surface } from '../components/FinanceUI'
import RemittanceForm from '../components/RemittanceForm'
import { ErrorBanner, RecordBoard, TableToolbar, Pagination } from '../remittances/UI'
import { defaultOptions, emptyFilters, remittanceColumns, remittanceLabels, remittanceTitles } from '../remittances/config'
import { useDebounced, filterParams } from '../remittances/hooks'
import { invalidateRemittances } from '../remittances/query'
import { createRemittance, updateRemittance, fetchRemittances, fetchRemittance, fetchRemittanceOptions, } from '../remittanceApi'
import { formatAmount } from '../utils/remittance'


export function RemittanceListPage({kind}){
 const {ui}=useLanguage(),[filters,setFilters]=useState({...emptyFilters,month:'',customerKey:''}),[card,setCard]=useState(()=>localStorage.getItem(`remittance-view-${kind}`)==='card')
 const debounced=useDebounced(filters),options=useQuery({queryKey:['remittance-options'],queryFn:({signal})=>fetchRemittanceOptions(signal),staleTime:Infinity})
 let params,filterError
 try{params=filterParams(debounced)}catch(error){filterError=error}
 const query=useQuery({queryKey:['remittances',kind,params],queryFn:({signal})=>fetchRemittances(kind,params,signal),enabled:!!params})
 const {actions,confirmation,actionError}=useRemittanceActions(kind)
 const change=(key,value)=>setFilters(current=>({...current,[key]:value,page:key==='page'?value:1}))
 return <FinancePage title={remittanceTitles[kind]} subtitle="ثبت و مدیریت حواله‌ها" action={<Link className={primaryButton} to={`/${kind}/new`}>{ui('حواله جدید')}</Link>}>
  <TableToolbar filters={filters} onChange={change} onReset={()=>setFilters({...emptyFilters,month:'',customerKey:''})} onRefresh={()=>query.refetch()} isFetching={query.isFetching} kind={kind} options={options.data||defaultOptions} card={card} onView={()=>setCard(value=>{localStorage.setItem(`remittance-view-${kind}`,value?'table':'card');return !value})}>
   {kind==='incoming'&&<div className="flex flex-wrap items-center gap-3"><label><input type="checkbox" checked={!!filters.month} onChange={e=>change('month',e.target.checked?solarMonth():'')}/> فیلتر ماه شمسی <AfghanMonthInput disabled={!filters.month} value={filters.month||solarMonth()} onChange={event=>change('month',event.target.value)} className={secondaryButton}/></label><button type="button" className={secondaryButton} onClick={()=>change('month','')}>همه ماه‌ها</button><select aria-label="واحد پول" className={secondaryButton} value={filters.currencyType} onChange={e=>change('currencyType',e.target.value)}><option value="">همه واحدها</option>{defaultOptions.currencies.map(unit=><option key={unit}>{unit}</option>)}</select></div>}
   {kind==='provincial-received'&&<><Link className={secondaryButton} to="/provincial-received/distributions">{ui('توزیعات ولایتی')}</Link><Link className={secondaryButton} to="/provincial-received/customers">{ui('خلاصه مشتریان')}</Link></>}
  </TableToolbar>
  <ErrorBanner error={filterError||query.error||actionError} onRetry={query.error?()=>query.refetch():undefined}/>
  {query.isFetching&&<p role="status" className="text-sm text-gray-500">{ui('در حال بارگذاری…')}</p>}
  <p className="text-sm text-gray-500">{ui('تعداد حواله‌ها')}: {query.data?.count||0} · {ui('مجموع افغانی')}: {formatAmount(kind==='incoming'?query.data?.knownTotalAfn:query.data?.totalAfn)}</p>
  {kind==='incoming'&&<><section className={`${surface} overflow-x-auto`}><div className="flex flex-wrap items-center justify-between gap-3 p-4"><h2 className="font-bold">فهرست مشتریان حواله تهران کابل</h2>{filters.customerKey&&<button type="button" className={secondaryButton} onClick={()=>change('customerKey','')}>نمایش همه مشتریان</button>}</div><table className="w-full min-w-[600px] text-sm"><thead><tr>{['مشتری','تعداد حواله','مقدار افغانی','مقدار تومان'].map(label=><th key={label} className="p-3 text-start">{label}</th>)}</tr></thead><tbody>{(query.data?.customerTotals||[]).map(row=><tr key={row.key} className="cursor-pointer border-t hover:bg-blue-50 dark:hover:bg-gray-800" onClick={()=>change('customerKey',row.key)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')change('customerKey',row.key)}}><td className="p-3 font-semibold">{row.name}</td><td>{formatAmount(row.count)}</td><td dir="ltr">{formatAmount(row.afn)} AFN {row.missingAfnCount>0&&<small className="block">{formatAmount(row.missingAfnCount)} حواله با مقدار افغانی نامشخص</small>}</td><td dir="ltr">{formatAmount(row.toman)} TOMAN {row.missingTomanCount>0&&<small className="block">{formatAmount(row.missingTomanCount)} حواله با مقدار تومان نامشخص</small>}</td></tr>)}{!query.isPending&&!query.data?.customerTotals?.length&&<tr><td colSpan={4} className="p-5 text-center text-gray-500">مشتری در این فیلتر یافت نشد.</td></tr>}</tbody></table></section><p className="text-sm text-gray-500">مجموع تومان: {formatAmount(query.data?.totalToman)} TOMAN · جمع مفاد دستی: {(query.data?.manualProfitTotals||[]).map(row=>`${formatAmount(row.amount)} ${row.currency||'واحد نامشخص'}`).join(' · ')||'—'}</p></>}
  <RecordBoard kind={kind} rows={filterError?[]:query.data?.results||[]} loading={query.isPending} card={card} actions={actions}/>
  <Pagination data={query.data} page={filters.page} onPage={page=>change('page',page)}/>{confirmation}
 </FinancePage>
}

export function RemittanceCreatePage({kind}){
 const {ui}=useLanguage(),{id}=useParams(),location=useLocation(),navigate=useNavigate(),client=useQueryClient()
 const params=new URLSearchParams(location.search),source=params.get('sourceRemittance')
 const query=useQuery({queryKey:['remittance',kind,id||source],queryFn:({signal})=>fetchRemittance(kind,id||source,signal),enabled:!!(id||source)})
 const save=useMutation({mutationFn:values=>id?updateRemittance(kind,id,values):createRemittance(kind,values),onSuccess:async row=>{await invalidateRemittances(client);navigate(kind==='provincial-received'&&row.recipientName?`/provincial-received/customer/${encodeURIComponent(row.recipientName)}`:`/${kind}`)}})
 let initial=id?query.data||{}:Object.fromEntries(['recipientName','recipientFatherName','usdRate','moneyTransaction'].filter(key=>query.data?.[key]!=null).map(key=>[key,query.data[key]]))
 if(!id)initial={...initial,recipientName:params.get('customer')||initial.recipientName||'',recipientFatherName:params.get('father')||initial.recipientFatherName||''}
 return <FinancePage title={remittanceTitles[kind]} action={<Link className={secondaryButton} to={`/${kind}`}>{ui('بازگشت به فهرست')}</Link>}>
  <ErrorBanner error={query.error} onRetry={()=>query.refetch()}/>
  {(id||source)&&query.isPending?<p role="status">{ui('در حال بارگذاری…')}</p>:!query.error&&<section className={`${surface} p-5 sm:p-6`}><RemittanceForm key={`${kind}-${id||source||'new'}`} kind={kind} initial={initial} onSubmit={save.mutateAsync} pending={save.isPending} error={save.error}/></section>}
 </FinancePage>
}

export function RemittanceDetailPage({kind}){
 const {ui}=useLanguage(),{id}=useParams()
 const query=useQuery({queryKey:['remittance',kind,id],queryFn:({signal})=>fetchRemittance(kind,id,signal)})
 const {actions,confirmation,actionError}=useRemittanceActions(kind),row=query.data
 return <FinancePage title={remittanceTitles[kind]} action={<Link className={secondaryButton} to={`/${kind}`}>{ui('بازگشت به فهرست')}</Link>}>
  <ErrorBanner error={query.error||actionError} onRetry={()=>query.refetch()}/>
  {query.isPending&&<p role="status">{ui('در حال بارگذاری…')}</p>}
  {row&&<section className={`${surface} p-5`}><h2 className="mb-5 text-lg font-bold" dir="ltr">{row.hawalaNumber}</h2><dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[...new Set([...remittanceColumns[kind],...(kind==='outgoing'?['afnUsdRate','tomanInWords']:[])])].map(key=><div key={key} className="min-w-0"><dt className="text-sm text-gray-500">{ui(remittanceLabels[key])}</dt><dd className="mt-2 break-words font-medium">{remittanceValue(row,key,ui)}</dd></div>)}</dl>{row.idCardImageRef&&<figure className="my-5"><figcaption className="mb-2 text-sm">{ui('تصویر تذکره')}</figcaption><a href={row.idCardImageRef} download={`${row.hawalaNumber}-id-card`}><img src={row.idCardImageRef} alt={ui('تصویر تذکره')} className="max-h-80 max-w-full rounded-xl border"/></a></figure>}{kind!=='provincial-received'&&<p className="my-5 text-sm text-gray-500" data-feature="FINGERPRINT_DEVICE_INTEGRATION">{ui(row.hasFingerprint?'قالب قبلی ثبت شده است.':'اتصال دستگاه اثر انگشت در انتظار تکمیل است.')}</p>}<footer className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-700">{actions(row)}</footer></section>}{confirmation}
 </FinancePage>
}
export default function RemittancePage({kind}){
 const location=useLocation(),{id}=useParams()
 return location.pathname.endsWith('/new')||location.pathname.endsWith('/edit')?<RemittanceCreatePage kind={kind}/>:id?<RemittanceDetailPage kind={kind}/>:<RemittanceListPage kind={kind}/>
}
