import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import SystemReportDocument from '../components/SystemReportDocument'
import reportCss from '../report.css?raw'
export function systemReportHtml(report,showEmpty=false){return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${report.type==='tehran'?'گزارش حواله تهران':'گزارش جامع سیستم'}</title><style>${reportCss}</style></head><body>${renderToStaticMarkup(createElement(SystemReportDocument,{report,showEmpty}))}</body></html>`}
export async function printSystemReport(report,showEmpty){
 document.getElementById('financial-report-print')?.remove()
 const frame=document.createElement('iframe');frame.id='financial-report-print';frame.title='چاپ گزارش مالی';frame.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';document.body.appendChild(frame)
 try{const page=frame.contentWindow;page.document.open();page.document.write(systemReportHtml(report,showEmpty));page.document.close();await page.document.fonts.ready;page.addEventListener('afterprint',()=>frame.remove(),{once:true});page.focus();page.print()}catch(error){frame.remove();throw error}
}
