import { accountLabels, bucketLabel } from '../utils/accountLabels'
import { maskIdentifier } from '../utils/identifiers'
import { presentRate } from '../utils/presentation'
import { shamsi, formatAmount } from '../utils/remittance'
import useDialog from '../hooks/useDialog'
import useLanguage from '../hooks/useLanguage'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FaChartLine, FaCoins, FaDollarSign, FaEdit, FaEye, FaMoneyBillWave, FaTrashAlt, FaWhatsapp } from 'react-icons/fa'
import { Tooltip } from 'react-tooltip'
import { deleteTransaction, getCustomer, getCustomerTransactions } from '../api'
import { formatDecimal } from '../utils/format'
import NewTransaction from './NewTransaction'

const card = 'rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900'
const iconButton = 'inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'

export default function CustomerDetail() {
  const { ui } = useLanguage();
  const { id } = useParams()
  const navigate = useNavigate()
  const [linkedAccounts,setLinkedAccounts]=useState([])
  useEffect(()=>{const token=sessionStorage.getItem('app_token');if(token)fetch('/api/ledger/accounts/',{headers:{Authorization:`Token ${token}`}}).then(r=>r.ok?r.json():{results:[]}).then(data=>setLinkedAccounts((data.results||[]).filter(a=>String(a.customer)===id))).catch(()=>{})},[id])
  const [customer, setCustomer] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [sharingId, setSharingId] = useState(null)
  const dialogRef = useDialog(Boolean(viewing), () => setViewing(null))

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [customerData, transactionData] = await Promise.all([getCustomer(id), getCustomerTransactions(id)])
      setCustomer(customerData); setTransactions(transactionData.transactions || [])
    } catch { setError("دریافت اطلاعات مشتری انجام نشد. لطفاً صفحه را تازه کنید.") }
    finally { setLoading(false) }
  }, [id])
  useEffect(() => { refresh() }, [refresh])

  async function remove(transaction) {
    if (!window.confirm(ui("معاملهٔ شمارهٔ {0} حذف شود؟", {0: transaction.voucher_number}))) return
    try { await deleteTransaction(transaction.id); await refresh() }
    catch { setError("حذف معامله انجام نشد. دوباره تلاش کنید.") }
  }

  async function share(transaction) {
    setSharingId(transaction.id); setError('')
    const whatsappWindow = window.open('about:blank', '_blank')
    try {
      const { downloadAndOpenWhatsApp } = await import('../utils/pdfGenerator')
      await downloadAndOpenWhatsApp(transaction, whatsappWindow)
    }
    catch { whatsappWindow?.close(); setError("ساخت PDF انجام نشد. دوباره تلاش کنید.") }
    finally { setSharingId(null) }
  }

  const summaries = [
    { title: ui("مجموع تومان"), value: customer?.total_toman, icon: FaMoneyBillWave, accent: 'text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-950/70' },
    { title: ui("مجموع دالر"), value: customer?.total_usd, icon: FaDollarSign, accent: 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/60' },
    { title: ui("مجموع افغانی"), value: customer?.total_afghani, icon: FaCoins, accent: 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/60' },
    { title: ui("نرخ مؤثر افغانی برای یک تومان"), value: customer?.total_profit, icon: FaChartLine, accent: 'text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/60' },
  ]
  if (loading && !customer) return <main className="mx-auto max-w-7xl px-4 py-12 text-gray-500">{ui("در حال بارگذاری اطلاعات مشتری…")}</main>
  if (error && !customer) return <main className="mx-auto max-w-7xl px-4 py-12 text-red-600">{error}<button type="button" onClick={() => navigate('/')} className="mr-4 underline">{ui("بازگشت")}</button></main>

  return <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 text-start">
    <div className="ui-page-heading" data-tone="customers"><div><button type="button" onClick={() => navigate('/tehran-remittances')} className="mb-3 text-sm font-medium text-blue-700 hover:underline dark:text-blue-300">{ui('بازگشت به دریافتی و حواله به تهران')}</button><p className="text-sm text-gray-500 dark:text-gray-400">{ui("پروندهٔ مشتری")}</p><h1 className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{customer?.name}</h1>{customer?.phone && <p dir="ltr" className="mt-1 w-fit text-sm text-gray-500 dark:text-gray-400">{customer.phone}</p>}</div><button type="button" onClick={() => navigate(`/transactions/new?customer=${customer.id}`)} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">{ui("+ معاملهٔ جدید برای این مشتری")}</button></div>
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{ui(error)}</p>}
    {customer?.currency_totals?.length>0&&<section className={`${card} flex flex-wrap gap-5 p-5`}><h2>گردش مبلغ مبدأ به تفکیک واحد</h2>{customer.currency_totals.map(row=><p key={row.source_currency}>{formatAmount(row.amount)} {row.source_currency}</p>)}</section>}
    {linkedAccounts.length>0&&<section className={`${card} p-5`}><h2>حساب‌های مشتری به تفکیک واحد پول</h2>{linkedAccounts.map(a=><div key={a.id} className="my-3"><Link className="text-blue-700 underline" to={`/financial-accounts/${a.id}`}>{a.name} — {accountLabels[a.kind]}</Link>{a.balances.map(b=><span className="ms-4" key={b.currency_id+b.bucket}>{formatAmount(b.amount)} {b.currency_id} ({bucketLabel(b.bucket)})</span>)}</div>)}</section>}
    <section className={`${card} overflow-hidden`}><div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800"><h2 className="font-semibold text-gray-900 dark:text-white">{ui("تمام معاملات مشتری")}</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{transactions.length} {ui("معامله")}</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1800px] text-start text-sm"><thead className="bg-gray-50 dark:bg-gray-800"><tr>{['نمبر حواله','تاریخ شمسی','فرستنده','گیرنده','مقدار مبدأ','نرخ مبدأ برای یک دالر','مقدار دالر','نرخ مقصد برای یک دالر','خالص مقصد','نرخ مؤثر مقصد / مبدأ','تومان به حروف','مرجع مصرف','شماره کارت بانکی (گیرنده)','نام صاحب کارت','شماره کارت بانکی واریزکننده','توضیح','عملیات'].map(label=><th key={label} className="whitespace-nowrap px-4 py-3">{ui(label)}</th>)}</tr></thead><tbody>{transactions.map(t=><tr key={t.id} className="border-t dark:border-gray-800">{[t.voucher_number,shamsi(t.date),t.sender_name,t.receiver_name,...['toman_amount','toman_rate','usd_amount','afghani_rate','destination_amount','toman_profit'].map(key=>['toman_rate','afghani_rate'].includes(key)?`${presentRate(t[key],'USD',key==='toman_rate'?(t.source_currency||'TOMAN'):(t.destination_currency||'AFN')).value} ${presentRate(t[key],'USD',key==='toman_rate'?(t.source_currency||'TOMAN'):(t.destination_currency||'AFN')).unit}`:key==='toman_amount'?`${formatAmount(t[key])} ${t.source_currency||'TOMAN'}`:key==='destination_amount'?`${formatAmount(t.destination_amount??(t.destination_currency?t.afghani_amount:null))} ${t.destination_currency||''}`:formatAmount(t[key])),t.toman_in_words,t.expense || '—',maskIdentifier(t.bank_account),t.depositor_cardholder,maskIdentifier(t.depositor_card),t.description].map((value,index)=><td key={index} className="px-4 py-3">{value||'—'}</td>)}<td className="px-4 py-3"><div className="flex gap-2"><button type="button" className={iconButton} aria-label={ui('مشاهده معامله')} onClick={()=>setViewing(t)}><FaEye/></button><button type="button" className={iconButton} aria-label={ui('ویرایش معامله')} onClick={()=>setEditing(t)}><FaEdit/></button><button type="button" className={iconButton} aria-label={ui('حذف معامله')} onClick={()=>remove(t)}><FaTrashAlt/></button><button type="button" className={iconButton} disabled={sharingId===t.id} aria-label={ui('ارسال به واتساپ')} onClick={()=>share(t)}><FaWhatsapp/></button></div></td></tr>)}{!transactions.length&&<tr><td colSpan={17} className="p-8 text-center">{ui('برای این مشتری معامله‌ای ثبت نشده است.')}</td></tr>}</tbody></table></div></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summaries.map(({ title, value, icon: Icon, accent }) => <div key={title} className={`${card} p-4`}><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p><span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent}`}><Icon className="h-5 w-5" aria-hidden="true" /></span></div><p dir="ltr" className="mt-3 text-xl font-bold tabular-nums text-gray-900 dark:text-white">{formatDecimal(value)}</p></div>)}</section>
    <Tooltip id="transaction-actions" place="top" />
    {viewing && <div className="fixed inset-0 z-40 flex items-center justify-center bg-gray-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewing(null) }}><section ref={dialogRef} role="dialog" aria-modal="true" aria-label={ui("مشاهده معامله")} tabIndex={-1} className="w-full max-w-xl space-y-5 rounded-2xl border border-gray-200 bg-white p-6 text-start shadow-2xl dark:border-gray-800 dark:bg-gray-900"><div className="flex items-center justify-between"><h2 className="text-xl font-bold text-gray-900 dark:text-white">{ui("جزئیات حوالهٔ")} {viewing.voucher_number}</h2><button type="button" onClick={() => setViewing(null)} aria-label={ui("بستن")} className="rounded-lg px-2 py-1 text-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">×</button></div><div className="grid grid-cols-2 gap-3 text-sm">{[[ui("تاریخ"), shamsi(viewing.date)], [ui("فرستنده"), viewing.sender_name || customer.name], [ui("گیرنده"), viewing.receiver_name || customer.name], [ui("شماره کارت بانکی (گیرنده)"), maskIdentifier(viewing.bank_account)], [ui("مبلغ تومان"), formatDecimal(viewing.toman_amount)], [ui("مقدار دالر"), formatDecimal(viewing.usd_amount)], [ui("مقدار افغانی"), formatDecimal(viewing.afghani_amount)], [ui("نرخ مؤثر AFN/TOMAN"), formatAmount(viewing.toman_profit)], [ui("نرخ تومان"), formatDecimal(viewing.toman_rate)], [ui("نرخ افغانی به دالر"), formatDecimal(viewing.afghani_rate)], [ui("تومان به حروف"), viewing.toman_in_words || "—"], [ui("مرجع مصرف"), viewing.expense || '—'],[ui('نام صاحب کارت'),viewing.depositor_cardholder||'—'],[ui('شماره کارت بانکی واریزکننده'),maskIdentifier(viewing.depositor_card)]].map(([name, value], index) => <div key={name} className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800"><span className="block text-gray-500 dark:text-gray-400">{name}</span><span dir={index > 3 ? 'ltr' : 'auto'} className="mt-1 block font-medium text-gray-900 dark:text-white">{value}</span></div>)}</div>{viewing.description && <p className="rounded-lg bg-gray-50 p-3 text-sm leading-6 text-gray-700 dark:bg-gray-800 dark:text-gray-200">{viewing.description}</p>}<div className="flex justify-end gap-2"><button type="button" disabled={sharingId === viewing.id} onClick={() => share(viewing)} className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white">{ui("ارسال به واتساپ")}</button><button type="button" onClick={() => { setEditing(viewing); setViewing(null) }} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">{ui("ویرایش معامله")}</button></div></section></div>}
    {editing && <NewTransaction modal transaction={editing} customerIdOverride={customer?.id} onClose={() => setEditing(null)} onSaved={() => refresh()} />}
  </main>
}

