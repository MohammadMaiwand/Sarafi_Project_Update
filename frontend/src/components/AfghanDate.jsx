import { useState } from 'react'
import { isoDate, shamsi } from '../utils/remittance'
import { afghanMonths, englishMonths } from '../utils/calendar'
import useLanguage from '../hooks/useLanguage'

export function AfghanDateInput({value,onChange,...props}) {
  const [draft,setDraft]=useState(null),[invalid,setInvalid]=useState(false)
  return <input {...props} type="text" dir="ltr" placeholder="1405/08/15" value={draft ?? shamsi(value)} aria-invalid={invalid || undefined} onChange={event=>{const text=event.target.value;setDraft(text);try{const iso=text?isoDate(text):'';setInvalid(false);event.target.setCustomValidity('');onChange?.({...event,target:{...event.target,value:iso},currentTarget:{...event.currentTarget,value:iso}})}catch(error){setInvalid(true);event.target.setCustomValidity(error.message)}}} onBlur={()=>{if(!invalid)setDraft(null)}} className={`${props.className||''} ${invalid?'!border-red-500 !bg-red-50':''}`}/>
}
export function AfghanMonthInput({value,onChange,className='',disabled=false,...props}) {
  const {lang}=useLanguage(),[year,month]=value.split('-')
  return <span className="ui-month-input inline-flex items-center gap-2" {...props}><select disabled={disabled} aria-label="ماه شمسی" className={className} value={month} onChange={e=>onChange({target:{value:`${year}-${e.target.value}`}})}>{(lang==='en'?englishMonths:afghanMonths).map((name,index)=><option key={name} value={String(index+1).padStart(2,'0')}>{name}</option>)}</select><input disabled={disabled} aria-label="سال شمسی" className={`${className} !w-24`} type="number" min="1200" max="1600" value={year} onChange={e=>{if(e.target.value.length===4)onChange({target:{value:`${e.target.value}-${month}`}})}}/></span>
}
