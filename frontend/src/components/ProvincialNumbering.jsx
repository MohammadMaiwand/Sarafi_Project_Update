import {useState} from 'react'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {provincialRequest as api} from '../provincialApi'
import {ErrorBanner} from '../remittances/UI'
import {fieldClass,primaryButton,secondaryButton,surface} from './FinanceUI'
import {parseAmount} from '../utils/remittance'

export default function ProvincialNumbering(){
 const query=useQuery({queryKey:['provincial-numbering'],queryFn:()=>api('/provincial/numbering/')})
 const [editing,setEditing]=useState(false)
 return <section className={`${surface} space-y-3 p-4 print:hidden`}><ErrorBanner error={query.error}/>{query.data&&<><p>شماره بعدی سری حواله ولایتی: <b dir="ltr">{query.data.next_reference}</b></p><p className="text-sm text-gray-500">شماره‌گذاری مشترک آمد و رفت در همه ولایت‌ها؛ دورهٔ هر سال شمسی. شماره‌های قبلی تغییر نمی‌کنند.</p>{query.data.can_configure&&<button className={secondaryButton} onClick={()=>setEditing(value=>!value)}>تنظیم شماره آغاز حواله ولایتی</button>}{editing&&query.data.can_configure&&<NumberingForm key={query.data.starting_number} value={query.data.starting_number} onSaved={()=>setEditing(false)}/>}</>}</section>
}
function NumberingForm({value,onSaved}){
 const [start,setStart]=useState(String(value)),[error,setError]=useState(null),[busy,setBusy]=useState(false),client=useQueryClient()
 return <form className="flex flex-wrap items-end gap-3" onSubmit={async event=>{event.preventDefault();setBusy(true);setError(null);try{await api('/provincial/numbering/',{starting_number:Number(parseAmount(start))});await client.invalidateQueries({queryKey:['provincial-numbering']});onSaved()}catch(error){setError(error)}finally{setBusy(false)}}}><label>شماره آغاز<input required inputMode="numeric" className={fieldClass} value={start} onChange={event=>setStart(event.target.value)}/></label><button disabled={busy} className={primaryButton}>ذخیره تنظیم</button><p className="w-full text-sm text-gray-500">شماره صادرشده دوباره استفاده نمی‌شود؛ اگر سری قبلاً آغاز شده باشد، ادامه از بزرگ‌ترِ شماره آغاز و آخرین شماره + ۱ است.</p><ErrorBanner error={error}/></form>
}
