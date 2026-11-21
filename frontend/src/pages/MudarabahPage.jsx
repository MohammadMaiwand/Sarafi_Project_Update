import { AfghanDateInput, AfghanMonthInput } from '../components/AfghanDate'
import { shamsi } from '../utils/remittance'
import useLanguage from '../hooks/useLanguage'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FaEdit, FaHandshake, FaPlus, FaTrashAlt, FaWallet } from 'react-icons/fa'
import { deleteMudarabah, listMudarabah, nextMudarabahNumber, saveMudarabah } from '../financeApi'
import { currentDate, currentMonth, financeNumber, financeRaw, financeRound } from '../utils/financeFormat'
import { EmptyState, FinancePage, FormField, Modal, StatCard, fieldClass, primaryButton, secondaryButton, surface } from '../components/FinanceUI'

const currencies = [['AFN','افغانی'],['TOMAN','تومان'],['USD','دالر'],['EUR','یورو'],['PKR','کلدار پاکستان'],['TRY','لیره ترکیه']]
const blank = () => ({ start_date: currentDate(), investor_name: '', agent_name: '', currency_type: 'AFN', principal_amount: '', calculation_mode: 'manual', annual_return_rate: '', duration_months: '12', manual_profit_amount: '', investor_share_percent: '50', agent_share_percent: '50', status: 'active', notes: '', manual_sequence: '' })

