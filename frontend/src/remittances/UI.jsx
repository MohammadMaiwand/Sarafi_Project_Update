import { remittanceValue } from './display'
import { useId, useState } from 'react'
import { FiFilter, FiRefreshCw, FiSearch } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import useLanguage from '../hooks/useLanguage'
import { FormField, Modal, TableShell, EmptyState, fieldClass, surface, primaryButton, secondaryButton } from '../components/FinanceUI'
import { formatAmount, groupExact, parseAmount } from '../utils/remittance'
import { remittanceLabels as labels, remittanceColumns as columns } from './config'

export function ErrorBanner({error,onRetry}){
 const {ui}=useLanguage()
 if(!error)return null
 const message=typeof error==='string'?error:error.message
 return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"><p>{ui(message)}</p>{error.fields&&<ul className="mt-2 list-inside list-disc">{Object.entries(error.fields).filter(([key])=>!['message','detail'].includes(key)).map(([key,value])=><li key={key}>{ui(labels[key]||key)}: {ui(Array.isArray(value)?value.join('، '):String(value))}</li>)}</ul>}{onRetry&&<button className={secondaryButton+' mt-3'} onClick={onRetry}>{ui('تلاش دوباره')}</button>}</div>
}
export function NumericInput({value,onChange,onBlur,id,name,ref,required=false,disabled=false,precision=3,allowNegative=false}){
 return <input ref={ref} name={name} id={id} className={fieldClass} inputMode="decimal" autoComplete="off" dir="ltr" required={required} disabled={disabled} value={value?groupExact(value):''} onBlur={onBlur} onChange={event=>{
  const input=event.currentTarget,raw=parseAmount(input.value)
  if(new RegExp(`^${allowNegative?'-?':''}\\d{0,21}(\\.\\d{0,${precision}})?$`).test(raw)){
   const digitsAfter=parseAmount(input.value.slice(input.selectionStart)).length
   onChange(raw)
   requestAnimationFrame(()=>{if(document.activeElement===input){let caret=input.value.length,remaining=digitsAfter;while(caret>0&&remaining>0){caret--;if(input.value[caret]!==',')remaining--}input.setSelectionRange(caret,caret)}})
  }
 }}/>
}
export function Pagination({data,page,onPage}){
 const {ui}=useLanguage();const pages=data?.totalPages||1
 return <nav aria-label={ui('صفحه‌بندی')} className="flex flex-wrap items-center gap-3"><button type="button" disabled={page<=1} className={secondaryButton} onClick={()=>onPage(page-1)}>{ui('قبلی')}</button><span className="text-sm">{ui('صفحه {page} از {pages}',{page,pages})}</span><button type="button" disabled={page>=pages} className={secondaryButton} onClick={()=>onPage(page+1)}>{ui('بعدی')}</button></nav>
}
export function TableToolbar({filters,onChange,onReset,onRefresh,isFetching,kind,options,card,onView,children}){
 const {ui}=useLanguage(),[expanded,setExpanded]=useState(false),panelId=useId()
 const compact=kind==='incoming'
 const activeCount=['dateFrom','dateTo','year'].filter(key=>filters[key]).length+(filters.pageSize!==20?1:0)+(filters.sortDir!=='desc'?1:0)
 return <section className={compact?'space-y-3':`${surface} grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4`}>
  {compact&&<div className="flex flex-wrap items-center gap-2">
   <div className="relative w-full sm:w-72"><label className="sr-only" htmlFor="incoming-search">{ui('جستجو')}</label><FiSearch aria-hidden="true" className="pointer-events-none absolute end-3 top-3 text-gray-400"/><input id="incoming-search" className={`${fieldClass} !rounded-lg !py-2.5 pe-10`} placeholder={ui('نام، شماره حواله یا شماره تماس')} value={filters.search} onChange={e=>onChange('search',e.target.value)}/></div>
   <button type="button" className={secondaryButton+' !rounded-lg'} aria-expanded={expanded} aria-controls={panelId} onClick={()=>setExpanded(value=>!value)}><FiFilter aria-hidden="true"/>{ui('فیلترها')}{activeCount>0&&<span className="rounded-full bg-blue-100 px-2 text-blue-700">{activeCount}</span>}</button>
   <button type="button" title={ui('تازه‌سازی')} aria-label={ui('تازه‌سازی')} disabled={isFetching} className={secondaryButton+' !rounded-lg !px-3 disabled:opacity-50'} onClick={onRefresh}><FiRefreshCw aria-hidden="true" className={isFetching?'animate-spin':''}/></button>
   {onView&&<div role="group" aria-label={ui('ترتیب نمایش')} className="flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">{[false,true].map(value=><button key={String(value)} type="button" aria-pressed={card===value} onClick={()=>{if(card!==value)onView()}} className={`px-4 py-2.5 text-sm font-semibold ${card===value?'bg-blue-600 text-white':'bg-white text-gray-700 dark:bg-gray-900 dark:text-gray-200'}`}>{ui(value?'کارت':'جدول')}</button>)}</div>}
  </div>}
  <div id={panelId} hidden={compact&&!expanded} className={compact?`${!expanded?'!hidden':''} ${surface} grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4`:'contents'}>
  {!compact&&<FormField label="جستجو" id="filter-search"><input id="filter-search" className={fieldClass} placeholder={ui('نام، شماره حواله یا شماره تماس')} value={filters.search} onChange={e=>onChange('search',e.target.value)}/></FormField>}
  {['dateFrom','dateTo','year'].map(key=><FormField key={key} label={{dateFrom:'از تاریخ شمسی',dateTo:'تا تاریخ شمسی',year:'سال شمسی'}[key]} id={`filter-${key}`}><input id={`filter-${key}`} dir="ltr" className={fieldClass} placeholder={key==='year'?'1405':'1405/01/01'} value={filters[key]} onChange={e=>onChange(key,e.target.value)}/></FormField>)}
  <FormField label="تعداد در صفحه" id="filter-size"><select id="filter-size" className={fieldClass} value={filters.pageSize} onChange={e=>onChange('pageSize',Number(e.target.value))}>{[10,20,50,100].map(n=><option key={n}>{n}</option>)}</select></FormField>
  {kind==='outgoing'&&<FormField label="واحد پول" id="filter-currency"><select id="filter-currency" className={fieldClass} value={filters.currencyType} onChange={e=>onChange('currencyType',e.target.value)}><option value="">{ui('همه')}</option>{options.currencies.map(c=><option key={c}>{c}</option>)}</select></FormField>}
  {kind==='provincial-received'&&<FormField label="نوع معامله" id="filter-money"><select id="filter-money" className={fieldClass} value={filters.moneyTransaction} onChange={e=>onChange('moneyTransaction',e.target.value)}><option value="">{ui('همه')}</option>{options.moneyTransactions.map(v=><option key={v} value={v}>{ui(v)}</option>)}</select></FormField>}
  <FormField label="ترتیب نمایش" id="filter-sort"><select id="filter-sort" className={fieldClass} value={filters.sortDir} onChange={e=>onChange('sortDir',e.target.value)}><option value="desc">{ui('جدیدترین اول')}</option><option value="asc">{ui('قدیمی‌ترین اول')}</option></select></FormField>
  <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4"><button type="button" className={secondaryButton} onClick={onReset}>{ui('پاک کردن فیلترها')}</button>{!compact&&<button type="button" disabled={isFetching} className={secondaryButton} onClick={onRefresh}>{ui('تازه‌سازی')}</button>}{!compact&&onView&&<button type="button" className={secondaryButton} aria-pressed={card} onClick={onView}>{ui(card?'نمای جدول':'نمای کارت')}</button>}{children}</div>
 </div>
 </section>
}
export function RecordBoard({kind,rows,loading,card,actions}){
 const {ui}=useLanguage()
 const display=(row,key)=>remittanceValue(row,key,ui)
 const attachment=kind!=='provincial-received'
 if(card)return <section className={`${surface} p-4`}>{!loading&&!rows.length?<EmptyState title="رکوردی یافت نشد"/>:<div className="grid gap-4 md:grid-cols-2">{rows.map(row=><article className="min-w-0 rounded-xl border border-gray-200 p-4 dark:border-gray-700" key={row.id}><dl className="space-y-2">{columns[kind].map(key=><div className="flex flex-wrap justify-between gap-2" key={key}><dt className="text-sm text-gray-500">{ui(labels[key])}</dt><dd className="max-w-full break-words text-sm">{display(row,key)}</dd></div>)}</dl>{attachment&&<p className="my-3 text-xs">{ui('تصویر تذکره')}: {ui(row.hasIdCardImage?'دارد':'ندارد')} · {ui('اثر انگشت')}: {ui(row.hasFingerprint?'ثبت شده':'در انتظار تکمیل')}</p>}<div className="mt-4 border-t pt-3 dark:border-gray-700">{actions(row)}</div></article>)}</div>}</section>
 return <section className={surface}><TableShell loading={loading} headers={[...columns[kind].map(key=>labels[key]),...(attachment?['تصویر تذکره','اثر انگشت']:[]),'عملیات']} rows={rows.map(row=><tr key={row.id}>{columns[kind].map(key=><td className="max-w-xs whitespace-nowrap px-4 py-3" key={key}>{display(row,key)}</td>)}{attachment&&<><td className="px-4">{ui(row.hasIdCardImage?'دارد':'ندارد')}</td><td className="whitespace-nowrap px-4">{ui(row.hasFingerprint?'ثبت شده':'در انتظار تکمیل')}</td></>}<td className="p-3">{actions(row)}</td></tr>)}/></section>
}
export function ConfirmDelete({title='حذف حواله',number,onClose,onConfirm,pending,error}){
 const {ui}=useLanguage()
 return <Modal title={title} onClose={()=>!pending&&onClose()}><p className="mb-5">{ui('آیا این رکورد حذف شود؟')} <b dir="ltr">{number}</b></p><ErrorBanner error={error}/><div className="mt-4 flex gap-3"><button type="button" disabled={pending} className={primaryButton+' !bg-red-600 hover:!bg-red-700'} onClick={onConfirm}>{ui(pending?'در حال حذف…':'حذف')}</button><button type="button" disabled={pending} className={secondaryButton} onClick={onClose}>{ui('انصراف')}</button></div></Modal>
}
export function BalanceCards({balance}){
 const {ui}=useLanguage()
 return <section className="grid gap-3 sm:grid-cols-3">{[['received','مجموع دریافتی'],['paid','مجموع توزیع‌شده'],['remaining','باقی‌مانده حساب']].map(([key,label])=><div key={key} className={`${surface} min-w-0 p-4`}><p className="text-sm text-gray-500">{ui(label)}</p><p className="mt-3 break-words text-xl font-bold" dir="ltr">{formatAmount(balance?.[key]||0)} <small>AFN</small></p></div>)}</section>
}
export function RemittanceActions({kind,row,onDelete,onRemaining,pending}){
 const {ui}=useLanguage();const base=`/${kind}`
 return <div className="flex flex-wrap gap-2"><Link className={secondaryButton} to={`${base}/${row.id}`}>{ui('مشاهده')}</Link><Link className={secondaryButton} to={`${base}/${row.id}/edit`}>{ui('ویرایش')}</Link><button type="button" className={secondaryButton+' !text-red-600'} onClick={()=>onDelete(row)}>{ui('حذف')}</button>{kind==='provincial-received'&&<><Link className={secondaryButton} to={row.recipientName?`${base}/customer/${encodeURIComponent(row.recipientName)}`:`${base}/customer-by-id/${row.id}`}>{ui('تاریخچه مشتری')}</Link><button type="button" className={secondaryButton} disabled={pending} onClick={()=>onRemaining(row)}>{ui('پول باقی‌مانده')}</button></>}</div>
}
