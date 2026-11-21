import {useState} from 'react'
import {FormField,Modal,fieldClass,primaryButton} from './FinanceUI'
import {ErrorBanner} from '../remittances/UI'
import {provincialRequest as api} from '../provincialApi'

import {partyDetailsPatch} from '../provincialFields'
import {simplePartyFields as provincialPartyFields} from '../provincialFields'

export default function ProvincialPartyForm({row,onClose,onSaved}){
 const [details,setDetails]=useState(()=>Object.fromEntries(Object.keys(provincialPartyFields).map(key=>[key,row.details[key]||'']))),[error,setError]=useState(null),[busy,setBusy]=useState(false)
 return <Modal title={`ویرایش مشخصات حواله — ${row.number}`} onClose={onClose} width="max-w-3xl"><form className="space-y-4" onSubmit={async event=>{event.preventDefault();setBusy(true);setError(null);try{await api(`/provincial/remittances/${row.id}/`,{details:partyDetailsPatch(row.details,details)},'PATCH');await onSaved()}catch(error){setError(error)}finally{setBusy(false)}}}><div className="grid gap-4 sm:grid-cols-2">{Object.entries(provincialPartyFields).map(([key,label])=><FormField key={key} label={label} id={`edit-${key}`}><input id={`edit-${key}`} required={['sender_name','recipient_name'].includes(key)} maxLength={key.endsWith('phone')?50:key==='notes'?2000:250} type={key.endsWith('phone')?'tel':'text'} className={`${fieldClass} ${error?.fields?.[key]?'!border-red-500':''}`} value={details[key]} onChange={event=>setDetails(current=>({...current,[key]:event.target.value}))}/></FormField>)}</div><p className="text-sm text-gray-500">اصلاح مالی از مسیر برگشت با حفظ سابقه انجام می‌شود.</p><ErrorBanner error={error}/><button className={primaryButton} disabled={busy}>ذخیره مشخصات</button></form></Modal>
}
