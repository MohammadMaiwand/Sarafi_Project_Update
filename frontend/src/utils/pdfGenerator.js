import { maskIdentifier } from './identifiers'
import { shamsi, formatAmount } from './remittance'

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

export function transactionReceiptMarkup(transaction){
 const customer=transaction.customer||{}
 return `<div style="border:2px solid #1d4ed8;border-radius:18px;padding:26px;height:100%;box-sizing:border-box"><div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #dbe3ef;padding-bottom:18px;margin-bottom:22px"><div><div style="font-size:13px;color:#64748b">رسید حواله و تبادله</div><h1 style="font-size:24px;margin:8px 0 0">رسید معامله</h1></div><div style="background:#eff6ff;color:#1d4ed8;padding:10px 14px;border-radius:10px;font-size:14px">شماره: ${escapeHtml(transaction.voucher_number)}</div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px"><div style="background:#f8fafc;padding:12px;border-radius:10px">مشتری: <b>${escapeHtml(customer.name || '')}</b></div><div style="background:#f8fafc;padding:12px;border-radius:10px">تاریخ: <b>${escapeHtml(shamsi(transaction.date))}</b></div><div style="background:#f8fafc;padding:12px;border-radius:10px">فرستنده: <b>${escapeHtml(transaction.sender_name || '—')}</b></div><div style="background:#f8fafc;padding:12px;border-radius:10px">گیرنده: <b>${escapeHtml(transaction.receiver_name || '—')}</b></div></div><table style="border-collapse:collapse;width:100%;font-size:14px"><thead><tr style="background:#eff6ff"><th style="padding:12px;text-align:right">شرح</th><th style="padding:12px;text-align:left">مقدار</th></tr></thead><tbody>${[['مبلغ تومان',transaction.toman_amount],['مقدار دالر',transaction.usd_amount],['مقدار افغانی',transaction.afghani_amount],['نرخ تومان',transaction.toman_rate],['نرخ افغانی',transaction.afghani_rate],['نرخ مؤثر AFN/TOMAN',transaction.toman_profit]].map(([label,value]) => `<tr><td style="border-bottom:1px solid #e2e8f0;padding:12px">${label}</td><td dir="ltr" style="border-bottom:1px solid #e2e8f0;padding:12px;text-align:left;font-weight:600">${escapeHtml(formatAmount(value))}</td></tr>`).join('')}</tbody></table><div style="margin-top:18px;padding:14px;background:#f8fafc;border-radius:10px;min-height:50px">مرجع مصرف: ${escapeHtml(transaction.expense || "—")}<br/>تومان به حروف: ${escapeHtml(transaction.toman_in_words || "—")}<br/>توضیحات: ${escapeHtml(transaction.description || '—')}</div><div style="display:flex;justify-content:space-between;margin-top:36px;padding-top:14px;border-top:1px solid #dbe3ef;color:#64748b;font-size:12px"><span>نام صاحب کارت: ${escapeHtml(transaction.depositor_cardholder || "—")}<br/>شماره کارت بانکی واریزکننده: ${escapeHtml(maskIdentifier(transaction.depositor_card))}<br/>شماره کارت بانکی (گیرنده): ${escapeHtml(maskIdentifier(transaction.bank_account))}</span><span>با تشکر از اعتماد شما</span></div></div>`
}

export async function generateTransactionPdf(transaction) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  const node = document.createElement('div')
  node.dir = 'rtl'
  node.lang = 'fa'
  node.style.cssText = 'position:fixed;left:0;top:0;z-index:-1;width:560px;min-height:790px;padding:36px;background:#fff;color:#172033;font-family:Tahoma,Arial,sans-serif;box-sizing:border-box;direction:rtl;'
  node.innerHTML = transactionReceiptMarkup(transaction)
  document.body.appendChild(node)
  try {
    await document.fonts?.ready
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height)
    const width = canvas.width * ratio
    const height = canvas.height * ratio
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pageWidth - width) / 2, (pageHeight - height) / 2, width, height)
    return pdf
  } finally {
    node.remove()
  }
}

export async function downloadAndOpenWhatsApp(transaction, whatsappWindow) {
  const pdf = await generateTransactionPdf(transaction)
  const filename = `voucher-${transaction.voucher_number}.pdf`
  pdf.save(filename)
  const digits = String(transaction.customer?.phone || '').replace(/[^\d]/g, '')
  const message = `رسید شماره ${transaction.voucher_number} آماده شد. لطفاً فایل PDF دانلودشده را به این گفتگو پیوست کنید.`
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
  if (whatsappWindow) whatsappWindow.location.href = url
  else window.location.href = url
}
