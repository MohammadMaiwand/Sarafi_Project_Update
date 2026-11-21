import { transactionLabel } from './config'
import { Controller,useForm,useWatch } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import useLanguage from '../hooks/useLanguage'
import { FormField,fieldClass,primaryButton,secondaryButton } from '../components/FinanceUI'
import { ErrorBanner,NumericInput } from '../remittances/UI'
import { formatAmount,shamsi,isoDate,parseAmount } from '../utils/remittance'
import { today } from '../remittances/config'
import { colleagueAmounts,candidateBalance,allowedBalance,units,fixedUnits } from '../utils/colleagueMoney'
import { nextNumber } from './api'

export function NumberField({id,label,saved,next,register,manual,error,view}){
 const {ui}=useLanguage()
 return <FormField label={label} id={id} hint={!saved?'شماره نهایی هنگام ذخیره تخصیص می‌یابد.':undefined}><input id={id} className={fieldClass+' !bg-blue-50 dark:!bg-blue-950/30'} dir="ltr" readOnly value={saved||next||''}/>{!view&&<><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" {...register('manual')}/>{ui('ویرایش دستی شماره')}</label>{manual&&<input aria-label={ui('شماره دستی')} className={fieldClass+' mt-2'} inputMode="numeric" {...register('manualNumber',{setValueAs:parseAmount,validate:value=>!manual||/^\d+$/.test(value)&&Number(value)>0&&Number(value)<=999999999||'شماره دستی باید عدد صحیح مثبت باشد.'})}/>}</>}{error&&<p className="mt-1 text-sm text-red-600">{ui(error.message)}</p>}</FormField>
}
export function ColleagueForm({initial={},mode='create',onSave,pending,error}){
 const {ui}=useLanguage(),view=mode==='view'
 const {register,control,handleSubmit,formState:{errors}}=useForm({defaultValues:{colleagueName:'',fatherName:'',phoneNumber:'',location:'',description:'',...initial,manual:false,manualNumber:''}})
 const manual=useWatch({control,name:'manual'})
 const next=useQuery({queryKey:['colleague-next-person'],queryFn:({signal})=>nextNumber(null,null,signal),enabled:mode==='create'})
 function submit(values){const payload={};for(const key of ['colleagueName','fatherName','phoneNumber','location','description'])payload[key]=String(values[key]||'').trim();if(values.manual)payload.manualNumber=Number(values.manualNumber);onSave(payload)}
 return <form className="space-y-5" onSubmit={view?event=>event.preventDefault():handleSubmit(submit)}>
  <ErrorBanner error={error||next.error}/><div className="grid gap-5 sm:grid-cols-2"><NumberField id="colleague-number" label="شماره همکار" saved={initial.colleagueNumber} next={next.data?.number} register={register} manual={manual} error={errors.manualNumber} view={view}/>
   {[['colleagueName','اسم'],['fatherName','ولد'],['phoneNumber','شماره تماس'],['location','مکان']].map(([key,label])=><FormField key={key} label={label} id={key}><input id={key} className={fieldClass+(view?' !bg-blue-50 dark:!bg-blue-950/30':'')} dir={key==='phoneNumber'?'ltr':undefined} readOnly={view} maxLength={key==='phoneNumber'?50:200} {...register(key,{validate:value=>key!=='colleagueName'||!!value?.trim()||'این خانه الزامی است.'})}/>{errors[key]&&<p className="text-sm text-red-600">{ui(errors[key].message)}</p>}</FormField>)}
  </div><FormField label="شرح" id="person-description"><textarea id="person-description" className={fieldClass} readOnly={view} rows={4} {...register('description')}/></FormField>
  {!view&&<footer className="flex flex-wrap gap-3 border-t pt-5 dark:border-gray-700"><button className={primaryButton+' !bg-emerald-600'} disabled={pending||mode==='create'&&next.isPending}>{ui(pending?'در حال ذخیره…':'ذخیره')}</button><Link className={secondaryButton} to={initial.id?`/colleagues/${initial.id}`:'/colleagues'}>{ui('بازگشت به لیست گرفت و پرداخت')}</Link></footer>}
 </form>
}

export function ColleagueTransactionForm({person,initial={},mode='create',lockedType,onSave,pending,error}){
 const {ui}=useLanguage(),view=mode==='view',editing=mode==='edit'
 const {register,control,handleSubmit,formState:{errors}}=useForm({defaultValues:{transactionType:lockedType||'RECEIVED',currencyType:'USD',amount:'',usdRate:'',description:'',...initial,transactionDate:shamsi(initial.transactionDate||today()),manual:false,manualNumber:''}})
 const values=useWatch({control}),kind=initial.transactionType||lockedType||values.transactionType
 let date,dateError;try{date=isoDate(values.transactionDate||'')}catch(error){dateError=error.message}
 const next=useQuery({queryKey:['colleague-next-tx',person.id,date],queryFn:({signal})=>nextNumber(person.id,date,signal),enabled:mode==='create'&&!!date})
 const amounts=colleagueAmounts(values.currencyType,values.amount,values.usdRate)
 const candidate=candidateBalance(person,kind,amounts.afn,initial.id?initial:undefined)
 const validBalance=allowedBalance(units(person.remainingAfn),candidate)
 function submit(data){if(dateError)return;const payload={transactionType:kind,transactionDate:date,currencyType:data.currencyType,amount:parseAmount(data.amount),usdRate:parseAmount(data.usdRate),description:data.description.trim()};if(data.manual)payload.manualNumber=Number(data.manualNumber);onSave(payload)}
 const readonly=(id,value)=><input id={id} readOnly className={fieldClass+' !bg-blue-50 dark:!bg-blue-950/30'} dir="auto" value={value??''}/>
 return <form className="space-y-5" onSubmit={view?event=>event.preventDefault():handleSubmit(submit)}>
  <ErrorBanner error={error||next.error}/><div className="grid gap-5 sm:grid-cols-2">
   <NumberField id="transaction-number" label="شماره معامله" saved={initial.transactionNumber} next={next.data?.number} register={register} manual={values.manual} error={errors.manualNumber} view={view}/>
   <FormField label="اسم" id="transaction-person">{readonly('transaction-person',person.colleagueName)}</FormField>
   <FormField label="نوع معامله" id="transaction-type">{view||editing||lockedType?readonly('transaction-type',ui(transactionLabel(kind))):<select id="transaction-type" className={fieldClass} {...register('transactionType')}><option value="RECEIVED">{ui('گرفت')}</option><option value="PAID">{ui('پرداخت')}</option></select>}</FormField>
   <FormField label={kind==='PAID'?'تاریخ پرداخت':'تاریخ دریافت'} id="colleague-date"><input id="colleague-date" className={fieldClass} dir="ltr" readOnly={view} {...register('transactionDate',{validate:value=>{try{isoDate(value);return true}catch(error){return error.message}}})}/>{errors.transactionDate&&<p className="text-sm text-red-600">{ui(errors.transactionDate.message)}</p>}</FormField>
   <FormField label="نوع پول" id="currencyType"><select id="currencyType" disabled={view} className={fieldClass} {...register('currencyType')}>{['USD','TOMAN','AFN','EUR','PKR','TRY'].map(value=><option key={value}>{value}</option>)}</select></FormField>
   <FormField label={kind==='PAID'?'مقدار پرداخت':'مقدار دریافت'} id="amount">{view?readonly('amount',formatAmount(initial.amount)):<Controller name="amount" control={control} rules={{validate:value=>Number(value)>0&&validBalance||'مبلغ باید مثبت باشد و از موجودی قابل پرداخت بیشتر نشود.'}} render={({field})=><NumericInput {...field} id="amount" precision={3}/>}/>}{errors.amount&&<p className="text-sm text-red-600">{ui(errors.amount.message)}</p>}</FormField>
   <FormField label={!['USD','AFN'].includes(values.currencyType)?`AFN / ${values.currencyType}`:'نرخ افغانی برای یک دالر'} id="usdRate" hint={!['USD','AFN'].includes(values.currencyType)?`افغانی = مبلغ ${values.currencyType} × نرخ افغانی هر واحد`:'نرخ افغانی برای یک دالر'}>{view?readonly('usdRate',formatAmount(initial.usdRate)):<Controller name="usdRate" control={control} rules={{validate:value=>Number(value)>0||'نرخ باید بیشتر از صفر باشد.'}} render={({field})=><NumericInput {...field} id="usdRate" precision={8}/>}/>}{errors.usdRate&&<p className="text-sm text-red-600">{ui(errors.usdRate.message)}</p>}</FormField>
   <FormField label="افغانی" id="colleague-afn">{readonly('colleague-afn',formatAmount(view?initial.afnAmount:amounts.afn))}</FormField>
   {values.currencyType==='AFN'&&<FormField label="معادل دالر" id="colleague-usd">{readonly('colleague-usd',formatAmount(view?initial.usdAmount:amounts.usd))}</FormField>}
  </div>
  {!view&&<div className={`rounded-xl border p-4 text-sm ${validBalance?'border-blue-100 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30':'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30'}`}><p>{ui('موجودی واقعی حساب')}: <b dir="ltr">{formatAmount(person.remainingAfn)} AFN</b></p><p className="mt-2">{ui('مانده پس از ثبت معامله')}: <b dir="ltr">{formatAmount(fixedUnits(candidate))} AFN</b></p></div>}
  <FormField label="شرح" id="transaction-description"><textarea id="transaction-description" rows={4} readOnly={view} className={fieldClass} {...register('description')}/></FormField>
  {!view&&<footer className="flex flex-wrap gap-3 border-t pt-5 dark:border-gray-700"><button disabled={pending||mode==='create'&&!!date&&next.isPending} className={primaryButton+' !bg-emerald-600'}>{ui(pending?'در حال ذخیره…':'ذخیره')}</button><Link className={secondaryButton} to={`/colleagues/${person.id}/transactions`}>{ui('بازگشت به تاریخچه معاملات')}</Link></footer>}
 </form>
}

