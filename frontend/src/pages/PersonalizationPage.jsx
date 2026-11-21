import {useState} from 'react'
import useLanguage from '../hooks/useLanguage'
import {sectionNames} from '../personalization'
import {FinancePage,surface,fieldClass,primaryButton,secondaryButton} from '../components/FinanceUI'

export default function PersonalizationPage(){
 const {sectionLabels,saveSectionLabels,ui}=useLanguage()
 const [draft,setDraft]=useState(()=>({...sectionLabels})),[saved,setSaved]=useState(false),[error,setError]=useState('')
 function submit(event){
  event.preventDefault()
  try{saveSectionLabels(draft);setSaved(true);setError('')}catch{setError('ذخیره تنظیمات ممکن نشد؛ فضای ذخیره مرورگر را بررسی کنید.')}
 }
 return <FinancePage title="تنظیمات شخصی‌سازی" subtitle="نام نمایشی بخش‌ها را مطابق خواست خود تنظیم کنید.">
  <form onSubmit={submit} className={`${surface} space-y-5 p-4 sm:p-6`}>
   <p className="text-sm leading-7 text-gray-500">نام جدید در سایدبار، مینوبار و عنوان اصلی صفحهٔ مربوط نمایش داده می‌شود. خانهٔ خالی نام پیش‌فرض را نگه می‌دارد. تنظیمات در همین مرورگر ذخیره می‌شوند و پس از بستن و بازکردن سیستم باقی می‌مانند.</p>
   <div className="grid gap-4">{sectionNames.map(([id,label])=><div key={id} className="grid items-center gap-3 border-b border-gray-100 pb-4 dark:border-gray-800 sm:grid-cols-2"><label htmlFor={`section-${id}`} className="font-semibold">{label}</label><input id={`section-${id}`} className={fieldClass} value={draft[id]||''} maxLength={80} placeholder={label} onChange={event=>{setDraft({...draft,[id]:event.target.value});setSaved(false)}}/></div>)}</div>
   {error&&<p role="alert" className="text-red-600">{error}</p>}
   {saved&&<p role="status" className="text-emerald-700 dark:text-emerald-300">نام‌ها با موفقیت ذخیره شدند.</p>}
   <div className="flex flex-wrap gap-3"><button className={primaryButton} type="submit">{ui('ذخیره')}</button><button type="button" className={secondaryButton} onClick={()=>{setDraft({});setSaved(false)}}>بازگرداندن نام‌های پیش‌فرض</button></div>
  </form>
 </FinancePage>
}
