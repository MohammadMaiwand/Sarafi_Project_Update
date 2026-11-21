import { Children } from 'react'
import { useLocation } from 'react-router-dom'
import { moduleAppearance } from '../utils/moduleAppearance'
import useLanguage from '../hooks/useLanguage'
import useDialog from '../hooks/useDialog'
import { FaArrowRight, FaTimes } from 'react-icons/fa'

export const surface = 'finance-surface rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900'
export const fieldClass = 'ui-field w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-gray-700 dark:bg-gray-950 dark:text-white'
export const labelClass = 'mb-1.5 block text-sm font-semibold text-gray-700 dark:text-gray-300'
export const primaryButton = 'ui-button ui-button--primary inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700 focus-visible:ring-4 focus-visible:ring-blue-500/25 disabled:translate-y-0 disabled:opacity-60'
export const secondaryButton = 'ui-button ui-button--secondary inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'

export function FinancePage({ title, subtitle, icon: Icon, action, children }) {
  const { ui } = useLanguage();
  const appearance = moduleAppearance(useLocation().pathname)
  const PageIcon = Icon || appearance.icon
  return <main className="mx-auto w-full max-w-7xl space-y-6 px-3 py-6 text-start sm:px-5 sm:py-8 lg:px-8">
    <div className="ui-page-heading" data-tone={appearance.tone}>
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="ui-module-icon"><PageIcon aria-hidden="true" /></span>
        <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">{ui("مرکز مالی")}</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950 dark:text-white sm:text-3xl">{ui(title)}</h1>{subtitle && <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">{ui(subtitle)}</p>}</div>
      </div>
      {action && <div className="ui-page-actions">{action}</div>}
    </div>
    {children}
  </main>
}

export function StatCard({ label, value, icon: Icon, accent = 'blue', suffix = '' }) {
  const { ui } = useLanguage();
  const colors = {
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300',
  }
  return <div className={`${surface} stat-card min-w-0 p-4 sm:p-5`}><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{ui(label)}</p>{Icon && <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colors[accent]}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>}</div><p dir="ltr" className="mt-3 break-words text-xl font-bold tabular-nums text-gray-950 dark:text-white sm:text-2xl">{value}{suffix}</p></div>
}

export function FormField({ label, id, hint, className = '', children }) {
  const { ui } = useLanguage();
  return <div className={`min-w-0 ${className}`}><label htmlFor={id} className={labelClass}>{ui(label)}</label>{children}{hint && <p className="mt-1.5 text-xs leading-5 text-gray-500 dark:text-gray-400">{ui(hint)}</p>}</div>
}

export function Modal({ title, subtitle, onClose, children, width = 'max-w-3xl' }) {
  const { ui } = useLanguage();
  const dialogRef = useDialog(true, onClose)
  return <div className="ui-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-gray-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-label={ui(title)} tabIndex={-1} className={`ui-dialog max-h-[94dvh] w-full ${width} overflow-y-auto rounded-t-3xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-800 dark:bg-gray-900 sm:rounded-3xl sm:p-6`}>
      <header className="sticky top-0 z-10 -mx-4 -mt-4 mb-5 flex items-start justify-between gap-3 border-b border-gray-100 bg-white/95 px-4 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:-mx-6 sm:-mt-6 sm:px-6">
        <div><h2 className="text-lg font-bold text-gray-950 dark:text-white sm:text-xl">{ui(title)}</h2>{subtitle && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{ui(subtitle)}</p>}</div>
        <button type="button" onClick={onClose} aria-label={ui("بستن پنجره")} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"><FaTimes className="h-4 w-4" /></button>
      </header>
      {children}
    </section>
  </div>
}

export function BackButton({ onClick, children = 'بازگشت' }) {
  const { ui } = useLanguage();
  return <button type="button" onClick={onClick} className={secondaryButton}><FaArrowRight className="h-3.5 w-3.5" />{ui(children)}</button>
}

export function EmptyState({ title, description }) {
  const { ui } = useLanguage();
  return <div className="px-5 py-14 text-center"><div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-800"><svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7.5h16M6.5 4h11A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5v-13A1.5 1.5 0 0 1 6.5 4Z"/><path strokeLinecap="round" d="M8 11h8M8 15h5"/></svg></div><h3 className="font-semibold text-gray-900 dark:text-white">{ui(title)}</h3>{description && <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">{ui(description)}</p>}</div>
}

export function TableShell({ headers, rows, emptyTitle = 'رکوردی یافت نشد', loading = false }) {
  const { ui } = useLanguage();
  const count = Children.toArray(rows).length
  return <div role="region" aria-label={ui('جدول اطلاعات؛ برای دیدن ستون‌ها پیمایش کنید')} tabIndex={0} aria-busy={loading} className="ui-table-scroll overflow-x-auto rounded-b-2xl"><table className="w-full min-w-[760px] text-start text-sm"><thead className="sticky top-0 bg-gray-50 text-xs font-semibold text-gray-500 dark:bg-gray-800/80 dark:text-gray-400"><tr>{headers.map((header) => <th scope="col" key={header} className="whitespace-nowrap px-4 py-3.5">{ui(header)}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{rows}{loading && count === 0 && <tr><td colSpan={headers.length}><div role="status" className="ui-table-loading"><span className="ui-spinner" aria-hidden="true"/>{ui('در حال بارگذاری…')}<div className="ui-skeleton" aria-hidden="true"/><div className="ui-skeleton" aria-hidden="true"/></div></td></tr>}{!loading && count === 0 && <tr><td colSpan={headers.length}><EmptyState title={emptyTitle} /></td></tr>}</tbody></table></div>
}


export function PageLoading({ label }) {
  return <main className="ui-page-loading" role="status" aria-busy="true"><div className="ui-loading-label"><span className="ui-spinner" aria-hidden="true"/>{label}</div><div className="ui-skeleton" aria-hidden="true"/><div className="ui-skeleton" aria-hidden="true"/></main>
}
