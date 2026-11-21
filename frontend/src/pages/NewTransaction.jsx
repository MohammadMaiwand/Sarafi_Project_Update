import { validateTehranForm } from '../utils/tehranValidation'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Modal } from '../components/FinanceUI'
import useLanguage from '../hooks/useLanguage'
import { createTransaction, getCustomer, getCustomerTransactions, getCustomers, getNextVoucherNumber, updateTransaction } from '../api'
import { formatNumber } from '../utils/format'
import { isoDate, shamsi, groupExact, parseAmount } from '../utils/remittance'
import { calculateTehranTransaction, transactionAmount } from '../utils/tehranTransaction'

const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kabul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const emptyForm = () => ({ date: localToday(), voucher_number: '', customer_name: '', customer_phone: '', sender_name: '', receiver_name: '', toman_amount: '0', toman_rate: '0', afghani_rate: '0', description: '', bank_account: '', toman_in_words: '', expense: '', transaction_kind:'REMITTANCE', source_currency:'TOMAN', destination_currency:'AFN', destination_rate:'', fee_amount:'0', fee_currency:'AFN', fee_collection:'SEPARATE', sender_father_name:'', depositor_cardholder:'', depositor_card:'', purpose_reference:'' })
const numericFields = ['toman_amount', 'toman_rate', 'afghani_rate', 'destination_rate', 'fee_amount']
const groupInput = value => {
  if (!/^\d*(\.\d*)?$/.test(String(value ?? ''))) return String(value ?? '')
  const [whole, fraction] = String(value ?? '').split('.')
  return `${whole ? groupExact(whole) : ''}${fraction !== undefined ? `.${fraction}` : ''}`
}
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300'
const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-gray-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 dark:border-gray-700 dark:bg-gray-950 dark:text-white'

