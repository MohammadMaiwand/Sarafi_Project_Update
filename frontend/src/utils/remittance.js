import { presentNumber } from './presentation.js'
export const normalizeDigits=value=>String(value??'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replaceAll('٫','.').replaceAll('٬',',')
export const parseAmount=value=>normalizeDigits(value).replaceAll(',','').replaceAll(' ','')
const formatter=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'UTC'})
export function shamsi(iso){
 if(!iso)return ''
 const parts=Object.fromEntries(formatter.formatToParts(new Date(`${iso}T12:00:00Z`)).map(part=>[part.type,part.value]))
 return `${parts.year}/${parts.month}/${parts.day}`
}
export function isoDate(input){
 const normalized=normalizeDigits(input).trim(),match=normalized.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
 if(!match)throw new Error('تاریخ شمسی را به شکل ۱۴۰۵/۰۸/۱۴ وارد کنید.')
 const [,year,month,day]=match.map(Number)
 if(year<1200||year>1600||month<1||month>12||day<1||day>31)throw new Error('تاریخ شمسی معتبر نیست.')
 const target=`${year}/${String(month).padStart(2,'0')}/${String(day).padStart(2,'0')}`,start=Date.UTC(year+621,2,18)
 for(let index=0;index<370;index++){const date=new Date(start+index*86400000).toISOString().slice(0,10);if(shamsi(date)===target)return date}
 throw new Error('تاریخ شمسی معتبر نیست.')
}
const ones=['','یک','دو','سه','چهار','پنج','شش','هفت','هشت','نه','ده','یازده','دوازده','سیزده','چهارده','پانزده','شانزده','هفده','هجده','نوزده']
export function amountWords(value){
 const raw=parseAmount(value)
 if(!/^\d{1,21}(\.\d*)?$/.test(raw))return ''
 const [integer,fraction='']=raw.split('.')
 let number=BigInt(integer)
 const hundreds=['','صد','دوصد','سه‌صد','چهارصد','پنج‌صد','شش‌صد','هفت‌صد','هشت‌صد','نه‌صد'],tens=['','','بیست','سی','چهل','پنجاه','شصت','هفتاد','هشتاد','نود']
 const group=v=>[hundreds[Math.floor(v/100)],v%100<20?ones[v%100]:[tens[Math.floor(v%100/10)],ones[v%10]].filter(Boolean).join(' و ')].filter(Boolean).join(' و ')
 const result=[],scales=['','هزار','میلیون','میلیارد','تریلیون','کوادریلیون','کوینتیلیون']
 for(let index=0;number;index++,number/=1000n)if(number%1000n)result.unshift(`${group(Number(number%1000n))} ${scales[index]}`.trim())
 const decimals=Number(fraction.padEnd(3,'0').slice(0,3))
 return (result.join(' و ')||'صفر')+(decimals?` و ${amountWords(String(decimals))} هزارم`:'')
}
export function calculateAfn(amount,rate){
 const a=parseAmount(amount).replace(/^\./,'0.'),r=parseAmount(rate).replace(/^\./,'0.')
 if(!/^\d+(\.\d+)?$/.test(a)||!/^\d+(\.\d+)?$/.test(r))return '0.000'
 const [ai,af='']=a.split('.'),[ri,rf='']=r.split('.')
 const product=BigInt(ai+af)*BigInt(ri+rf),scale=10n**BigInt(af.length+rf.length)
 const rounded=(product*1000n+scale/2n)/scale
 return `${rounded/1000n}.${String(rounded%1000n).padStart(3,'0')}`
}
export function calculateAfnWithBase(amount,rate,base=1){
 const a=parseAmount(amount).replace(/^\./,'0.'),r=parseAmount(rate).replace(/^\./,'0.')
 if(!/^\d+(\.\d+)?$/.test(a)||!/^\d+(\.\d+)?$/.test(r)||![1,1000].includes(Number(base)))return '0.000'
 const [ai,af='']=a.split('.'),[ri,rf='']=r.split('.')
 const numerator=BigInt(ai+af)*BigInt(ri+rf)*1000n,denominator=10n**BigInt(af.length+rf.length)*BigInt(base)
 const rounded=(numerator+denominator/2n)/denominator
 return `${rounded/1000n}.${String(rounded%1000n).padStart(3,'0')}`
}
export const formatAmount = value => presentNumber(value == null || value === "" ? value : parseAmount(value))
export function groupExact(value){const raw=parseAmount(value),[whole,fraction]=raw.split('.');return `${(whole||'0').replace(/\B(?=(\d{3})+(?!\d))/g,',')}${fraction!==undefined?'.'+fraction:''}`}
