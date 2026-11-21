import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FaBan, FaCheck, FaEdit, FaEye, FaHandHoldingUsd, FaPlus, FaSyncAlt } from 'react-icons/fa'
import useLanguage from '../hooks/useLanguage'
import { API_BASE } from '../api'
import { authHeaders, handleAuthResponse } from '../utils/authSession'
import { BackButton, FinancePage, FormField, Modal, StatCard, TableShell, fieldClass, primaryButton, secondaryButton, surface } from '../components/FinanceUI'
import { AfghanDateInput } from '../components/AfghanDate'
import { ledgerConversion } from '../utils/ledgerMath'
import { businessToday } from '../utils/calendar'
import { presentNumber } from '../utils/presentation'
import { parseAmount, shamsi } from '../utils/remittance'
import { LedgerForm } from './LedgerPage'

const CURRENCIES = ['AFN', 'USD', 'TOMAN', 'EUR', 'TRY', 'PKR']
const SOURCES = { LEDGER: 'دفتر مالی', COLLEAGUE: 'همکاران', DEPOSIT: 'امانت مشتریان', DEBTOR: 'بدهکاران' }
const KINDS = { CREDITOR: 'طلبکار', COLLEAGUE: 'همکار', CASH: 'امانت نقدی', TERM: 'امانت قراردادی', AGENCY: 'نمایندگی', DEPOSIT: 'امانت مشتری', SMALL: 'بدهکار عادی', LARGE: 'بدهکار معاملات بزرگ' }

