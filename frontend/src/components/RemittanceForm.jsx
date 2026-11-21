import { Controller, useForm, useWatch } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import useLanguage from '../hooks/useLanguage'
import { FormField, fieldClass, primaryButton, secondaryButton } from './FinanceUI'
import { ErrorBanner, NumericInput } from '../remittances/UI'
import { remittanceFields, remittanceLabels as labels, numericFields, defaultOptions, today } from '../remittances/config'
import { fetchNextHawalaNumber, fetchRemittanceOptions } from '../remittanceApi'
import { shamsi, isoDate, calculateAfnWithBase, calculateAfn, amountWords, parseAmount, formatAmount } from '../utils/remittance'

export default function RemittanceForm({kind,initial={},onSubmit,pending,error}){
 const {ui}=useLanguage(); const [fileError,setFileError]=useState(''),[fileBusy,setFileBusy]=useState(false)
 const {register,control,handleSubmit,setValue,setError,formState:{errors}}=useForm({defaultValues:{currencyType:'TOMAN',manualProfit:null,manualProfitCurrency:'',conversionPath:'TOMAN_TO_AFN',rateBaseAmount:kind==='incoming'?1000:1,tomanProfit:'0',tomanAmount:kind==='provincial-received'?'0':'',...initial,transactionDate:shamsi(initial.transactionDate||today()),manual:false,manualNumber:''}})
 const values=useWatch({control}),editing=!!initial.id,direct=kind==='outgoing'&&values.currencyType!=='TOMAN'
 const options=useQuery({queryKey:['remittance-options'],queryFn:({signal})=>fetchRemittanceOptions(signal),staleTime:Infinity})
 let iso, dateError
 try{iso=isoDate(values.transactionDate||'')}catch(e){dateError=e.message}
 const next=useQuery({queryKey:['next-hawala',kind,iso],queryFn:({signal})=>fetchNextHawalaNumber(kind,iso,signal),enabled:!editing&&!!iso})
 const usdPath=kind==='incoming'&&values.conversionPath==='USD_TO_AFN'
 const amount=values[kind==='incoming'?(usdPath?'usdAmount':'tomanAmount'):kind==='outgoing'?'sourceAmount':'usdAmount']
 const afn=kind==='incoming'?calculateAfnWithBase(amount,values[usdPath?'usdRate':'afnUsdRate'],usdPath?1:values.rateBaseAmount):direct?values.afnAmount||'0':calculateAfn(amount,values[kind==='provincial-received'?'usdRate':'afnUsdRate'])
 const available=options.data||defaultOptions
 async function submit(data){
  if(dateError){setError('transactionDate',{message:dateError});return}
  const payload={...data,transactionDate:iso,afnAmount:afn,manualProfit:data.manualProfit===''||data.manualProfit==null?null:parseAmount(data.manualProfit),manualProfitCurrency:data.manualProfit===''||data.manualProfit==null?'':data.manualProfitCurrency}
  if(usdPath&& !data.tomanAmount)payload.tomanAmount='0'
  if(!editing){if(data.manual){payload.manualNumber=Number(data.manualNumber)}else if(kind==='provincial-received'){payload.hawalaNumber=data.hawalaNumber||''}else delete payload.hawalaNumber}
  else delete payload.hawalaNumber
  delete payload.manual
  if(!data.manual)delete payload.manualNumber
  for(const key of numericFields)if(key!=='manualProfit'&&(payload[key]===''||payload[key]==null))delete payload[key]
  if(direct){payload.operationType='AFN_DIRECT';payload.currencyRate='';payload.afnUsdRate='0';payload.tomanInWords=''}
  else if(kind==='outgoing')payload.operationType='TOMAN_FORMULA'
  for(const key of ['id','kind','created_at','updated_at','hasFingerprint','hasIdCardImage'])delete payload[key]
  try{await onSubmit(payload)}catch(e){for(const [key,message]of Object.entries(e.fields||{})){if(labels[key]||key==='manualNumber')setError(key,{message:Array.isArray(message)?message.join('، '):String(message)})}}
 }
 async function upload(event){
  setFileError('');const file=event.target.files[0];if(!file)return
  if(file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){setFileError('تصویر باید JPG، PNG یا WEBP و حداکثر ۵ مگابایت باشد.');event.target.value='';return}
  setFileBusy(true)
  try{
   await createImageBitmap(file).then(bitmap=>bitmap.close())
   const result=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)})
   setValue('idCardImageRef',result,{shouldDirty:true})
  }catch{setFileError('تصویر قابل خواندن نیست.')}finally{setFileBusy(false)}
 }
 const required=key=>kind==='incoming'?['senderName','receiverName',...(usdPath?['usdAmount','usdRate']:['tomanAmount','afnUsdRate'])].includes(key):['senderName','receiverName','recipientName','usdRate','usdAmount','sourceAmount','profitAmount','moneyTransaction','currencyType','afnAmount'].includes(key)||key==='afnUsdRate'&&!direct
 const positive=key=>['tomanAmount','sourceAmount','usdRate','usdAmount','afnUsdRate','afnAmount'].includes(key)&&!(key==='tomanAmount'&&(kind==='provincial-received'||usdPath))
 const visible=remittanceFields[kind].filter(key=>!(kind==='incoming'&&(usdPath?['afnUsdRate','tomanInWords']:['usdAmount','usdRate']).includes(key))&&!(kind==='outgoing'&&((direct&&['tomanInWords','afnUsdRate'].includes(key))||(!direct&&key==='afnAmount'))))
 return <form onSubmit={handleSubmit(submit)} noValidate className="space-y-6">
  <ErrorBanner error={error}/><ErrorBanner error={fileError}/><ErrorBanner error={next.error}/>
  <section><h2 className="mb-4 text-lg font-bold">{ui(editing?'ویرایش حواله':'ثبت حواله جدید')}</h2><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
   <FormField label="شماره حواله" id="hawalaNumber" hint={editing?'شماره حواله پس از ثبت قابل تغییر نیست.':'شماره نهایی هنگام ذخیره تخصیص می‌یابد.'}>
    {kind==='provincial-received'&&!editing&&!values.manual?<input id="hawalaNumber" className={fieldClass} placeholder={next.data?.number||''} {...register('hawalaNumber')}/>:<input id="hawalaNumber" className={fieldClass} readOnly value={editing?initial.hawalaNumber:next.data?.number||''}/>}
    {errors.hawalaNumber&&<p className="mt-1 text-sm text-red-600">{ui(errors.hawalaNumber.message)}</p>}
   </FormField>
   {!editing&&<FormField label="شماره دستی" id="manual"><label className="flex items-center gap-2"><input id="manual" type="checkbox" {...register('manual')}/>{ui('تعیین شماره دستی')}</label>{values.manual&&<><input aria-label={ui('شماره دستی')} className={fieldClass+' mt-2'} inputMode="numeric" {...register('manualNumber',{setValueAs:parseAmount,validate:value=>!values.manual||/^\d+$/.test(value)&&Number(value)>0&&Number(value)<=999999999||'شماره دستی باید عدد صحیح مثبت باشد.'})}/>{errors.manualNumber&&<p className="text-sm text-red-600">{ui(errors.manualNumber.message)}</p>}</>}</FormField>}
   <FormField label="تاریخ شمسی" id="transactionDate" hint="مثال: ۱۴۰۵/۰۸/۱۴"><input id="transactionDate" className={fieldClass} dir="ltr" aria-invalid={!!errors.transactionDate} {...register('transactionDate',{validate:value=>{try{isoDate(value);return true}catch(e){return e.message}}})}/>{errors.transactionDate&&<p className="text-sm text-red-600">{ui(errors.transactionDate.message)}</p>}</FormField>
   {kind==='incoming'&&<><FormField label="مشتری موجود؛ اختیاری" id="incoming-customer"><select id="incoming-customer" className={fieldClass} value={values.customer||''} onChange={event=>{const customer=available.customers?.find(row=>String(row.id)===event.target.value);setValue('customer',customer?.id||null);if(customer){setValue('senderName',customer.name);setValue('phoneNumber',customer.phone||'')}}}><option value="">ثبت مشخصات یا انتخاب مشتری</option>{(available.customers||[]).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></FormField><FormField label="مسیر تبدیل" id="incoming-path"><select id="incoming-path" className={fieldClass} {...register('conversionPath')}><option value="TOMAN_TO_AFN">تومان به افغانی</option><option value="USD_TO_AFN">دالر به افغانی</option></select></FormField>{!usdPath&&<FormField label="پایه نرخ تومان" id="incoming-rate-base"><select id="incoming-rate-base" className={fieldClass} {...register('rateBaseAmount',{valueAsNumber:true})}><option value="1000">AFN برای هر 1,000 تومان</option><option value="1">AFN برای هر 1 تومان؛ نرخ‌های قبلی</option></select></FormField>}</>}
   {visible.map(key=><FormField key={key} label={ui(labels[key])+(key==='afnUsdRate'&&kind==='incoming'?` (AFN / ${formatAmount(values.rateBaseAmount)} TOMAN)`:'')+(required(key)?' *':'')} id={key} hint={key==='afnAmount'&&direct?'مبلغ افغانی را مستقیم وارد کنید.':undefined}>
    {numericFields.includes(key)?<Controller name={key} control={control} rules={{required:required(key)?'این خانه الزامی است.':false,validate:value=>!value&&!required(key)||Number.isFinite(Number(value))&&(key==='manualProfit'||(positive(key)?Number(value)>0:Number(value)>=0))||'مبلغ یا نرخ معتبر نیست.'}} render={({field})=><NumericInput {...field} id={key} allowNegative={key==='manualProfit'} precision={key.endsWith('Rate')?8:3} onChange={value=>{field.onChange(value);if(key==='tomanAmount'&&kind==='incoming'||key==='sourceAmount'&&values.currencyType==='TOMAN')setValue('tomanInWords',amountWords(value))}}/>}/>:['currencyType','moneyTransaction','manualProfitCurrency'].includes(key)?<select id={key} className={fieldClass} {...register(key,{validate:value=>key!=='manualProfitCurrency'||values.manualProfit==null||values.manualProfit===''||!!value||'واحد مفاد الزامی است.'})}><option value="">{ui('انتخاب کنید')}</option>{(['currencyType','manualProfitCurrency'].includes(key)?available.currencies:available.moneyTransactions).map(value=><option key={value} value={value}>{ui(value)}</option>)}</select>:key==='description'?<textarea id={key} className={fieldClass} rows={3} {...register(key)}/>:<input id={key} className={fieldClass} maxLength={key==='tomanInWords'?1000:key==='phoneNumber'?40:key==='nationalIdNumber'?100:200} type={key==='phoneNumber'?'tel':'text'} {...register(key,{validate:value=>!required(key)||!!value?.trim()||'این خانه الزامی است.'})}/>}
    {errors[key]&&<p role="alert" className="mt-1 text-sm text-red-600">{ui(errors[key].message)}</p>}
   </FormField>)}
  </div></section>
  <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40"><h3 className="font-semibold">{ui(direct?'مبلغ افغانی':'مبلغ افغانی (محاسبه)')}</h3><output className="my-2 block text-2xl font-bold" dir="ltr">{formatAmount(afn)} AFN</output><p className="text-sm">{amountWords(afn)} {ui('افغانی')}</p>{!direct&&<p className="mt-2 text-xs text-gray-500">{ui(kind==='provincial-received'||usdPath?'افغانی = مبلغ دالر × نرخ دالر به افغانی':kind==='incoming'?`افغانی = مقدار تومان × نرخ تومان به افغانی ÷ ${formatAmount(values.rateBaseAmount)}`:'افغانی = مبلغ تومان × نرخ افغانی')}</p>}</section>
  {kind!=='provincial-received'&&<section className="grid gap-5 border-t border-gray-200 pt-5 dark:border-gray-700 sm:grid-cols-2"><FormField label="تصویر تذکره" id="idCardImage" hint="JPG / PNG / WEBP — حداکثر ۵ مگابایت"><input id="idCardImage" type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={fileBusy}/>{values.idCardImageRef&&<div className="mt-3"><img src={values.idCardImageRef} alt={ui('تصویر تذکره')} className="max-h-48 rounded-lg"/><button type="button" className={secondaryButton+' mt-2'} onClick={()=>setValue('idCardImageRef','')}>{ui('حذف تصویر')}</button></div>}</FormField><div data-feature="FINGERPRINT_DEVICE_INTEGRATION" className="rounded-xl border border-dashed border-amber-300 p-4 dark:border-amber-800"><h3 className="font-semibold">{ui('اثر انگشت')}</h3><p className="mt-2 text-sm text-gray-500">{ui('اتصال دستگاه اثر انگشت در انتظار تکمیل است.')}</p>{initial.hasFingerprint&&<p className="mt-2 text-sm">{ui('قالب قبلی ثبت شده است.')}</p>}</div></section>}
  <footer className="flex flex-wrap gap-3 border-t border-gray-200 pt-5 dark:border-gray-700"><button disabled={pending||fileBusy||(!editing&&next.isPending)} className={primaryButton}>{ui(pending?'در حال ذخیره…':'ذخیره حواله')}</button><Link className={secondaryButton} to={`/${kind}`}>{ui('بازگشت به فهرست')}</Link></footer>
 </form>
}