export default function NewTransaction({ modal = false, transaction = null, customerIdOverride, onClose, onSaved }) {
  const { ui, isRTL } = useLanguage()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const contextCustomerId = customerIdOverride || searchParams.get('customer') || transaction?.customer?.id || ''
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [availableCustomers, setAvailableCustomers] = useState([])
  const customerId = contextCustomerId || selectedCustomerId
  const [customer, setCustomer] = useState(transaction?.customer || null)
  const [form, setForm] = useState(() => ({ ...emptyForm(), ...transaction, afghani_rate:transaction?.destination_rate ?? transaction?.afghani_rate ?? '0' }))
  const [dateText, setDateText] = useState(() => shamsi(transaction?.date || localToday()))
  const [requestKey]=useState(()=>crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(!transaction)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState({})
  const [attempted, setAttempted] = useState(false)
  const [serverErrors, setServerErrors] = useState({})
  const validation = validateTehranForm(form, dateText, customerId)
  const errors = {...validation, ...Object.fromEntries(Object.entries(serverErrors).filter(([,value])=>value))}
  const showError = name => (attempted || touched[name]) && errors[name]
  const fieldStyle = name => `${inputClass} ${showError(name) ? '!border-red-500 !bg-red-50 focus:!border-red-500 focus:!ring-red-500/20 dark:!border-red-400 dark:!bg-red-950/30' : ''}`
  const errorHint = name => showError(name) ? <p id={`${name}-error`} className="mt-1 text-sm text-red-600 dark:text-red-400">{ui(errors[name])}</p> : null
  const isEdit = Boolean(transaction)
  // New Tehran remittances always use TOMAN to AFN with no fee.
  // Keep existing transaction metadata available when editing saved records.
  const simplifiedTehranForm = !isEdit

  useEffect(() => {
    if (contextCustomerId) return
    let active = true
    getCustomers().then(data => { if (active) setAvailableCustomers(data.customers || []) })
      .catch(() => { if (active) setError('بارگذاری فهرست مشتریان انجام نشد.') })
    return () => { active = false }
  }, [contextCustomerId])

  useEffect(() => {
    let active = true
    const tasks = []
    if (customerId && !transaction?.customer) {
      tasks.push(Promise.all([getCustomer(customerId), getCustomerTransactions(customerId)]).then(([data, history]) => {
        if (!active) return
        setCustomer(data)
        const previous = history.transactions?.[0]
        setForm(current => ({ ...current, sender_name: previous?.sender_name || data.name, receiver_name: previous?.receiver_name || '', bank_account: previous?.bank_account || '' }))
      }))
    }
    if (!transaction) {
      tasks.push(getNextVoucherNumber().then(data => {
        // A late response must not replace a number the user already entered manually.
        if (active) setForm(current => ({ ...current, voucher_number: current.voucher_number || data.next_voucher }))
      }))
    }
    Promise.all(tasks)
      .catch(() => { if (active) setError('بارگذاری مشتری یا شماره حواله انجام نشد.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [customerId, transaction])

  const calculated = useMemo(() => calculateTehranTransaction(form), [form])

  function change(event) {
    const { name, value } = event.currentTarget
    setServerErrors(current=>({...current,[name]:undefined}))
    if (numericFields.includes(name)) {
      const raw = parseAmount(value)
      const element = event.currentTarget
      const digitsAfter = parseAmount(value.slice(element.selectionStart)).length
      setForm(current => ({ ...current, [name]: raw }))
      requestAnimationFrame(() => {
        if (document.activeElement !== element) return
        let caret = element.value.length, remaining = digitsAfter
        while (caret > 0 && remaining > 0) { caret--; if (element.value[caret] !== ',') remaining-- }
        element.setSelectionRange(caret, caret)
      })
    } else {
      setForm(current => ({ ...current, [name]: value }))
    }
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setAttempted(true)
    setServerErrors({})
    const invalid = validateTehranForm(form, dateText, customerId)
    if (Object.keys(invalid).length) {
      setError('خانه‌های سرخ را اصلاح کنید؛ معامله هنوز ذخیره نشده است.')
      requestAnimationFrame(()=>event.target.querySelector('[aria-invalid="true"]')?.focus())
      return
    }
    const date = isoDate(dateText)
    setBusy(true)
    const payload = {
      ...(!isEdit?{request_key:requestKey}:{}),
      ...(customerId ? { customer_id: Number(customerId) } : { customer_name: form.customer_name.trim(), customer_phone: form.customer_phone.trim() }),
      transaction_kind:simplifiedTehranForm?'REMITTANCE':form.transaction_kind,
      source_currency:simplifiedTehranForm?'TOMAN':form.source_currency,
      destination_currency:simplifiedTehranForm?'AFN':form.destination_currency,
      destination_rate:simplifiedTehranForm?parseAmount(form.afghani_rate):form.destination_currency&&form.destination_currency!=='USD'?parseAmount(form.afghani_rate):null,
      fee_amount:simplifiedTehranForm?'0.000':transactionAmount(form.fee_amount),
      fee_currency:simplifiedTehranForm?'AFN':form.fee_currency,
      fee_collection:simplifiedTehranForm?'SEPARATE':form.fee_collection,
      sender_father_name:form.sender_father_name,
      depositor_cardholder:simplifiedTehranForm?'':form.depositor_cardholder,
      depositor_card:simplifiedTehranForm?'':form.depositor_card,
      purpose_reference:simplifiedTehranForm?'':form.purpose_reference,
      date, voucher_number: form.voucher_number.trim(),
      sender_name: form.sender_name.trim(), receiver_name: form.receiver_name.trim(),
      toman_amount: transactionAmount(form.toman_amount), toman_rate: parseAmount(form.toman_rate),
      expense: simplifiedTehranForm?'':String(form.expense || '').trim(), toman_in_words: form.toman_in_words,
      afghani_rate: parseAmount(form.afghani_rate||0), description: form.description, bank_account: simplifiedTehranForm?'':form.bank_account,
    }
    try {
      const saved = isEdit ? await updateTransaction(transaction.id, payload) : await createTransaction(payload)
      window.dispatchEvent(new Event('finance-updated'))
      if (onSaved) await onSaved(saved)
      if (onClose) onClose()
      else navigate(`/customer/${saved.customer.id}`)
    } catch (exception) {
      const fields = Object.fromEntries(Object.entries(exception.fields || {}).filter(([key])=>key in form || key === 'date' || key === 'customer_id').map(([key,value])=>[key,Array.isArray(value)?value.join('، '):String(value)]))
      if (fields.voucher_number) fields.voucher_number = 'این نمبر حواله قبلاً استفاده شده است. نمبر دیگری وارد کنید.'
      setServerErrors(fields)
      setError(Object.keys(fields).length ? 'خانه‌های سرخ را اصلاح کنید.' : exception.status >= 500 ? 'سرور نتوانست معامله را ثبت کند. لطفاً دوباره تلاش کنید.' : exception.message === 'network' ? 'اتصال با سرور برقرار نشد.' : exception.message)
      requestAnimationFrame(()=>event.target.querySelector('[aria-invalid="true"]')?.focus())
    } finally { setBusy(false) }
  }

  function field(name, id, title, { type = 'text', required = false, numeric = false, maxLength = 200 } = {}) {
    return <div className="min-w-0">
      <label className={labelClass} htmlFor={id}>{ui(title)}{required && <span aria-hidden="true" className="ms-1 text-red-600">*</span>}</label>
      <input id={id} name={name} type={type} required={required} maxLength={maxLength}
        dir={numeric || ['date', 'voucher_number', 'bank_account'].includes(name) ? 'ltr' : undefined}
        inputMode={numeric ? 'decimal' : undefined} pattern={undefined}
        value={numeric ? groupInput(form[name]) : form[name] || ''} onChange={change} onBlur={()=>setTouched(current=>({...current,[name]:true}))} aria-invalid={Boolean(showError(name))} aria-describedby={showError(name)?`${name}-error`:undefined} className={fieldStyle(name)}/>{errorHint(name)}
    </div>
  }
  function result(id, name, title, value) {
    return <div className="min-w-0">
      <label className={labelClass} htmlFor={id}>{ui(title)}</label>
      <input id={id} name={name} type="text" readOnly aria-readonly="true" tabIndex={-1} dir="ltr"
        value={formatNumber(value, name === 'toman_profit' ? 9 : 3)} className={`${inputClass} !bg-slate-50 font-semibold tabular-nums dark:!bg-gray-800`}/>
    </div>
  }

  const content = <form noValidate onSubmit={submit} dir={isRTL ? 'rtl' : 'ltr'} className="space-y-5">
    {!contextCustomerId && <section className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/30" aria-label={ui('معلومات مشتری')}>
      <div><label className={labelClass} htmlFor="transaction-customer">{ui('انتخاب مشتری')}</label>
        <select id="transaction-customer" className={inputClass} value={selectedCustomerId} onChange={event => setSelectedCustomerId(event.target.value)}>
          <option value="">{ui('مشتری جدید')}</option>
          {availableCustomers.map(item => <option key={item.id} value={item.id}>{item.name}{item.phone ? ` — ${item.phone}` : ''}</option>)}
        </select>
      </div>
      {!selectedCustomerId && <><p className="text-xs text-gray-500 dark:text-gray-400">{ui('مشتری و حواله با همین دکمه ذخیره، یکجا ثبت می‌شوند.')}</p><div className="grid gap-4 sm:grid-cols-2">
        {field('customer_name', 'new-customer-name', 'نام مشتری', { required: true })}
        {field('customer_phone', 'new-customer-phone', 'شماره تماس', { maxLength: 40 })}
      </div></>}
    </section>}
    {customer && customerId && <p className="rounded-lg border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
      {ui('مشتری:')} <strong>{customer.name}</strong>{customer.phone && <span dir="ltr" className="ms-2 inline-block">({customer.phone})</span>}
    </p>}
    {loading && <p role="status" className="text-sm text-gray-500">{ui('در حال بارگذاری…')}</p>}
    <div data-transaction-row="1" className="grid gap-4 sm:grid-cols-2">
      <div><label className={labelClass} htmlFor="transaction-date">{ui('تاریخ شمسی')}</label><input id="transaction-date" required dir="ltr" placeholder="1405/08/15" value={dateText} onChange={event=>{setDateText(event.target.value);setServerErrors(current=>({...current,date:undefined}))}} onBlur={()=>setTouched(current=>({...current,date:true}))} aria-invalid={Boolean(showError('date'))} aria-describedby={showError('date')?'date-error':undefined} className={fieldStyle('date')}/>{errorHint('date')}</div>
      {field('voucher_number', 'voucher-number', 'شمارهٔ حواله', { required: true, maxLength: 40 })}
    </div>
    <div data-transaction-row="2" className="grid gap-4 sm:grid-cols-2">
      {field('sender_name', 'sender-name', 'نام فرستنده')}
      {field('sender_father_name','sender-father','نام پدر فرستنده')}
      {field('receiver_name', 'receiver-name', 'نام گیرنده')}
    </div>
    {!simplifiedTehranForm && <div className="grid gap-4 sm:grid-cols-2"><div><label className={labelClass}>نوع معامله</label><select className={inputClass} name="transaction_kind" value={form.transaction_kind} onChange={change}><option value="RECEIPT">دریافتی پول تهران</option><option value="REMITTANCE">حواله تهران</option></select></div>{[['source_currency','واحد مبدأ'],['destination_currency','تبدیل مقصد؛ اختیاری'],['fee_currency','واحد فیس']].map(([key,label])=><div key={key}><label className={labelClass}>{label}</label><select className={inputClass} name={key} value={form[key]} onChange={change}>{key==='destination_currency'&&<option value="">بدون مرحله مقصد</option>}{['TOMAN','USD','AFN','EUR','TRY','PKR'].map(c=><option key={c}>{c}</option>)}</select></div>)}</div>}
    <section className="space-y-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800" aria-label={ui('محاسبهٔ ارز')}>
      <div data-transaction-row="3" className="grid gap-4 sm:grid-cols-2">
        {field('toman_amount', 'toman-amount', `مبلغ ${form.source_currency}`, { numeric: true, required: true })}
        {form.source_currency==='USD'?result('source-usd-rate','source-usd-rate','USD / USD','1'):field('toman_rate', 'toman-rate', `${form.source_currency} برای یک دالر`, { numeric: true, required: true })}
      </div>
      <p className="text-xs leading-6 text-gray-500">{ui('دالر = تومان ÷ نرخ تومان به دالر؛ افغانی = دالر × نرخ افغانی؛ نرخ مؤثر AFN/TOMAN = افغانی ÷ تومان. مثال: 1,000,000 ÷ 225 × 64.5 = 286,666.667 افغانی. نرخ 225.000 یعنی 225؛ نرخ 225,000 یعنی دوصد و بیست‌وپنج هزار.')}</p><div data-transaction-row="4">{result('usd-amount', 'usd_amount', 'مقدار دالر', calculated.usd)}</div>
      <div data-transaction-row="5" className="grid gap-4 sm:grid-cols-2">
        {form.destination_currency&&form.destination_currency!=='USD'&&field('afghani_rate', 'afghani-rate', `${form.destination_currency} برای یک دالر`, { numeric: true, required: true })}
      </div>
      <div data-transaction-row="6">{result('afghani-amount', 'afghani_amount', `خالص مقصد ${form.destination_currency||'—'}`, calculated.afghani)}</div>
    </section>
    <div data-transaction-row="7" className="grid gap-4 sm:grid-cols-2">
      <div><label className={labelClass} htmlFor="transaction-description">{ui('توضیحات')}</label><textarea id="transaction-description" name="description" rows={3} value={form.description || ''} onChange={change} className={inputClass}/></div>
      {field('toman_in_words', 'toman-in-words', 'تومان به حروف', {maxLength:1000})}
      {!simplifiedTehranForm&&<>
        {field('bank_account', 'bank-account', 'شماره کارت بانکی (گیرنده)')}
        {field('depositor_cardholder','depositor-name','نام صاحب کارت')}
        {field('depositor_card','depositor-card','شماره کارت بانکی واریزکننده')}
        {field('purpose_reference','purpose-reference','مرجع مصرف پول',{maxLength:1000})}
        {field('fee_amount','fee-amount','فیس',{numeric:true})}
        <div><label className={labelClass}>روش دریافت فیس</label><select className={inputClass} name="fee_collection" value={form.fee_collection} onChange={change}><option value="SEPARATE">جداگانه</option><option value="DEDUCTED">کسر از مقصد</option></select></div>
        <div><label className={labelClass} htmlFor="transaction-expense">{ui('مرجع مصرف')}</label><textarea id="transaction-expense" name="expense" rows={3} placeholder={ui('توضیح مصرف را بنویسید')} value={form.expense || ''} onChange={change} className={inputClass}/></div>
      </>}
    </div>
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{ui(error)}</p>}
    <footer className="flex flex-wrap gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
      <button type="submit" aria-busy={busy} disabled={busy || loading} className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">{ui(busy ? 'در حال ذخیره…' : 'ذخیره')}</button>
      <button type="button" onClick={onClose || (() => navigate(customerId ? `/customer/${customerId}` : '/tehran-remittances'))} className="rounded-lg border border-gray-300 bg-gray-100 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">{ui('بازگشت به لیست')}</button>
    </footer>
  </form>

  if (modal) return <Modal title={ui(isEdit ? 'ویرایش حواله تهران' : 'ثبت حواله تهران')} onClose={onClose} width="max-w-4xl">{content}</Modal>
  return <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 text-start">
    <div className="ui-page-heading"><div><p className="text-sm font-medium text-blue-700 dark:text-blue-300">{ui('دریافتی و حواله به تهران')}</p><h1 className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{ui('ثبت حواله تهران')}</h1></div></div>
    <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-7">{content}</section>
  </main>
}
