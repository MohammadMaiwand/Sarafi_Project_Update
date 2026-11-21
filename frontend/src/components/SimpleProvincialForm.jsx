import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {Modal,FormField,fieldClass,primaryButton,secondaryButton} from './FinanceUI'
import {ErrorBanner} from '../remittances/UI'
import {AfghanDateInput} from './AfghanDate'
import {businessToday} from '../utils/calendar'
import {amountWords,calculateAfn,parseAmount} from '../utils/remittance'
import {presentNumber} from '../utils/presentation'
import {provincialRequest as api} from '../provincialApi'
import {simplePartyFields} from '../provincialFields'

const currencies={TOMAN:'تومان',AFN:'افغانی',USD:'دالر',EUR:'یورو',PKR:'کلدار پاکستانی',TRY:'لیره'}
export default function SimpleProvincialForm({province,direction,accounts,initialAccount,onClose,onSaved,workspace='provincial',initialParty={}}){
 const [data,setData]=useState({date:businessToday(),currency:'TOMAN',amount:'',rate:'',profit:'0',sender_name:'',sender_phone:'',recipient_name:'',sender_father:'',recipient_father:'',recipient_id:'',recipient_phone:'',identity_image:'',...initialParty})
 const [manual,setManual]=useState(false),[number,setNumber]=useState(''),[error,setError]=useState(null),[busy,setBusy]=useState(false),[fileBusy,setFileBusy]=useState(false),[requestKey]=useState(()=>crypto.randomUUID())
 const set=(key,value)=>setData(current=>({...current,[key]:value}))
 const account=accounts.find(row=>String(row.id)===String(initialAccount))||accounts[0]
 const payment=direction==='PROVINCIAL_PAYMENT'
 const customers=useQuery({queryKey:['provincial-payment-customers',workspace,account?.id],queryFn:()=>api(`/provincial/accounts/${account.id}/customer-payments/?workspace=${workspace}`),enabled:payment&&!!account})
 const customerOptions=Array.from(new Map((customers.data?.results||[]).map(row=>[row.key,row])).values())
 function chooseCustomer(key){const selected=customerOptions.find(row=>row.key===key);if(selected)setData(current=>({...current,...selected.details}))}
 const afn=calculateAfn(data.amount,data.currency==='AFN'?'1':data.rate)
 const calculated=`${fieldClass} !bg-blue-50 dark:!bg-blue-950`
 async function upload(event){
  const file=event.target.files?.[0];if(!file)return
  setError(null)
  if(file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){setError(new Error('عکس تذکره باید JPG، PNG یا WEBP و حداکثر ۵ مگابایت باشد.'));event.target.value='';return}
  setFileBusy(true)
  try{await createImageBitmap(file).then(bitmap=>bitmap.close());const value=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});set('identity_image',value)}catch{setError(new Error('عکس قابل خواندن نیست.'))}finally{setFileBusy(false)}
 }
 async function submit(event){
  event.preventDefault();setError(null);setBusy(true)
  try{
   if(!account)throw new Error('اکونت انتخاب نشده است.')
   if(manual&&!/^\d{1,9}$/.test(parseAmount(number)))throw new Error('نمبر حواله باید عدد صحیح مثبت باشد.')
   const details=Object.fromEntries([...Object.keys(simplePartyFields),'sender_phone'].map(key=>[key,data[key].trim()]))
   await api(payment?`/provincial/accounts/${account.id}/customer-payments/`:'/provincial/remittances/',{workspace,request_key:requestKey,account:account.id,province,category:direction,date:data.date,currency:data.currency,amount:parseAmount(data.amount),afn_rate:data.currency==='AFN'?'1':parseAmount(data.rate),manual_profit:parseAmount(data.profit),profit_currency:'AFN',...(manual?{manual_number:Number(parseAmount(number))}:{}),details:{...details,identity_image:data.identity_image}})
   await onSaved()
  }catch(error){setError(error)}finally{setBusy(false)}
 }
 const textField=(key,label,required=false)=><FormField key={key} label={label} id={`simple-${key}`}><input id={`simple-${key}`} required={required} maxLength={key.endsWith('phone')?50:250} type={key.endsWith('phone')?'tel':'text'} className={fieldClass} value={data[key]} onChange={e=>set(key,e.target.value)}/></FormField>
 return <Modal title={payment?'ثبت پرداخت مشتری / پیش‌پرداخت':`حواله ولایتی — ${direction==='PROVINCIAL_OUT'?'رفت':'آمد'}`} onClose={onClose} width="max-w-5xl"><form onSubmit={submit} className="space-y-4" dir="rtl">{payment&&<section className="rounded-xl border p-4"><p className="mb-3">مشتری موجود را انتخاب کنید یا نام مشتری جدید را در پایین بنویسید. پرداخت بدون حواله و بیش از حوالهٔ موجود مجاز است. برای حواله‌های بعدی، نام و شمارهٔ تماس همین مشتری را استفاده کنید.</p><label htmlFor="payment-existing-customer">انتخاب مشتری موجود</label><select id="payment-existing-customer" className={fieldClass} value="" onChange={e=>chooseCustomer(e.target.value)}><option value="">مشتری جدید / انتخاب مشتری قبلی</option>{customerOptions.map(row=><option key={row.key} value={row.key}>{row.name} {row.phone}</option>)}</select><ErrorBanner error={customers.error}/></section>}<div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
  <FormField label={payment?"نمبر پرداخت":"نمبر حواله"} id="simple-number"><div className="flex gap-2"><input id="simple-number" aria-label="نمبر حواله" className={manual?fieldClass:calculated} readOnly={payment||!manual} required={!payment&&manual} inputMode="numeric" value={manual?number:''} placeholder="به‌صورت خودکار با شماره بعدی پر می‌شود" onChange={e=>setNumber(e.target.value)}/>{!payment&&<button type="button" className={`${secondaryButton} whitespace-nowrap`} onClick={()=>setManual(value=>!value)}>{manual?'شماره خودکار':'ویرایش دستی'}</button>}</div></FormField>
  <FormField label="تاریخ (هجری شمسی افغانستان)" id="simple-date"><AfghanDateInput required id="simple-date" className={fieldClass} value={data.date} onChange={e=>set('date',e.target.value)}/></FormField>
  {textField('sender_name',payment?'نام مشتری / حواله‌کننده':'اسم فرستنده',true)}{textField('recipient_name','اسم گیرنده',true)}
  {textField('sender_phone','شماره تماس مشتری؛ برای تشخیص افراد هم‌نام')}{textField('sender_father','ولد')}{textField('recipient_father','ولد')}
  <FormField label="نوع پول" id="simple-currency"><select id="simple-currency" className={fieldClass} value={data.currency} onChange={e=>{set('currency',e.target.value);set('rate','')}}>{Object.entries(currencies).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></FormField>
  <FormField label={`مقدار ${currencies[data.currency]}`} id="simple-amount"><input required id="simple-amount" inputMode="decimal" className={fieldClass} value={data.amount} onChange={e=>set('amount',e.target.value)}/></FormField>
  <FormField label={`${currencies[data.currency]} به حروف`} id="simple-words"><input id="simple-words" readOnly className={calculated} value={data.amount?amountWords(data.amount):''}/></FormField>
  <FormField label={`نرخ ${currencies[data.currency]} به افغانی`} id="simple-rate" hint={`افغانی برای یک ${currencies[data.currency]}`}><input required id="simple-rate" inputMode="decimal" readOnly={data.currency==='AFN'} className={data.currency==='AFN'?calculated:fieldClass} value={data.currency==='AFN'?'1':data.rate} onChange={e=>set('rate',e.target.value)}/></FormField>
  <FormField label="افغانی" id="simple-afn"><input id="simple-afn" readOnly className={calculated} value={data.amount&&(data.rate||data.currency==='AFN')?presentNumber(afn):''}/></FormField>
  <FormField label="مفاد" id="simple-profit" hint="افغانی"><input required id="simple-profit" inputMode="decimal" className={fieldClass} value={data.profit} onChange={e=>set('profit',e.target.value)}/></FormField>
  {textField('recipient_id','نمبر تذکره')}{textField('recipient_phone','شماره تماس')}
  <FormField label="عکس تذکره" id="simple-image" className="sm:col-span-2"><input id="simple-image" type="file" className={fieldClass} accept="image/jpeg,image/png,image/webp" disabled={fileBusy} onChange={upload}/>{data.identity_image&&<img src={data.identity_image} alt="عکس تذکره انتخاب‌شده" className="mt-3 max-h-36 rounded-lg"/>}</FormField>
 </div><section className="rounded-xl border bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800"><h3 className="font-bold">اثر انگشت</h3><p className="my-3 text-sm text-gray-500">دستگاه اثر انگشت متصل نیست؛ ثبت حواله بدون اثر انگشت انجام می‌شود.</p><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked readOnly/>عدم ذخیره اثر انگشت</label><button type="button" disabled className={`${secondaryButton} mr-4 opacity-50`}>گرفتن اثر انگشت</button></section><ErrorBanner error={error}/><button className={primaryButton} disabled={busy||fileBusy}>{busy?'در حال ثبت…':payment?'ثبت پرداخت':'ثبت حواله'}</button></form></Modal>
}
