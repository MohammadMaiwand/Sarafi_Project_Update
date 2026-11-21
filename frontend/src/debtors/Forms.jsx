import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import useLanguage from '../hooks/useLanguage'
import { FormField, Modal, fieldClass, primaryButton, secondaryButton } from '../components/FinanceUI'
import { ErrorBanner, NumericInput } from '../remittances/UI'
import { nextNumber } from './api'
import { debtorAfn, fixedMoney, projectedDebt, fixedCents } from '../utils/debtorMoney'
import { formatAmount, shamsi } from '../utils/remittance'
import { today } from '../remittances/config'

const labels={customer_name:'نام مشتری',father_name:'ولد',national_id:'شماره تذکره',location:'مکان',phone_number:'شماره تماس',description:'توضیحات',usd_rate:'نرخ دالر',original_usd_amount:'دالر / اصل قرض'}
export function DebtBadge({paid}){const {ui}=useLanguage();return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${paid?'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300':'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'}`}>{ui(paid?'کاملاً پرداخت‌شده':'قرض باز')}</span>}

export function DebtorForm({initial={},type='SMALL',mode='create',onSave,pending,error}){
 const {ui}=useLanguage(),view=mode==='view',locked=mode!=='create',[fileError,setFileError]=useState(''),[fileBusy,setFileBusy]=useState(false)
 const {register,control,handleSubmit,setValue,formState:{errors}}=useForm({defaultValues:{customer_name:'',father_name:'',national_id:'',location:'',phone_number:'',description:'',original_usd_amount:'',usd_rate:'',id_card_image_ref:'',...initial,manual:false,manual_sequence:''}})
 const values=useWatch({control}),kind=initial.debtor_type||type
 const number=useQuery({queryKey:['debtor-next-number'],queryFn:({signal})=>nextNumber(signal),enabled:!locked})
 const originalAfn=locked?initial.original_afn_amount:debtorAfn(values.original_usd_amount,values.usd_rate)
 async function upload(event){setFileError('');const file=event.target.files[0];if(!file)return;if(file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){setFileError('تصویر باید JPG، PNG یا WEBP و حداکثر ۵ مگابایت باشد.');return}setFileBusy(true);try{await createImageBitmap(file).then(bitmap=>bitmap.close());const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});setValue('id_card_image_ref',data,{shouldDirty:true})}catch{setFileError('تصویر قابل خواندن نیست.')}finally{setFileBusy(false)}}
 async function submit(data){const payload={};for(const key of ['customer_name','father_name','national_id','location','phone_number','description'])payload[key]=String(data[key]||'').trim();payload.id_card_image_ref=data.id_card_image_ref||'';if(!locked){Object.assign(payload,{debtor_type:kind,original_usd_amount:fixedMoney(data.original_usd_amount),usd_rate:data.usd_rate});if(data.manual)payload.manual_sequence=Number(data.manual_sequence)}await onSave(payload)}
 const readonly=(id,value)=><input id={id} className={fieldClass+' !bg-blue-50 dark:!bg-blue-950/40'} readOnly dir="auto" value={value??''}/>
 return <form onSubmit={view?event=>event.preventDefault():handleSubmit(submit)} className="space-y-5">
  <ErrorBanner error={error||fileError||number.error}/>
  <div className="grid gap-5 sm:grid-cols-2">
   <FormField label="شماره" id="debtor-number">{readonly('debtor-number',initial.customer_number||number.data?.number||'')}{!locked&&<><label className="mt-2 flex gap-2 text-sm"><input type="checkbox" {...register('manual')}/>{ui('تعیین شماره دستی')}</label>{values.manual&&<input aria-label={ui('شماره دستی')} type="number" min="1" max="999999999" className={fieldClass+' mt-2'} {...register('manual_sequence',{validate:value=>!values.manual||Number.isInteger(Number(value))&&Number(value)>0&&Number(value)<=999999999||'شماره دستی باید عدد صحیح مثبت باشد.'})}/>}</>}{errors.manual_sequence&&<p className="text-sm text-red-600">{ui(errors.manual_sequence.message)}</p>}</FormField>
   <FormField label="نوع بدهکار" id="debtor-type">{readonly('debtor-type',ui(kind==='LARGE'?'معاملات بزرگ':'عادی'))}</FormField>
   {['customer_name',...(kind==='SMALL'?['father_name']:[]),'national_id','location','phone_number'].map(key=><FormField key={key} label={labels[key]} id={`debtor-${key}`}><input id={`debtor-${key}`} className={fieldClass} readOnly={view} maxLength={key==='phone_number'?50:key==='national_id'?100:200} {...register(key,{validate:value=>!['customer_name',...(kind==='LARGE'?['national_id']:[])].includes(key)||!!value?.trim()||'این خانه الزامی است.'})}/>{errors[key]&&<p className="text-sm text-red-600">{ui(errors[key].message)}</p>}</FormField>)}
   {['usd_rate','original_usd_amount'].map(key=><FormField key={key} label={labels[key]} id={`debtor-${key}`} hint={locked?'این مقدار تاریخی است و پس از ثبت قابل تغییر نیست.':undefined}>{locked?readonly(`debtor-${key}`,formatAmount(initial[key])):<Controller name={key} control={control} rules={{required:'این خانه الزامی است.',validate:value=>(key==='usd_rate'?Number(value)>0:Number(value)>=0)||'مبلغ یا نرخ معتبر نیست.'}} render={({field})=><NumericInput {...field} id={`debtor-${key}`} precision={key==='usd_rate'?6:2}/>}/>}{errors[key]&&<p className="text-sm text-red-600">{ui(errors[key].message)}</p>}</FormField>)}
   <FormField label="افغانی" id="debtor-afn">{readonly('debtor-afn',formatAmount(originalAfn))}</FormField>
   {[['total_loan_usd','مجموع گرفت پول'],['total_paid_usd','مجموع پرداخت شده'],['remaining_usd','باقی‌مانده']].map(([key,label])=><FormField key={key} label={label} id={key}>{readonly(key,formatAmount(locked?initial[key]||'0.00':key==='remaining_usd'?fixedMoney(values.original_usd_amount):'0.00'))}</FormField>)}
  </div>
  <FormField label="توضیحات" id="debtor-description"><textarea id="debtor-description" readOnly={view} rows={3} className={fieldClass} {...register('description')}/></FormField>
  <section className="grid gap-5 border-t pt-5 dark:border-gray-700 sm:grid-cols-2"><FormField label="تصویر تذکره" id="debtor-image">{!view&&<input id="debtor-image" type="file" accept="image/jpeg,image/png,image/webp" disabled={fileBusy} onChange={upload}/>}{values.id_card_image_ref?<div><img src={values.id_card_image_ref} alt={ui('تصویر تذکره')} className="mt-3 max-h-52 max-w-full rounded-xl"/>{!view&&<button type="button" className={secondaryButton+' mt-2'} onClick={()=>setValue('id_card_image_ref','')}>{ui('حذف تصویر')}</button>}</div>:view&&<p className="text-sm text-gray-500">{ui('ندارد')}</p>}</FormField><div data-feature="FINGERPRINT_DEVICE_INTEGRATION" className="rounded-xl border border-dashed border-amber-300 p-4 dark:border-amber-800"><b>{ui('اثر انگشت')}</b><p className="mt-2 text-sm text-gray-500">{ui('اتصال دستگاه اثر انگشت در انتظار تکمیل است.')}</p>{initial.has_fingerprint&&<p>{ui('قالب قبلی ثبت شده است.')}</p>}</div></section>
  {!view&&<footer className="flex flex-wrap gap-3 border-t pt-5 dark:border-gray-700"><button disabled={pending||fileBusy||!locked&&number.isPending} className={primaryButton}>{ui(pending?'در حال ذخیره…':'ذخیره')}</button><Link className={secondaryButton} to={locked?`/debtors/${initial.id}`:`/debtors${kind==='LARGE'?'?type=LARGE':''}`}>{ui('بازگشت به فهرست')}</Link></footer>}
 </form>
}

export function DebtorTransactionModal({customer,kind,initial,onClose,onSave,pending,error}){
 const {ui}=useLanguage(),{register,control,handleSubmit,formState:{errors}}=useForm({defaultValues:{payment_usd_amount:initial?.payment_usd_amount||'',note:initial?.note||''}})
 const amount=useWatch({control,name:'payment_usd_amount'}),rate=initial?.usd_rate||customer.usd_rate,remaining=projectedDebt(customer,kind,amount,initial)
 return <Modal title={initial?'ویرایش رویداد قرض':kind==='LOAN'?'ثبت گرفت پول':'ثبت رسید پول'} onClose={()=>!pending&&onClose()} width="max-w-2xl"><form className="space-y-5" onSubmit={handleSubmit(data=>onSave({payment_type:kind,payment_usd_amount:fixedMoney(data.payment_usd_amount),note:data.note.trim()}))}>
  <ErrorBanner error={error}/><div className="grid gap-4 sm:grid-cols-2"><FormField label="تاریخ شمسی" id="payment-date"><input id="payment-date" readOnly className={fieldClass+' !bg-gray-50 dark:!bg-gray-800'} value={shamsi(initial?.payment_date||today())}/></FormField><FormField label="نرخ دالر تاریخی" id="payment-rate"><input id="payment-rate" readOnly className={fieldClass+' !bg-gray-50 dark:!bg-gray-800'} dir="ltr" value={formatAmount(rate)}/></FormField><FormField label="مبلغ دالر" id="payment-usd"><Controller name="payment_usd_amount" control={control} rules={{validate:value=>Number(value)>0&&remaining>=0n||'مبلغ باید مثبت باشد و حساب را منفی نکند.'}} render={({field})=><NumericInput {...field} id="payment-usd" precision={2}/>}/>{errors.payment_usd_amount&&<p className="text-sm text-red-600">{ui(errors.payment_usd_amount.message)}</p>}</FormField><FormField label="معادل افغانی" id="payment-afn"><input id="payment-afn" readOnly className={fieldClass+' !bg-blue-50 dark:!bg-blue-950/40'} dir="ltr" value={formatAmount(debtorAfn(amount,rate))}/></FormField></div>
  <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800"><p>{ui('باقی‌مانده فعلی')}: <b dir="ltr">{formatAmount(customer.remaining_usd)} USD</b></p><p className="mt-2">{ui('باقی‌مانده پس از ثبت')}: <b dir="ltr" className={remaining<0n?'text-red-600':''}>{formatAmount(fixedCents(remaining))} USD</b></p></div>
  <FormField label="یادداشت" id="payment-note"><textarea id="payment-note" rows={3} className={fieldClass} {...register('note')}/></FormField>
  <footer className="flex gap-3"><button disabled={pending} className={`${primaryButton} ${kind==='LOAN'?'!bg-red-600':'!bg-emerald-600'}`}>{ui(pending?'در حال ذخیره…':'ذخیره')}</button><button type="button" disabled={pending} className={secondaryButton} onClick={onClose}>{ui('انصراف')}</button></footer>
 </form></Modal>
}

