export default function Dashboard({ t, username, onLogout, onSettings }) {
  return <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10">
    <div className="space-y-2"><p className="text-sm font-medium text-blue-700 dark:text-blue-300">{t('app.title')}</p><h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">{t('dashboard.welcome', { username })}</h1></div>
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V5m0 14h16M8 15l3-4 3 2 5-7"/></svg></div><p className="max-w-2xl leading-7 text-gray-600 dark:text-gray-300">{t('dashboard.message')}</p>
      <div className="flex flex-wrap gap-3"><button type="button" onClick={onSettings} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">{t('dashboard.settings')}</button><button type="button" onClick={onLogout} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">{t('dashboard.logout')}</button></div>
    </section>
  </main>
}
