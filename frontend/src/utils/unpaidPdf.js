import {pendingReceiptFields} from './unpaidRemittance.js'
const escape=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function receiptBlocks(row){
 return pendingReceiptFields(row).flatMap(([label,value])=>{
  // Keep long notes readable and split at text boundaries before paginating.
  const pieces=String(value).match(/[\s\S]{1,240}(?:\s|$)|[\s\S]{1,240}/g)||['—']
  return pieces.map((part,index)=>`<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:12px;line-height:1.8"><div style="width:34%;flex-shrink:0;color:#64748b">${escape(label)}${index?' (ادامه)':''}</div><div style="flex:1;min-width:0;font-weight:bold;overflow-wrap:anywhere;white-space:pre-wrap;unicode-bidi:plaintext">${escape(part)}</div></div>`)
 })
}
export function receiptPage(row){
 const page=document.createElement('section')
 page.dir='rtl';page.lang='fa'
 page.style.cssText='position:relative;width:560px;height:794px;padding:28px 32px;background:#fff;color:#10253d;box-sizing:border-box;font-family:Tahoma,Arial,sans-serif;text-align:right;direction:rtl;'
 page.innerHTML=`<header style="height:91px;border-bottom:3px solid #0f766e;box-sizing:border-box"><div style="font-size:12px;color:#0f766e">صرافی امیری · حواله و خدمات مالی</div><h1 style="font-size:22px;margin:9px 0 7px">صورت وضعیت حواله</h1><div style="font-size:11px;color:#64748b">${escape(row.number)} · ${escape(row.status)}</div></header><main style="height:588px;padding-top:6px;box-sizing:border-box"></main><footer style="position:absolute;bottom:22px;left:32px;right:32px;border-top:1px solid #cbd5e1;padding-top:10px;font-size:10px;color:#64748b;line-height:1.8"><div>این سند گزارش وضعیت حواله است و تأیید دریافت یا پرداخت وجه نیست.</div><div style="display:flex;justify-content:space-between"><span>امضای مسئول: ______________</span><span class="receipt-page-number"></span></div></footer>`
 return page
}
export async function generateUnpaidPdf(row){
 const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')])
 const frame=document.createElement('iframe');frame.title='آماده‌سازی رسید A5';frame.setAttribute('aria-hidden','true');frame.style.cssText='position:fixed;left:0;top:0;z-index:-10000;width:560px;height:794px;border:0;pointer-events:none;'
 document.body.appendChild(frame)
 const isolated=frame.contentDocument
 isolated.open();isolated.write('<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"></head><body style="margin:0;background:white"></body></html>');isolated.close()
 const host=isolated.body
 try{
  await isolated.fonts?.ready
  const pages=[]
  const addPage=()=>{const page=receiptPage(row);host.appendChild(page);pages.push(page);return page.querySelector('main')}
  let content=addPage()
  for(const block of receiptBlocks(row)){
   const holder=document.createElement('div');holder.innerHTML=block;const item=holder.firstElementChild;content.appendChild(item)
   if(content.scrollHeight>content.clientHeight){item.remove();content=addPage();content.appendChild(item)}
  }
  const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a5'})
  for(let index=0;index<pages.length;index++){
   // Render each page at the same viewport origin, including continuation pages.
   host.replaceChildren(pages[index])
   pages[index].querySelector('.receipt-page-number').textContent=`صفحه ${index+1} از ${pages.length}`
   const canvas=await html2canvas(pages[index],{scale:2,backgroundColor:'#ffffff',useCORS:false,logging:false,scrollX:0,scrollY:0,windowWidth:560,windowHeight:794})
   if(index)pdf.addPage('a5','portrait')
   pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,148,210)
  }
  pdf.setProperties({title:`Remittance ${row.number}`,subject:'Remittance status - not proof of payment',creator:'Amiri Workspace'})
  return pdf
 }finally{frame.remove()}
}
export async function downloadUnpaidPdf(row){const pdf=await generateUnpaidPdf(row);pdf.save(`remittance-${String(row.number).replace(/[^\w-]/g,'_')}-A5.pdf`)}