export default function MudarabahPage() {
  const { ui } = useLanguage();
  const [month, setMonth] = useState(currentMonth)
  const [contracts, setContracts] = useState([])
  const [totalProfit, setTotalProfit] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try { const data = await listMudarabah(month); setContracts(data.contracts || []); setTotalProfit(data.total_profit || 0) }
    catch (exception) { setError(exception.message || "بارگذاری قراردادهای مضاربه انجام نشد.") }
    finally { setLoading(false) }
  }, [month])
  useEffect(() => { refresh() }, [refresh])

  async function save(data) {
    await saveMudarabah(data, selected?.id)
    setOpen(false); setSelected(null); await refresh()
  }
  async function remove(contract) {
    if (!window.confirm(ui("قرارداد {0} حذف شود؟", {0: contract.contract_number}))) return
    try { await deleteMudarabah(contract.id); await refresh() }
    catch (exception) { setError(exception.message || "حذف قرارداد انجام نشد.") }
  }

  return <FinancePage title={ui("مضاربه")} subtitle={ui("مدیریت قرارداد سرمایه‌گذار و عامل، سهم سود و وضعیت قراردادها.")} icon={FaHandshake} action={<button type="button" onClick={() => { setSelected(null); setOpen(true) }} className={primaryButton}><FaPlus className="h-4 w-4"/>{ui("قرارداد جدید")}</button>}>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><StatCard label={ui("مجموع سود این ماه")} value={financeNumber(totalProfit)} icon={FaWallet} accent="emerald"/><StatCard label={ui("تعداد قراردادها")} value={financeNumber(contracts.length, 0)} icon={FaHandshake}/><label className={`${surface} flex items-center justify-between gap-3 p-4 sm:p-5`}><span className="text-sm font-semibold text-gray-500 dark:text-gray-400">{ui("ماه آغاز قرارداد")}</span><AfghanMonthInput dir="ltr" value={month} onChange={(event) => setMonth(event.target.value)} className={`${fieldClass} max-w-[180px]`} /></label></div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{ui(error)}</p>}
    <section className={`${surface} overflow-hidden`}><div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 dark:border-gray-800 sm:px-5"><div><h2 className="font-bold text-gray-950 dark:text-white">{ui("قراردادهای مضاربه")}</h2><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{ui("سهم سرمایه‌گذار و عامل در مجموع باید ۱۰۰٪ شود.")}</p></div>{loading && <span className="text-xs text-gray-500">{ui("در حال بارگذاری…")}</span>}</div>
      {!loading && contracts.length === 0 ? <EmptyState title={ui("قراردادی در این ماه ثبت نشده است")} description={ui("با دکمهٔ «قرارداد جدید» مضاربهٔ خود را ثبت کنید.")}/> : <>
        <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[900px] text-start text-sm"><thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-800/70 dark:text-gray-400"><tr>{[ui("شماره"), ui("تاریخ"), ui("سرمایه‌گذار"), ui("عامل"), ui("سرمایه"), ui("سود"), ui("سهم سرمایه‌گذار"), ui("سهم عامل"), ui("وضعیت"), ui("عملیات")].map((label) => <th key={label} className="whitespace-nowrap px-3 py-3.5">{ui(label)}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{contracts.map((item) => <tr key={item.id} className="text-gray-700 hover:bg-blue-50/40 dark:text-gray-200 dark:hover:bg-gray-800/50"><td className="px-3 py-4 font-semibold text-gray-900 dark:text-white" dir="ltr">{item.contract_number}</td><td className="px-3 py-4" dir="ltr">{shamsi(item.start_date)}</td><td className="px-3 py-4">{item.investor_name}</td><td className="px-3 py-4">{item.agent_name}</td><td className="px-3 py-4 tabular-nums" dir="ltr">{financeNumber(item.principal_amount)} {item.currency_type}</td><td className="px-3 py-4 font-semibold tabular-nums text-emerald-700 dark:text-emerald-300" dir="ltr">{financeNumber(item.profit_amount)} {item.currency_type}</td><td className="px-3 py-4 tabular-nums" dir="ltr">{financeNumber(item.investor_share_amount)} ({financeNumber(item.investor_share_percent)}%)</td><td className="px-3 py-4 tabular-nums" dir="ltr">{financeNumber(item.agent_share_amount)} ({financeNumber(item.agent_share_percent)}%)</td><td className="px-3 py-4"><Status status={item.status}/></td><td className="px-3 py-3"><Actions onEdit={() => { setSelected(item); setOpen(true) }} onDelete={() => remove(item)}/></td></tr>)}</tbody></table></div>
        <div className="space-y-3 p-3 lg:hidden">{contracts.map((item) => <article key={item.id} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-950"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-gray-950 dark:text-white">{item.investor_name} <span className="font-normal text-gray-400">↔</span> {item.agent_name}</p><p className="mt-1 text-xs text-gray-500" dir="ltr">{item.contract_number} · {shamsi(item.start_date)}</p></div><Actions onEdit={() => { setSelected(item); setOpen(true) }} onDelete={() => remove(item)}/></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><Money label={ui("سرمایه")} value={item.principal_amount} currency={item.currency_type}/><Money label={ui("سود محاسبه‌شده")} value={item.profit_amount} currency={item.currency_type} accent/><Money label={ui("سهم سرمایه‌گذار")} value={item.investor_share_amount} currency={item.currency_type}/><Money label={ui("سهم عامل")} value={item.agent_share_amount} currency={item.currency_type}/></div><div className="mt-3"><Status status={item.status}/></div></article>)}</div>
      </>}
    </section>
    {open && <MudarabahForm initial={selected} onClose={() => { setOpen(false); setSelected(null) }} onSave={save}/>}
  </FinancePage>
}

function Status({ status }) {
  const { ui } = useLanguage(); return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${status === 'completed' ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'}`}>{status === 'completed' ? ui("تکمیل‌شده") : ui("فعال")}</span> }
function Actions({ onEdit, onDelete }) {
  const { ui } = useLanguage(); return <div className="flex gap-1.5"><button type="button" title={ui("ویرایش قرارداد")} onClick={onEdit} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300"><FaEdit className="h-4 w-4"/></button><button type="button" title={ui("حذف قرارداد")} onClick={onDelete} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/60 dark:text-red-300"><FaTrashAlt className="h-4 w-4"/></button></div> }
function Money({ label, value, currency, accent }) {
  const { ui } = useLanguage(); return <div className="rounded-xl bg-white p-3 dark:bg-gray-900"><p className="text-xs text-gray-500 dark:text-gray-400">{ui(label)}</p><p className={`mt-1 font-bold tabular-nums ${accent ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-900 dark:text-white'}`} dir="ltr">{financeNumber(value)} <span className="text-xs font-medium">{currency}</span></p></div> }

function MudarabahForm({ initial, onClose, onSave }) {
  const { ui } = useLanguage();
  const [form, setForm] = useState(() => initial ? { ...blank(), ...initial, manual_sequence: '' } : blank())
  const [manual, setManual] = useState(Boolean(initial?.number_is_manual))
  const [nextNumber, setNextNumber] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const profit = useMemo(() => form.calculation_mode === 'auto' ? financeRaw(form.principal_amount) * financeRaw(form.annual_return_rate) / 100 * financeRaw(form.duration_months) / 12 : financeRaw(form.manual_profit_amount), [form])
  const investorPercent = financeRaw(form.investor_share_percent)
  const agentPercent = financeRaw(form.agent_share_percent)

  useEffect(() => {
    if (initial) return
    nextMudarabahNumber(Number(form.start_date.slice(0, 4))).then((data) => setNextNumber(data.number)).catch((exception) => setError(exception.message))
  }, [initial, form.start_date])

  async function submit(event) {
    event.preventDefault(); setError('')
    if (Math.abs(investorPercent + agentPercent - 100) > 0.001) { setError("مجموع سهم سرمایه‌گذار و عامل باید دقیقاً ۱۰۰٪ باشد."); return }
    if (financeRaw(form.principal_amount) <= 0) { setError("مبلغ سرمایه باید بیشتر از صفر باشد."); return }
    setBusy(true)
    const payload = { ...form, principal_amount: financeRound(form.principal_amount), manual_profit_amount: financeRound(form.manual_profit_amount), annual_return_rate: financeRound(form.annual_return_rate, 4), duration_months: Number(form.duration_months), investor_share_percent: financeRound(investorPercent), agent_share_percent: financeRound(agentPercent), manual_sequence: manual && !initial ? Number(form.manual_sequence) : undefined }
    try { await onSave(payload) }
    catch (exception) { setError(exception.message || "ذخیرهٔ قرارداد انجام نشد.") }
    finally { setBusy(false) }
  }

  return <Modal title={initial ? ui("ویرایش قرارداد مضاربه") : ui("قرارداد جدید مضاربه")} subtitle={ui("مجموع سهم سود دو طرف باید ۱۰۰ درصد باشد.")} onClose={onClose} width="max-w-4xl">
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2"><FormField label={ui("تاریخ آغاز")} id="mudarabah-date"><AfghanDateInput id="mudarabah-date"  required value={form.start_date} onChange={(event) => setForm((old) => ({ ...old, start_date: event.target.value }))} className={fieldClass} dir="ltr"/></FormField><FormField label={ui("شمارهٔ قرارداد")} id="mudarabah-number"><div className="flex gap-2"><input id="mudarabah-number" readOnly value={initial?.contract_number || nextNumber || ui("در حال دریافت…")} className={`${fieldClass} bg-gray-50 text-left font-semibold dark:bg-gray-950`} dir="ltr"/><button type="button" onClick={() => setManual((value) => !value)} className={secondaryButton}>{manual ? ui("خودکار") : ui("دستی")}</button></div></FormField></div>
      {manual && !initial && <FormField label={ui("شمارهٔ ترتیبی دستی")} id="mudarabah-manual"><input id="mudarabah-manual" type="number" min="1" required value={form.manual_sequence} onChange={(event) => setForm((old) => ({ ...old, manual_sequence: event.target.value }))} className={fieldClass} dir="ltr"/></FormField>}
      <div className="grid gap-4 sm:grid-cols-2"><FormField label={ui("نام سرمایه‌گذار")} id="investor-name"><input id="investor-name" required value={form.investor_name} onChange={(event) => setForm((old) => ({ ...old, investor_name: event.target.value }))} className={fieldClass}/></FormField><FormField label={ui("نام عامل / مضارب")} id="agent-name"><input id="agent-name" required value={form.agent_name} onChange={(event) => setForm((old) => ({ ...old, agent_name: event.target.value }))} className={fieldClass}/></FormField></div>
      <div className="grid gap-4 sm:grid-cols-2"><FormField label={ui("مبلغ سرمایه")} id="principal"><input id="principal" type="number" min="0.01" step="0.01" required value={form.principal_amount} onChange={(event) => setForm((old) => ({ ...old, principal_amount: event.target.value }))} className={`${fieldClass} text-left tabular-nums`} dir="ltr"/></FormField><FormField label={ui("واحد پول")} id="mudarabah-currency"><select id="mudarabah-currency" value={form.currency_type} onChange={(event) => setForm((old) => ({ ...old, currency_type: event.target.value }))} className={fieldClass}>{currencies.map(([value,label]) => <option key={value} value={value}>{ui(label)}</option>)}</select></FormField></div>
      <div className="grid gap-4 sm:grid-cols-3"><FormField label={ui("روش محاسبهٔ سود")} id="profit-mode"><select id="profit-mode" value={form.calculation_mode} onChange={(event) => setForm((old) => ({ ...old, calculation_mode: event.target.value }))} className={fieldClass}><option value="manual">{ui("ثبت دستی سود")}</option><option value="auto">{ui("محاسبهٔ سالانه")}</option></select></FormField>{form.calculation_mode === 'auto' ? <><FormField label={ui("بازده سالانه (٪)")} id="annual-return"><input id="annual-return" type="number" min="0" step="0.0001" required value={form.annual_return_rate} onChange={(event) => setForm((old) => ({ ...old, annual_return_rate: event.target.value }))} className={`${fieldClass} text-left`} dir="ltr"/></FormField><FormField label={ui("مدت (ماه)")} id="duration-months"><input id="duration-months" type="number" min="1" step="1" required value={form.duration_months} onChange={(event) => setForm((old) => ({ ...old, duration_months: event.target.value }))} className={`${fieldClass} text-left`} dir="ltr"/></FormField></> : <FormField label={ui("مبلغ سود")} id="manual-profit"><input id="manual-profit" type="number" min="0" step="0.01" required value={form.manual_profit_amount} onChange={(event) => setForm((old) => ({ ...old, manual_profit_amount: event.target.value }))} className={`${fieldClass} text-left`} dir="ltr"/></FormField>}</div>
      <div className="grid gap-4 sm:grid-cols-2"><FormField label={ui("سهم سرمایه‌گذار (٪)")} id="investor-share"><input id="investor-share" type="number" min="0" max="100" step="0.01" required value={form.investor_share_percent} onChange={(event) => { const value = event.target.value; setForm((old) => ({ ...old, investor_share_percent: value, agent_share_percent: String(Math.max(0, 100 - financeRaw(value)).toFixed(2)) })) }} className={`${fieldClass} text-left`} dir="ltr"/></FormField><FormField label={ui("سهم عامل (٪)")} id="agent-share"><input id="agent-share" type="number" min="0" max="100" step="0.01" required value={form.agent_share_percent} onChange={(event) => setForm((old) => ({ ...old, agent_share_percent: event.target.value }))} className={`${fieldClass} text-left`} dir="ltr"/></FormField></div>
      <div className="grid gap-3 sm:grid-cols-3"><Money label={ui("سود کل")} value={financeRound(profit)} currency={form.currency_type} accent/><Money label={`${ui("سهم سرمایه‌گذار")} · ${financeNumber(investorPercent)}%`} value={financeRound(profit * investorPercent / 100)} currency={form.currency_type}/><Money label={`${ui("سهم عامل")} · ${financeNumber(agentPercent)}%`} value={financeRound(profit * agentPercent / 100)} currency={form.currency_type}/></div>
      <div className="grid gap-4 sm:grid-cols-2"><FormField label={ui("وضعیت قرارداد")} id="mudarabah-status"><select id="mudarabah-status" value={form.status} onChange={(event) => setForm((old) => ({ ...old, status: event.target.value }))} className={fieldClass}><option value="active">{ui("فعال")}</option><option value="completed">{ui("تکمیل‌شده")}</option></select></FormField><FormField label={ui("یادداشت")} id="mudarabah-notes"><input id="mudarabah-notes" value={form.notes} onChange={(event) => setForm((old) => ({ ...old, notes: event.target.value }))} className={fieldClass}/></FormField></div>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{ui(error)}</p>}
      <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 dark:border-gray-800 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className={secondaryButton}>{ui("لغو")}</button><button disabled={busy} className={`${primaryButton} bg-emerald-600 hover:bg-emerald-700`}>{busy ? ui("در حال ذخیره…") : ui("ذخیرهٔ قرارداد")}</button></div>
    </form>
  </Modal>
}
