import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import useLanguage from '../hooks/useLanguage'
import { FinancePage, FormField, TableShell, fieldClass, surface, primaryButton, secondaryButton } from '../components/FinanceUI'
import { BalanceCards, ConfirmDelete, ErrorBanner, NumericInput, Pagination } from '../remittances/UI'
import { fetchDistributionPeople, fetchDistributionPerson, fetchDistributionEntries, remittanceRequest as api } from '../remittanceApi'
import { invalidateRemittances } from '../remittances/query'
import { useDebounced } from '../remittances/hooks'
import { today } from '../remittances/config'
import { formatAmount, isoDate, shamsi } from '../utils/remittance'
const root='/provincial-received/distributions'

export default function ProvincialDistributionsPage(){
 const {ui}=useLanguage(),[search,setSearch]=useState(''),debounced=useDebounced(search),[page,setPage]=useState(1)
 const query=useQuery({queryKey:['provincial-people',debounced,page],queryFn:({signal})=>fetchDistributionPeople({search:debounced,page,pageSize:20},signal)})
 return <FinancePage title="توزیعات ولایتی" action={<Link className={primaryButton} to={`${root}/new`}>{ui('افزودن شخص توزیع')}</Link>}>
  <div className="flex flex-wrap gap-3"><Link className={secondaryButton} to="/provincial-received">{ui('بازگشت به فهرست')}</Link><Link className={secondaryButton} to="/provincial-received/customers">{ui('خلاصه مشتریان')}</Link></div>
  <section className={`${surface} p-4`}><FormField label="جستجوی مشتری" id="people-search"><input id="people-search" className={fieldClass} value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/></FormField></section>
  <ErrorBanner error={query.error} onRetry={()=>query.refetch()}/>
  {query.isFetching&&<p role="status">{ui('در حال بارگذاری…')}</p>}
  <section className={surface}><TableShell loading={query.isPending} headers={['نام دریافت‌کننده','نام پدر دریافت‌کننده','شماره تماس','مجموع دریافتی','مجموع توزیع‌شده','باقی‌مانده حساب','عملیات']} rows={(query.data?.results||[]).map(row=><tr key={row.id}><td className="p-4">{row.recipientName}</td><td className="p-4">{row.recipientFatherName||'—'}</td><td className="p-4">{row.phoneNumber||'—'}</td>{['received','paid','remaining'].map(key=><td key={key} className="p-4" dir="ltr">{formatAmount(row[key])}</td>)}<td className="p-3"><div className="flex flex-wrap gap-2"><Link className={secondaryButton} to={`${root}/${row.id}`}>{ui('مشاهده حساب')}</Link><Link className={primaryButton} to={`${root}/${row.id}/entries/new`}>{ui('ثبت توزیع')}</Link><Link className={secondaryButton} to={`${root}/${row.id}/edit`}>{ui('ویرایش مشخصات')}</Link></div></td></tr>)}/></section><Pagination data={query.data} page={page} onPage={setPage}/>
 </FinancePage>
}

export function ProvincialPersonFormPage(){
 const {ui}=useLanguage(),{personId}=useParams(),[params]=useSearchParams()
 const query=useQuery({queryKey:['provincial-person',personId],queryFn:({signal})=>fetchDistributionPerson(personId,signal),enabled:!!personId})
 return <FinancePage title={personId?'ویرایش مشخصات شخص توزیع':'افزودن شخص توزیع'} action={<Link className={secondaryButton} to={root}>{ui('بازگشت')}</Link>}><ErrorBanner error={query.error}/>{personId&&query.isPending?<p role="status">{ui('در حال بارگذاری…')}</p>:!query.error&&<PersonForm key={personId||'new'} initial={query.data||{recipientName:params.get('customer')||'',recipientFatherName:params.get('father')||''}}/>}</FinancePage>
}
function PersonForm({initial}){
 const {ui}=useLanguage(),client=useQueryClient(),navigate=useNavigate(),{register,handleSubmit,formState:{errors}}=useForm({defaultValues:initial})
 const save=useMutation({mutationFn:async values=>{if(initial.id)return api(`${root}/${initial.id}/`,values,'PATCH');const existing=await fetchDistributionPeople({name:values.recipientName.trim()});return existing.results[0]||api(`${root}/`,values)},onSuccess:async person=>{await invalidateRemittances(client);navigate(`${root}/${person.id}${initial.id?'':'/entries/new'}`)}})
 return <form className={`${surface} space-y-5 p-5`} onSubmit={handleSubmit(values=>save.mutate(values))}><ErrorBanner error={save.error}/><div className="grid gap-4 sm:grid-cols-3">{['recipientName','recipientFatherName','phoneNumber'].map((key,index)=><FormField key={key} label={['نام دریافت‌کننده','نام پدر دریافت‌کننده','شماره تماس'][index]} id={key}><input id={key} className={fieldClass} readOnly={key==='recipientName'&&!!initial.id} maxLength={key==='phoneNumber'?40:200} {...register(key,{validate:value=>key!=='recipientName'||!!value?.trim()||'این خانه الزامی است.'})}/>{errors[key]&&<p className="text-red-600">{ui(errors[key].message)}</p>}</FormField>)}</div><button disabled={save.isPending} className={primaryButton}>{ui(save.isPending?'در حال ذخیره…':'ذخیره و ادامه')}</button></form>
}

