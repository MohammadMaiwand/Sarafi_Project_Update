import {shamsi,amountWords} from './remittance.js'
import {presentNumber} from './presentation.js'
export const pendingKinds={PROVINCIAL_IN:'حواله ولایتی آمد',PROVINCIAL_OUT:'حواله ولایتی رفت',TEHRAN_REMITTANCE:'حواله تهران',incoming:'حواله تهران کابل',outgoing:'حواله دریافتی ولایتی','provincial-received':'سوابق حواله ولایتی',TEHRAN:'حواله تهران'}
export const pendingDetailLabels={sender_name:'نام فرستنده',sender_father:'ولد فرستنده',sender_phone:'تماس فرستنده',sender_id:'تذکره فرستنده',sender_location:'محل فرستنده',recipient_name:'نام گیرنده',recipient_father:'ولد گیرنده',recipient_phone:'شماره تماس گیرنده',recipient_id:'نمبر تذکره گیرنده',province:'ولایت',district:'ولسوالی',village:'قریه',payment_location:'محل پرداخت',paying_agency_name:'نمایندگی پرداخت‌کننده',paying_agency_phone:'تماس نمایندگی',purpose:'مرجع مصرف',notes:'توضیحات',acknowledgement:'تأیید دریافت'}
export function pendingRecord(row,legacy=false){
 const conversion=row.conversion||{},details=row.details||{}
 return {...row,key:legacy?`${row.legacy_remittance?'legacy':'tehran'}-${row.legacy_remittance||row.tehran_transaction}`:`document-${row.id}`,legacy,details,conversion,type:pendingKinds[row.category||row.kind]||'حواله',unit:legacy?row.currency:conversion.destination||row.currency,payable:legacy?row.amount:conversion.net??row.amount,sourceAmount:legacy?row.source_amount??row.amount:row.amount,sourceCurrency:legacy?row.source_currency||row.currency:row.currency,status:legacy?'نیازمند تأیید وضعیت پرداخت':row.beneficiary?.status==='PARTIAL'?'قسمی پرداخت‌شده':'پرداخت‌نشده',paid:legacy?null:row.beneficiary?.paid,remaining:legacy?null:row.beneficiary?.outstanding,sender:details.sender_name||row.sender_name||'—',recipient:details.recipient_name||row.recipient_name||'—'}
}
const money=(value,unit)=>`${presentNumber(value)} ${unit||''}`
export function pendingReceiptFields(row){
 const fields=[['نمبر حواله',row.number],['تاریخ معامله (شمسی)',shamsi(row.date)],['نوع معامله',row.type],['وضعیت پرداخت',row.status],['حساب / نماینده',row.representative_name||'—'],['مبلغ اصلی',money(row.sourceAmount,row.sourceCurrency)],['مبلغ قابل پرداخت',money(row.payable,row.unit)],['مبلغ به حروف',`${amountWords(row.payable)} ${row.unit}`],['پرداخت‌شده',row.paid===null?'وضعیت پرداخت تأیید نشده':money(row.paid,row.unit)],['باقی‌مانده گیرنده',row.remaining===null?'نیازمند بررسی پرداخت‌ها':money(row.remaining,row.unit)]]
 if(row.agency)fields.push(['مانده تسویه نمایندگی',money(row.agency.outstanding,row.details.agency_currency||row.unit)])
 const c=row.conversion
 if(c.afn_rate)fields.push(['نرخ تبدیل به افغانی',`${c.afn_rate} AFN / 1 ${row.sourceCurrency}`])
 if(c.source_rate)fields.push(['نرخ مبدأ',`${c.source_rate} ${row.sourceCurrency} / 1 USD`])
 if(c.destination_rate)fields.push(['نرخ مقصد',`${c.destination_rate} ${row.unit} / 1 USD`])
 if(c.usd_rate&&Number(c.usd_rate)>0)fields.push(['نرخ دالر',`${c.usd_rate} AFN / 1 USD`])
 if(c.fee!=null)fields.push(['فیس',money(c.fee,c.fee_currency)])
 if(row.manual_profit!=null)fields.push(['مفاد',money(row.manual_profit,row.profit_currency||'واحد نامشخص')])
 for(const [key,label] of Object.entries(pendingDetailLabels))if(row.details[key])fields.push([label,row.details[key]])
 if(row.operator)fields.push(['ثبت‌کننده',row.operator])
 return fields
}