async function api(path, data, method) {
  const response = await fetch(`${API_BASE}${path}`, { method: method || (data ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...authHeaders() }, ...(data ? { body: JSON.stringify(data) } : {}) })
  handleAuthResponse(response)
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    if (!result) throw new Error(response.status === 404 ? 'سرویس طلبکاران در سرور یافت نشد؛ لطفاً سرور را بازراه‌اندازی کنید.' : 'پاسخ سرور معتبر نیست.')
    const error = new Error(response.status === 401 ? 'برای دسترسی امن، خارج شوید و دوباره وارد شوید.' : Object.entries(result).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('، ') : v}`).join('؛ '))
    error.fields = result
    throw error
  }
  return result
}

function PayableTypes({ payables }) {
  const { ui } = useLanguage()
  if (!payables?.length) return <span className="text-gray-400">—</span>
  return <div className="flex flex-wrap gap-1.5">{payables.map((row, index) => <span key={`${row.bucket}-${row.currency}-${index}`} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">{ui(row.label || row.bucket)}</span>)}</div>
}

function PayableAmounts({ payables }) {
  if (!payables?.length) return <span className="text-gray-400">—</span>
  return <div className="flex flex-wrap gap-2">{payables.map((row, index) => <span key={`${row.currency}-${row.bucket}-${index}`} className="inline-flex items-baseline gap-1.5 whitespace-nowrap rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"><b dir="ltr" className="text-base tabular-nums">{presentNumber(row.amount)}</b><span className="text-xs font-bold">{row.currency}</span></span>)}</div>
}

function creditorSection(row) {
  if (row.source === 'LEDGER') {
    const section = { CREDITOR: 'حساب طلبکار دفتر مالی', AGENCY: 'حساب نمایندگی در دفتر مالی', COLLEAGUE: 'حساب همکار در دفتر مالی', CASH: 'امانت نقدی دفتر مالی', TERM: 'امانت قراردادی دفتر مالی' }
    return section[row.kind] || 'دفتر مالی'
  }
  if (row.source === 'COLLEAGUE') return 'معاملات بخش همکاران'
  if (row.source === 'DEPOSIT') return 'ثبت امانت در بخش امانت مشتریان'
  if (row.source === 'DEBTOR') return 'مانده بستانکاری مشتری در بخش بدهکاران'
  return SOURCES[row.source] || row.source
}

function ErrorAlert({ error }) {
  if (!error) return null
  return <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error.message}</p>
}

function CreditorsListPage() {
  const { ui } = useLanguage(), navigate = useNavigate(), client = useQueryClient()
  const [source, setSource] = useState('')
  const [create, setCreate] = useState(false)
  const query = useQuery({ queryKey: ['creditors', source], queryFn: () => api(`/creditors/${source ? `?source=${source}` : ''}`) })
  const options = useQuery({ queryKey: ['ledger-options'], queryFn: () => api('/ledger/options/'), enabled: create })
  const rows = query.data?.results || []
  const summary = query.data?.summary
  const open = (row) => navigate(row.detail_url)
  return <FinancePage title="طلبکاران" subtitle="تمام کسانی که دفتر به آن‌ها بدهکار است؛ از دفتر مالی، همکاران، امانت مشتریان و بدهکاران." icon={FaHandHoldingUsd}
    action={<div className="flex flex-wrap gap-2"><button className={primaryButton} onClick={() => setCreate(true)}><FaPlus aria-hidden="true" /> {ui('طلبکار جدید')}</button><button className={secondaryButton} onClick={() => query.refetch()}><FaSyncAlt aria-hidden="true" /> {ui('تازه‌سازی')}</button></div>}>
    <nav aria-label={ui('منبع طلبکار')} className="flex flex-wrap gap-2">
      {[['', 'همه'], ...Object.entries(SOURCES)].map(([value, label]) => <button key={value || 'ALL'} aria-pressed={source === value} className={source === value ? primaryButton : secondaryButton} onClick={() => setSource(value)}>{ui(label)}</button>)}
    </nav>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="تعداد افراد/حساب‌های طلبکار" value={presentNumber(summary?.count || 0)} />
      {(summary?.totals || []).map((total) => <StatCard key={`${total.source}-${total.currency}`} label={`${SOURCES[total.source] || total.source} · ${total.currency}`} value={presentNumber(total.amount)} suffix={` ${total.currency}`} accent="rose" />)}
    </div>
    <ErrorAlert error={query.error} />
    {query.isFetching && <p role="status" className="text-sm text-gray-500">{ui('در حال بارگذاری…')}</p>}
    <section className={surface}>
      <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <h2 className="font-bold text-gray-900 dark:text-white">{ui('فهرست تفصیلی طلبکاران')}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{ui('هر ردیف یک شخص یا حساب است؛ بخش ثبت بدهی، نوع تعهد و ماندهٔ هر واحد پول جداگانه نمایش داده می‌شود.')}</p>
      </div>
      <TableShell loading={query.isPending} emptyTitle="طلبکاری یافت نشد" headers={['نام و شماره تماس', 'بخش ثبت بدهی', 'نوع تعهد', 'ماندهٔ قابل پرداخت', 'وضعیت', 'حساب']}
        rows={rows.map((row) => <tr key={`${row.source}-${row.ref_id}`} className="align-middle transition-colors hover:bg-blue-50/60 dark:hover:bg-gray-800/70">
          <td className="min-w-44 p-4">
            <p className="font-bold text-gray-900 dark:text-white">{row.name}</p>
            <p className="mt-1 text-xs text-gray-500" dir="ltr">{row.phone || 'شماره تماس ثبت نشده'}</p>
          </td>
          <td className="min-w-52 p-4">
            <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800 dark:bg-blue-950/50 dark:text-blue-200">{ui(SOURCES[row.source] || row.source)}</span>
            <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-300">{ui(creditorSection(row))}</p>
          </td>
          <td className="min-w-48 p-4"><PayableTypes payables={row.payables} /><p className="mt-2 text-xs text-gray-500">{ui(KINDS[row.kind] || row.kind)}</p></td>
          <td className="min-w-56 p-4"><PayableAmounts payables={row.payables} /></td>
          <td className="p-4">{row.active === false ? <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">{ui('غیرفعال')}</span> : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">{ui('فعال')}</span>}</td>
          <td className="p-4"><button type="button" className={secondaryButton} onClick={() => open(row)}><FaEye aria-hidden="true" /> {ui('مشاهدهٔ حساب')}</button></td>
        </tr>)} />
    </section>
    {create && options.data && <LedgerForm mode="account" defaultKind="CREDITOR" accounts={[]} customers={[]} agencies={[]} options={options.data} onClose={() => setCreate(false)} onSaved={async () => { setCreate(false); await client.invalidateQueries({ queryKey: ['creditors'] }) }} />}
  </FinancePage>
}

function CreditorPaymentModal({ account, onClose, onSaved }) {
  const { ui } = useLanguage()
  const [form, setForm] = useState({ currency: 'AFN', amount: '', destination: '', source_rate: '', destination_rate: '', fee: '0', fee_currency: 'AFN', collection: 'SEPARATE', date: businessToday(), note: '' })
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const preview = ledgerConversion(form)
  const conversionNeeded = Boolean(form.destination)
  const valid = form.amount && Number(parseAmount(form.amount)) > 0 && (!conversionNeeded || (form.source_rate && form.destination_rate && preview))
  const balances = account.balances || []
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const payload = { request_key: crypto.randomUUID(), date: form.date, currency: form.currency, amount: parseAmount(form.amount), details: form.note ? { notes: form.note } : {} }
      if (form.destination) { payload.destination = form.destination; payload.source_rate = parseAmount(form.source_rate); payload.destination_rate = parseAmount(form.destination_rate) }
      if (form.fee && form.fee !== '0') { payload.fee = parseAmount(form.fee); payload.fee_currency = form.fee_currency; payload.collection = form.collection }
      await api(`/creditors/${account.id}/payments/`, payload)
      await onSaved()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <Modal title="ثبت پرداخت به طلبکار" subtitle="نوع پول، نرخ و مقدار همه دستی وارد می‌شوند و از قرض این حساب کم می‌شوند." onClose={onClose}>
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="واحد پول پرداخت" id="pay-currency"><select id="pay-currency" className={fieldClass} value={form.currency} onChange={(e) => set('currency', e.target.value)}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></FormField>
        <FormField label="مقدار پرداخت" id="pay-amount"><input id="pay-amount" className={fieldClass} dir="ltr" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></FormField>
        <FormField label="تاریخ شمسی" id="pay-date"><AfghanDateInput required className={fieldClass} value={form.date} onChange={(e) => set('date', e.target.value)} /></FormField>
        <FormField label="تبدیل مقصد؛ اختیاری" id="pay-destination" hint="اگر پر شود، پرداخت در واحد مقصد ثبت می‌شود."><select id="pay-destination" className={fieldClass} value={form.destination} onChange={(e) => set('destination', e.target.value)}><option value="">بدون تبدیل</option>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></FormField>
        {conversionNeeded && <><FormField label={`${form.currency} برای یک دالر؛ نرخ دستی`} id="pay-source-rate"><input id="pay-source-rate" className={fieldClass} dir="ltr" value={form.source_rate} onChange={(e) => set('source_rate', e.target.value)} /></FormField><FormField label={`${form.destination} برای یک دالر؛ نرخ دستی`} id="pay-destination-rate"><input id="pay-destination-rate" className={fieldClass} dir="ltr" value={form.destination_rate} onChange={(e) => set('destination_rate', e.target.value)} /></FormField></>}
        <FormField label="فیس؛ اختیاری" id="pay-fee"><input id="pay-fee" className={fieldClass} dir="ltr" value={form.fee} onChange={(e) => set('fee', e.target.value)} /></FormField>
        <FormField label="واحد فیس" id="pay-fee-currency"><select id="pay-fee-currency" className={fieldClass} value={form.fee_currency} onChange={(e) => set('fee_currency', e.target.value)}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></FormField>
        <FormField label="یادداشت" id="pay-note" className="sm:col-span-2"><input id="pay-note" className={fieldClass} value={form.note} onChange={(e) => set('note', e.target.value)} /></FormField>
      </div>
      <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
        <h3 className="font-bold">{ui('مانده قابل پرداخت این حساب')}</h3>
        <div className="flex flex-wrap gap-3">{balances.map((row) => <span key={row.currency_id + row.bucket} className="rounded-lg bg-white px-3 py-2 text-sm dark:bg-gray-900"><b dir="ltr">{presentNumber(row.amount)} {row.currency_id}</b></span>)}</div>
        {preview && <p className="text-sm text-gray-600 dark:text-gray-300">{ui('نتیجهٔ تبدیل دستی')}: <b dir="ltr">{presentNumber(preview.net)} {preview.destination}</b></p>}
      </section>
      <ErrorAlert error={error ? { message: error } : null} />
      <div className="flex gap-3"><button disabled={busy || !valid} className={primaryButton}>{ui('ثبت پرداخت')}</button><button type="button" className={secondaryButton} onClick={onClose}>{ui('بازگشت')}</button></div>
    </form>
  </Modal>
}

function CreditorDetailPage({ creditorId }) {
  const { ui } = useLanguage(), client = useQueryClient(), navigate = useNavigate()
  const [payment, setPayment] = useState(false), [edit, setEdit] = useState(false), [error, setError] = useState('')
  const query = useQuery({ queryKey: ['creditor', creditorId], queryFn: () => api(`/creditors/${creditorId}/`) })
  const options = useQuery({ queryKey: ['ledger-options'], queryFn: () => api('/ledger/options/') })
  const row = query.data
  const toggle = useMutation({ mutationFn: (active) => api(`/creditors/${creditorId}/`, { active, profile: {} }, 'PATCH'), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['creditor', creditorId] }); await client.invalidateQueries({ queryKey: ['creditors'] }) }, onError: (e) => setError(e.message) })
  const reverse = useMutation({ mutationFn: (doc) => api('/ledger/documents/', { request_key: crypto.randomUUID(), account: row.id, category: 'REVERSAL', date: businessToday(), currency: doc.currency, amount: doc.amount, reversal_of: doc.id, details: { reason: window.prompt(ui('دلیل برگشت یا اصلاح')) || '' } }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['creditor', creditorId] }) }, onError: (e) => setError(e.message) })
  const refreshed = async () => { setPayment(false); setEdit(false); await client.invalidateQueries({ queryKey: ['creditor', creditorId] }); await client.invalidateQueries({ queryKey: ['creditors'] }) }
  const isLedger = row?.source === 'LEDGER'
  return <FinancePage title={row ? row.name : 'حساب طلبکار'} subtitle={row ? `${KINDS[row.kind] || row.kind}` : undefined} icon={FaHandHoldingUsd}
    action={<div className="flex flex-wrap gap-2"><BackButton onClick={() => navigate('/creditors')} /><button className={secondaryButton} onClick={() => query.refetch()}><FaSyncAlt aria-hidden="true" /></button></div>}>
    <ErrorAlert error={query.error || (error ? { message: error } : null)} />
    {query.isPending && <p role="status" className="text-sm text-gray-500">{ui('در حال بارگذاری…')}</p>}
    {row && <>
      <div className="flex flex-wrap gap-2">
        {isLedger ? <>
          <button className={primaryButton} onClick={() => setPayment(true)}>{ui('پرداخت')}</button>
          <button className={secondaryButton} onClick={() => setEdit(true)}><FaEdit aria-hidden="true" /> {ui('ویرایش مشخصات')}</button>
          {row.active === false ? <button className={secondaryButton} onClick={() => toggle.mutate(true)}><FaCheck aria-hidden="true" /> {ui('فعال‌سازی')}</button> : <button className={secondaryButton} onClick={() => toggle.mutate(false)}><FaBan aria-hidden="true" /> {ui('غیرفعال‌سازی')}</button>}
        </> : <Link className={secondaryButton} to={row.detail_url}><FaEye aria-hidden="true" /> {ui('مدیریت در صفحهٔ اصلی')}</Link>}
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{(row.payables || []).map((item, index) => <StatCard key={index} label={item.label || 'قابل پرداخت'} value={presentNumber(item.amount)} suffix={` ${item.currency}`} accent="rose" />)}</section>
      <section className={`${surface} p-5`}>
        <h2 className="mb-4 font-bold">{ui('مشخصات حساب')}</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="text-gray-500">{ui('منبع')}</dt><dd>{ui(SOURCES[row.source] || row.source)}</dd></div>
          <div><dt className="text-gray-500">{ui('شماره تماس')}</dt><dd dir="ltr">{row.phone || '—'}</dd></div>
          <div><dt className="text-gray-500">{ui('وضعیت')}</dt><dd>{row.active === false ? ui('غیرفعال') : ui('فعال')}</dd></div>
          <div><dt className="text-gray-500">{ui('مانده‌های ثبت‌شده')}</dt><dd className="space-y-1">{(row.balances || []).length ? row.balances.map((b) => <p key={b.currency_id + b.bucket} dir="ltr">{presentNumber(b.amount)} {b.currency_id} — {b.bucket}</p>) : '—'}</dd></div>
        </dl>
      </section>
      {isLedger && <section className={surface}>
        <h2 className="p-5 font-bold">{ui('سندهای حساب و پرداخت‌ها')}</h2>
        <TableShell loading={false} emptyTitle="سندی برای این حساب ثبت نشده است" headers={['رسید', 'تاریخ', 'نوع', 'مبلغ', 'واحد', 'حالت', 'عملیات']}
          rows={(row.documents || []).map((doc) => <tr key={doc.id}>
            <td className="p-3" dir="ltr">{doc.number}</td>
            <td className="p-3" dir="ltr">{shamsi(doc.date)}</td>
            <td className="p-3">{doc.category}</td>
            <td className="p-3" dir="ltr">{presentNumber(doc.amount)}</td>
            <td className="p-3">{doc.currency}</td>
            <td className="p-3">{doc.reversal_of ? ui('برگشت اصلاحی') : doc.status}</td>
            <td className="p-3">{doc.reversal_of ? '—' : <button className={secondaryButton} onClick={() => reverse.mutate(doc)}>{ui('برگشت با ثبت سابقه')}</button>}</td>
          </tr>)} />
      </section>}
    </>}
    {payment && row && <CreditorPaymentModal account={row} onClose={() => setPayment(false)} onSaved={refreshed} />}
    {edit && row && options.data && <LedgerForm mode="profile" account={row} accounts={[]} customers={[]} agencies={[]} options={options.data} onClose={() => setEdit(false)} onSaved={refreshed} />}
  </FinancePage>
}

export default function CreditorsPage() {
  const { creditorId } = useParams()
  return creditorId ? <CreditorDetailPage creditorId={creditorId} /> : <CreditorsListPage />
}
