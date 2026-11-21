import {presentNumber} from './presentation.js'
import {shamsi} from './remittance.js'
import {monthRange,monthTitle} from './calendar.js'
import {statusLabel} from './accountLabels.js'

const cell=value=>'"'+String(value??'').replaceAll('"','""').replace(/^[=+@-]/,"'$&")+'"'
export function downloadAccountReport(account,month,labels){
 const {dateFrom,dateBefore}=monthRange(month)
 const rows=[['گزارش حساب',account.name,monthTitle(month)],['رسید','تاریخ شمسی','نوع معامله','مبلغ','واحد','حالت']]
 for(const doc of account.documents.filter(d=>d.date>=dateFrom&&d.date<dateBefore))rows.push([doc.number,shamsi(doc.date),labels[doc.category]||doc.category,presentNumber(doc.amount),doc.currency,statusLabel(doc.status)])
 const blob=new Blob(['\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'})
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`account-${account.id}-${month}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
