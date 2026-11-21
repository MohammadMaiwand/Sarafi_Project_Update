import { AfghanDateInput, AfghanMonthInput } from '../components/AfghanDate'
import { shamsi } from '../utils/remittance'
import { monthTitle } from '../utils/calendar'
import useLanguage from '../hooks/useLanguage'
import { useCallback, useEffect, useState } from 'react'
import { FaCoins, FaEdit, FaFileInvoiceDollar, FaPlus, FaTrashAlt } from 'react-icons/fa'
import { Tooltip } from 'react-tooltip'
import { deleteExpense, listExpenses, nextExpenseNumber, saveExpense } from '../financeApi'
import { currentDate, currentMonth, financeNumber, financeRaw } from '../utils/financeFormat'
import { EmptyState, FinancePage, FormField, Modal, StatCard, fieldClass, primaryButton, secondaryButton, surface } from '../components/FinanceUI'

const blank = () => ({ date: currentDate(), category: '', amount: '', currency_type: 'AFN', afn_rate: '1', paid_by: '', description: '', manual_sequence: '' })
const moneyClass = `${fieldClass} text-left tabular-nums` 

export default function ExpensesPage() {
  const { ui } = useLanguage();
  const [month, setMonth] = useState(currentMonth)
  const [expenses, setExpenses] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try { const data = await listExpenses(month); setExpenses(data.expenses || []); setTotal(data.total_afn || 0) }
    catch (exception) { setError(exception.message || "بارگذاری مصارف انجام نشد.") }
    finally { setLoading(false) }
  }, [month])
  useEffect(() => { refresh() }, [refresh])

  async function save(data) {
    try { await saveExpense(data, editing?.id); setFormOpen(false); setEditing(null); await refresh() }
    catch (exception) { throw exception }
  }

  async function remove(expense) {
    if (!window.confirm(ui("مصرف {0} حذف شود؟", {0: expense.expense_number}))) return
    try { await deleteExpense(expense.id); await refresh() }
    catch (exception) { setError(exception.message || "حذف مصرف انجام نشد.") }
  }

  return <FinancePage title={ui("مصارف")} subtitle={ui("ثبت، پیگیری و جمع‌بندی مصارف دفتر بر اساس ماه.")} icon={FaFileInvoiceDollar} action={<button type="button" onClick={() => { setEditing(null); setFormOpen(true) }} className={primaryButton}><FaPlus className="h-4 w-4" />{ui("ثبت مصرف")}</button>}>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><StatCard label={ui("مجموع مصرف به افغانی")} value={financeNumber(total)} icon={FaCoins} accent="rose" suffix=" AFN"/><StatCard label={ui("تعداد مصارف")} value={financeNumber(expenses.length, 0)} icon={FaFileInvoiceDollar} accent="blue"/><label className={`${surface} flex items-center justify-between gap-3 p-4 sm:p-5`}><span className="text-sm font-semibold text-gray-500 dark:text-gray-400">{ui("فیلتر ماه")}</span><AfghanMonthInput dir="ltr" value={month} onChange={(event) => setMonth(event.target.value)} className={`${fieldClass} max-w-[180px]`} /></label></div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{ui(error)}</p>}
    <section className={`${surface} overflow-hidden`}><div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 dark:border-gray-800 sm:px-5"><div><h2 className="font-bold text-gray-950 dark:text-white">{ui("فهرست مصارف")}</h2><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{monthTitle(month)}</p></div>{loading && <span className="text-xs text-gray-500">{ui("در حال بارگذاری…")}</span>}</div>
      {!loading && expenses.length === 0 ? <EmptyState title={ui("در این ماه مصرفی ثبت نشده است")} description={ui("با دکمهٔ «ثبت مصرف» نخستین رکورد را اضافه کنید.")} /> : <>
        <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[850px] text-start text-sm"><thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-800/70 dark:text-gray-400"><tr>{[ui("شماره"), ui("تاریخ"), ui("دسته‌بندی"), ui("مبلغ"), ui("معادل افغانی"), ui("پرداخت‌کننده"), ui("عملیات")].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3.5">{ui(label)}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{expenses.map((item) => <tr key={item.id} className="text-gray-700 transition hover:bg-blue-50/50 dark:text-gray-200 dark:hover:bg-gray-800/50"><td className="px-4 py-4 font-semibold text-gray-900 dark:text-white" dir="ltr">{item.expense_number}{item.number_is_manual && <span className="mr-2 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">{ui("دستی")}</span>}</td><td className="px-4 py-4" dir="ltr">{shamsi(item.date)}</td><td className="px-4 py-4">{item.category}</td><td className="px-4 py-4 tabular-nums" dir="ltr">{financeNumber(item.amount)} <span className="text-xs text-gray-400">{item.currency_type}</span></td><td className="px-4 py-4 font-semibold tabular-nums" dir="ltr">{financeNumber(item.afn_amount)} AFN</td><td className="px-4 py-4">{item.paid_by || '—'}</td><td className="px-4 py-3"><div className="flex gap-1.5"><button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300" title={ui("ویرایش مصرف")} onClick={() => { setEditing(item); setFormOpen(true) }}><FaEdit className="h-4 w-4"/></button><button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/60 dark:text-red-300" title={ui("حذف مصرف")} onClick={() => remove(item)}><FaTrashAlt className="h-4 w-4"/></button></div></td></tr>)}</tbody></table></div>
        <div className="space-y-3 p-3 lg:hidden">{expenses.map((item) => <article key={item.id} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-950"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-bold text-gray-950 dark:text-white">{item.category}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400" dir="ltr">{item.expense_number} · {shamsi(item.date)}</p></div><div className="flex gap-1"><button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" title={ui("ویرایش مصرف")} onClick={() => { setEditing(item); setFormOpen(true) }}><FaEdit className="h-4 w-4"/></button><button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300" title={ui("حذف مصرف")} onClick={() => remove(item)}><FaTrashAlt className="h-4 w-4"/></button></div></div><div className="mt-4 grid grid-cols-2 gap-3"><div><p className="text-xs text-gray-500">{ui("مبلغ")}</p><p className="mt-1 font-semibold tabular-nums text-gray-900 dark:text-white" dir="ltr">{financeNumber(item.amount)} {item.currency_type}</p></div><div><p className="text-xs text-gray-500">{ui("معادل افغانی")}</p><p className="mt-1 font-semibold tabular-nums text-rose-700 dark:text-rose-300" dir="ltr">{financeNumber(item.afn_amount)} AFN</p></div></div>{item.paid_by && <p className="mt-3 border-t border-gray-200 pt-3 text-xs text-gray-500 dark:border-gray-800">{ui("پرداخت‌کننده:")} {item.paid_by}</p>}</article>)}</div>
      </>}
    </section>
    <Tooltip id="expenses-actions" place="top" />
    {formOpen && <ExpenseForm initial={editing} onClose={() => { setFormOpen(false); setEditing(null) }} onSave={save} />}
  </FinancePage>
}

function ExpenseForm({ initial, onClose, onSave }) {
  const { ui } = useLanguage();
  const [form, setForm] = useState(() => initial ? { ...blank(), ...initial, manual_sequence: '' } : blank())
  const [nextNumber, setNextNumber] = useState('')
  const [manual, setManual] = useState(Boolean(initial?.number_is_manual))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const afnAmount = form.currency_type === 'AFN' ? financeRaw(form.amount) : financeRaw(form.amount) * financeRaw(form.afn_rate)

  useEffect(() => {
    if (initial) return
    nextExpenseNumber(Number(form.date.slice(0, 4))).then((data) => setNextNumber(data.number)).catch((exception) => setError(exception.message))
  }, [initial, form.date])

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    const payload = { ...form, amount: Number(form.amount), afn_rate: Number(form.afn_rate), manual_sequence: manual ? Number(form.manual_sequence) : undefined }
    try { await onSave(payload) }
    catch (exception) { setError(exception.message || "ثبت مصرف انجام نشد.") }
    finally { setBusy(false) }
  }

  return <Modal title={initial ? ui("ویرایش مصرف") : ui("ثبت مصرف جدید")} subtitle={ui("شمارهٔ مصرف به صورت خودکار ساخته می‌شود و قابل ثبت دستی نیز است.")} onClose={onClose}>
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2"><FormField label={ui("تاریخ مصرف")} id="expense-date"><AfghanDateInput id="expense-date"  required value={form.date} onChange={(event) => setForm((old) => ({ ...old, date: event.target.value }))} className={fieldClass} dir="ltr" /></FormField><FormField label={ui("شمارهٔ مصرف")} id="expense-number"><div className="flex gap-2"><input id="expense-number" readOnly value={initial?.expense_number || nextNumber || ui("در حال دریافت…")} className={`${fieldClass} bg-gray-50 text-left font-semibold dark:bg-gray-950`} dir="ltr"/><button type="button" onClick={() => setManual((value) => !value)} className={secondaryButton}>{manual ? ui("خودکار") : ui("دستی")}</button></div></FormField></div>
      {manual && !initial && <FormField label={ui("شمارهٔ ترتیبی دستی")} id="expense-manual-number" hint={ui("ثبت دستی شماره، شمارندهٔ بعدی را نیز جلو می‌برد.")}><input id="expense-manual-number" type="number" min="1" required value={form.manual_sequence} onChange={(event) => setForm((old) => ({ ...old, manual_sequence: event.target.value }))} className={fieldClass} dir="ltr" /></FormField>}
      <div className="grid gap-4 sm:grid-cols-2"><FormField label={ui("دسته‌بندی")} id="expense-category"><input id="expense-category" required maxLength="100" value={form.category} onChange={(event) => setForm((old) => ({ ...old, category: event.target.value }))} placeholder={ui("کرایه، برق، معاش…")} className={fieldClass}/></FormField><FormField label={ui("پرداخت‌کننده")} id="expense-paid-by"><input id="expense-paid-by" value={form.paid_by} onChange={(event) => setForm((old) => ({ ...old, paid_by: event.target.value }))} className={fieldClass}/></FormField></div>
      <div className="grid gap-4 sm:grid-cols-3"><FormField label={ui("مبلغ")} id="expense-amount"><input id="expense-amount" type="number" min="0.001" step="0.001" required value={form.amount} onChange={(event) => setForm((old) => ({ ...old, amount: event.target.value }))} className={moneyClass} dir="ltr" /></FormField><FormField label={ui("واحد پول")} id="expense-currency"><select id="expense-currency" value={form.currency_type} onChange={(event) => setForm((old) => ({ ...old, currency_type: event.target.value, afn_rate: event.target.value === 'AFN' ? '1' : old.afn_rate }))} className={fieldClass}>{[['AFN',ui("افغانی")],['TOMAN',ui("تومان")],['USD',ui("دالر")],['EUR',ui("یورو")],['PKR',ui("روپیه پاکستان")]].map(([value,label]) => <option key={value} value={value}>{ui(label)}</option>)}</select></FormField>{form.currency_type !== 'AFN' && <FormField label={ui("نرخ به افغانی")} id="expense-rate"><input id="expense-rate" type="number" min="0.000001" step="0.000001" required value={form.afn_rate} onChange={(event) => setForm((old) => ({ ...old, afn_rate: event.target.value }))} className={moneyClass} dir="ltr" /></FormField>}</div>
      <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4 dark:border-rose-950 dark:bg-rose-950/30"><p className="text-xs font-semibold text-rose-700 dark:text-rose-300">{ui("معادل مصرف به افغانی")}</p><p className="mt-1 text-xl font-bold tabular-nums text-rose-800 dark:text-rose-200" dir="ltr">{financeNumber(afnAmount)} AFN</p></div>
      <FormField label={ui("توضیحات")} id="expense-description"><textarea id="expense-description" rows="3" value={form.description} onChange={(event) => setForm((old) => ({ ...old, description: event.target.value }))} className={fieldClass} /></FormField>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{ui(error)}</p>}
      <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 dark:border-gray-800 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className={secondaryButton}>{ui("لغو")}</button><button disabled={busy} className={`${primaryButton} bg-emerald-600 hover:bg-emerald-700`}>{busy ? ui("در حال ذخیره…") : ui("ذخیره مصرف")}</button></div>
    </form>
  </Modal>
}