export function ProvincialEntriesPage(){
 const {ui}=useLanguage(),{personId}=useParams(),client=useQueryClient(),[page,setPage]=useState(1),[deleting,setDeleting]=useState(null)
 const person=useQuery({queryKey:['provincial-person',personId],queryFn:({signal})=>fetchDistributionPerson(personId,signal)})
 const query=useQuery({queryKey:['provincial-entries',personId,page],queryFn:({signal})=>fetchDistributionEntries(personId,{page,pageSize:20},signal)})
 const deletion=useMutation({mutationFn:id=>api(`${root}/${personId}/entries/${id}/`,null,'DELETE'),onSuccess:async()=>{setDeleting(null);await invalidateRemittances(client)}})
 return <FinancePage title="حساب و توزیعات مشتری" subtitle={person.data?.recipientName||''} action={<Link className={primaryButton} to={`${root}/${personId}/entries/new`}>{ui('ثبت توزیع')}</Link>}>
  <ErrorBanner error={query.error||person.error} onRetry={()=>query.refetch()}/><BalanceCards balance={query.data}/>
  <div className="flex flex-wrap gap-3"><Link className={secondaryButton} to={root}>{ui('بازگشت')}</Link><Link className={secondaryButton} to={`${root}/${personId}/edit`}>{ui('ویرایش مشخصات')}</Link>{person.data&&<Link className={secondaryButton} to={`/provincial-received/customer/${encodeURIComponent(person.data.recipientName)}`}>{ui('تاریخچه مشتری')}</Link>}</div>
  <section className={surface}><TableShell loading={query.isPending} headers={['تاریخ شمسی','مبلغ افغانی','توضیحات','عملیات']} rows={(query.data?.results||[]).map(row=><tr key={row.id}><td className="p-4">{shamsi(row.transactionDate)}</td><td className="p-4" dir="ltr">{formatAmount(row.afnAmount)}</td><td className="p-4">{row.description||'—'}</td><td className="p-3"><div className="flex gap-2"><Link className={secondaryButton} to={`${root}/${personId}/entries/${row.id}/edit`}>{ui('ویرایش')}</Link><button className={secondaryButton+' !text-red-600'} onClick={()=>{deletion.reset();setDeleting(row)}}>{ui('حذف')}</button></div></td></tr>)}/></section><Pagination data={query.data} page={page} onPage={setPage}/>
  {deleting&&<ConfirmDelete title="حذف توزیع" number={formatAmount(deleting.afnAmount)} pending={deletion.isPending} error={deletion.error} onClose={()=>setDeleting(null)} onConfirm={()=>deletion.mutate(deleting.id)}/>}
 </FinancePage>
}
export function ProvincialEntryFormPage(){
 const {ui}=useLanguage(),{personId,entryId}=useParams()
 const person=useQuery({queryKey:['provincial-person',personId],queryFn:({signal})=>fetchDistributionPerson(personId,signal)})
 const entry=useQuery({queryKey:['provincial-entries','entry',personId,entryId],queryFn:({signal})=>api(`${root}/${personId}/entries/${entryId}/`,null,'GET',signal),enabled:!!entryId})
 return <FinancePage title={entryId?'ویرایش توزیع ولایتی':'ثبت توزیع ولایتی'} subtitle={person.data?.recipientName||''} action={<Link className={secondaryButton} to={`${root}/${personId}`}>{ui('بازگشت به حساب مشتری')}</Link>}>
  <ErrorBanner error={person.error||entry.error}/><BalanceCards balance={person.data}/>
  {person.isPending||entryId&&entry.isPending?<p role="status">{ui('در حال بارگذاری…')}</p>:!person.error&&!entry.error&&<EntryForm key={entryId||'new'} person={person.data} initial={entry.data}/>}
 </FinancePage>
}
function EntryForm({person,initial}){
 const {ui}=useLanguage(),client=useQueryClient(),navigate=useNavigate(),{register,control,handleSubmit,formState:{errors}}=useForm({defaultValues:initial?{...initial,transactionDate:shamsi(initial.transactionDate)}:{transactionDate:shamsi(today()),afnAmount:'',description:''}})
 const save=useMutation({mutationFn:values=>api(`${root}/${person.id}/entries/${initial?`${initial.id}/`:''}`,{...values,recipientName:person.recipientName,recipientFatherName:person.recipientFatherName,transactionDate:isoDate(values.transactionDate)},initial?'PATCH':'POST'),onSuccess:async()=>{await invalidateRemittances(client);navigate(`${root}/${person.id}`)}})
 return <form className={`${surface} space-y-5 p-5`} onSubmit={handleSubmit(values=>save.mutate(values))}><ErrorBanner error={save.error}/><div className="grid gap-4 sm:grid-cols-2"><FormField label="تاریخ شمسی" id="entry-date"><input id="entry-date" className={fieldClass} dir="ltr" {...register('transactionDate',{validate:value=>{try{isoDate(value);return true}catch(e){return e.message}}})}/>{errors.transactionDate&&<p className="text-red-600">{ui(errors.transactionDate.message)}</p>}</FormField><FormField label="مبلغ افغانی" id="entry-amount"><Controller control={control} name="afnAmount" rules={{validate:value=>Number(value)>0&&Number(value)<=Number(person.remaining)+Number(initial?.afnAmount||0)||'مبلغ باید مثبت و کمتر یا مساوی باقی‌مانده باشد.'}} render={({field})=><NumericInput {...field} id="entry-amount"/>}/>{errors.afnAmount&&<p className="text-red-600">{ui(errors.afnAmount.message)}</p>}</FormField><FormField label="توضیحات" id="entry-description" className="sm:col-span-2"><textarea id="entry-description" className={fieldClass} rows={3} {...register('description')}/></FormField></div><button disabled={save.isPending} className={primaryButton}>{ui(save.isPending?'در حال ذخیره…':'ذخیره توزیع')}</button></form>
}
