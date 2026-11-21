import { useState } from 'react'
import { FaLock, FaUser } from 'react-icons/fa'
import { loginUser } from '../api'

const field = 'w-full rounded-xl border border-gray-200 bg-gray-50/70 py-3.5 pe-4 ps-11 text-left text-[15px] text-gray-900 outline-none transition placeholder:text-gray-400 hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:hover:border-gray-600 dark:focus:border-blue-500 dark:focus:bg-gray-950'

export default function Login({ t, onLoginSuccess }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const data = await loginUser(username.trim(), password)
      if(data.token) sessionStorage.setItem('app_token',data.token)
      onLoginSuccess(data.username)
    } catch {
      setError(t('login.error'))
    } finally {
      setBusy(false)
    }
  }

  return <main className="ui-login relative isolate flex min-h-[calc(100vh-65px)] w-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-gray-50 to-blue-50 px-4 py-10 dark:from-gray-950 dark:via-gray-950 dark:to-blue-950/30">
    <div aria-hidden="true" className="pointer-events-none absolute -top-28 end-[12%] -z-10 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl dark:bg-blue-700/10" />
    <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 start-[8%] -z-10 h-80 w-80 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-700/10" />

    <form onSubmit={submit} className="w-full max-w-[440px] overflow-hidden rounded-3xl border border-white/80 bg-white shadow-[0_28px_80px_-32px_rgba(30,64,175,0.35)] dark:border-gray-800 dark:bg-gray-900 dark:shadow-2xl">
      <div className="h-1.5 bg-gradient-to-l from-blue-700 via-blue-600 to-indigo-500" />
      <div className="space-y-7 p-6 sm:p-9">
        <div className="space-y-5 text-start">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3 4.5 6.5v5.2c0 4.3 2.9 7.6 7.5 9.3 4.6-1.7 7.5-5 7.5-9.3V6.5L12 3Z"/><path strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-4"/></svg>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">{t('app.title')}</p>
            <h1 className="text-2xl font-bold tracking-tight text-gray-950 dark:text-white sm:text-[28px]">{t('login.title')}</h1>
          </div>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="username" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">{t('login.username')}</label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-gray-400"><FaUser className="h-4 w-4" aria-hidden="true" /></span>
              <input id="username" name="username" dir="ltr" autoComplete="username" autoFocus required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="maihan" className={field} />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">{t('login.password')}</label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-gray-400"><FaLock className="h-4 w-4" aria-hidden="true" /></span>
              <input id="password" name="password" type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className={field} />
            </div>
          </div>
        </div>

        {error && <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300"><span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-bold dark:bg-red-900/70">!</span><span>{error}</span></div>}

        <button aria-busy={busy} disabled={busy} className="group flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-blue-500/25 disabled:translate-y-0 disabled:cursor-wait disabled:opacity-60">
          <span>{busy ? t('common.loading') : t('login.button')}</span>
          {!busy && <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6"/></svg>}
        </button>

        <div className="flex items-center justify-center gap-2 border-t border-gray-100 pt-5 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
          <FaLock className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
          <span>{t('app.title')}</span>
        </div>
      </div>
    </form>
  </main>
}
