import {shamsi} from './remittance.js'
import {presentNumber,presentRate} from './presentation.js'
import {maskIdentifier} from './identifiers.js'
import {statusLabel} from './accountLabels.js'
const escape=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function printFinancialReceipt(doc,account,label){
 const page=window.open('','_blank')
 if(!page)return
 const lines=[['شماره رسید',doc.number],['تاریخ شمسی',shamsi(doc.date)],['مشتری / حساب',account.name],['نوع معامله',label],['مبلغ واقعی',`${presentNumber(doc.amount)} ${doc.currency}`],['ناخالص مقصد',`${presentNumber(doc.conversion.gross)} ${doc.conversion.destination||''}`],['قابل پرداخت',`${presentNumber(doc.conversion.net)} ${doc.conversion.destination||''}`],['فیس',`${presentNumber(doc.conversion.fee)} ${doc.conversion.fee_currency||''}`],['روش دریافت فیس',doc.conversion.collection==='DEDUCTED'?'کسر از مقصد':'جداگانه'],['ثبت‌کننده',doc.operator],['حالت',doc.status],['تأیید دریافت',doc.details.acknowledgement||'—']]
 lines.find(row=>row[0]==='حالت')[1]=statusLabel(doc.status)
 if(!doc.conversion.destination){
  lines.find(row=>row[0]==='ناخالص مقصد')[1]=`${presentNumber(doc.amount)} ${doc.currency}`
  lines.find(row=>row[0]==='قابل پرداخت')[1]=`${presentNumber(doc.amount)} ${doc.currency}`
 }
 for(const [key,currency] of [['source_rate',doc.currency],['destination_rate',doc.conversion.destination]])if(doc.conversion[key]&&currency){const quote=presentRate(doc.conversion[key],'USD',currency);lines.push([key==='source_rate'?'نرخ مبدأ':'نرخ مقصد',`${quote.value} ${quote.unit}`])}
 if(doc.conversion.afn_rate)lines.push(['نرخ به افغانی',`${presentNumber(doc.conversion.afn_rate)} AFN / 1 ${doc.currency}`])
 lines.push(['مفاد دستی',`${presentNumber(doc.manual_profit)} ${doc.profit_currency||''}`])
 const details={sender_name:'فرستنده',sender_father:'پدر فرستنده',sender_phone:'تماس فرستنده',sender_id:'تذکره فرستنده',recipient_name:'گیرنده',recipient_father:'پدر گیرنده',recipient_phone:'تماس گیرنده',recipient_id:'تذکره گیرنده',province:'ولایت',district:'ولسوالی',village:'قریه',payment_location:'محل پرداخت',paying_agency_name:'نمایندگی پرداخت‌کننده',paying_agency_phone:'تماس نمایندگی',payer:'پرداخت‌کننده',payee:'دریافت‌کننده',amount_words:'مبلغ به حروف',purpose:'مرجع مصرف پول',duration:'مدت',return_date:'تاریخ برگشت',contract_number:'نمبر قرارداد',office_name:'صرافی',office_address:'آدرس دفتر',office_phone:'تماس دفتر',responsible_officer:'مسئول',owner_address:'آدرس مالک',conditions:'شرایط نگهداری و آزادسازی',renewal_terms:'شرایط تمدید',early_termination:'فسخ پیش از موعد',special_agreements:'توافقات خاص',obligations:'تعهدات',witnesses:'شاهدان',depositor_name:'صاحب کارت واریزکننده',depositor_card:'کارت واریزکننده',recipient_card:'کارت گیرنده',final_recipient:'دریافت‌کننده نهایی',notes:'یادداشت'}
 for(const [key,title] of Object.entries(details))if(doc.details[key])lines.push([title,key==='return_date'?shamsi(doc.details[key]):['depositor_card','recipient_card'].includes(key)?maskIdentifier(doc.details[key]):doc.details[key]])
 page.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>رسید ${escape(doc.number)}</title><style>body{font:15px Tahoma;padding:24px;color:#10253d}h1{border-bottom:2px solid #2463a5;padding-bottom:16px}table{width:100%;border-collapse:collapse}td{padding:12px;border-bottom:1px solid #dce4ef}button{padding:12px 28px;margin-top:20px}@media print{button{display:none}}</style></head><body><h1>رسید صرافی امیری</h1><table>${lines.map(([key,value])=>`<tr><td>${escape(key)}</td><td>${escape(value)}</td></tr>`).join('')}</table><p>تأیید دریافت‌کننده: ____________________</p><p>امضا / اثر انگشت و مهر شرکت: ____________________</p><button id="print">چاپ رسید</button></body></html>`)
 page.document.close();page.document.getElementById('print').onclick=()=>page.print()
}
