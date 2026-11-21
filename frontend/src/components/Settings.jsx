import { useEffect, useState } from 'react'
import { changePassword, createUser, getUsers } from '../api'

const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-gray-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 dark:border-gray-700 dark:bg-gray-950 dark:text-white'
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300'
const cardClass = 'space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900'
const buttonClass = 'rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60'

export default function Settings({ t, lang, setLang, languages, theme, toggleTheme, username, switchAccount, onBack }) {
  const [users, setUsers] = useState([])
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [oldPassword, setOldPassword] = useState('')
  const [changedPassword, setChangedPassword] = useState('')
  const [createMessage, setCreateMessage] = useState(null)
  const [passwordMessage, setPasswordMessage] = useState(null)

  useEffect(() => { getUsers().then(({ users: list }) => setUsers(list)).catch(() => setUsers([])) }, [])

  async function submitCreate(event) {
    event.preventDefault(); setCreateMessage(null)
    try {
      const created = await createUser(newUsername, newPassword)
      setUsers((current) => [...new Set([...current, created.username])].sort())
      setNewUsername(''); setNewPassword(''); setCreateMessage({ success: true, text: t('settings.successCreate') })
    } catch (error) {
      setCreateMessage({ success: false, text: error.message.includes('Username already exists') ? t('settings.errorExists') : t('settings.errorGeneric') })
    }
  }

  async function submitPassword(event) {
    event.preventDefault(); setPasswordMessage(null)
    try {
      await changePassword(username, oldPassword, changedPassword)
      setOldPassword(''); setChangedPassword(''); setPasswordMessage({ success: true, text: t('settings.successChange') })
    } catch (error) {
      setPasswordMessage({ success: false, text: error.message.includes('Invalid old password') ? t('settings.errorOld') : t('settings.errorGeneric') })
    }
  }

  const messageClass = (success) => `text-sm ${success ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`
  return <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
    <div className="ui-page-heading"><h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">{t('settings.title')}</h1><button type="button" onClick={onBack} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">← {t('settings.back')}</button></div>
    <section className={cardClass}><div><h2 className="font-semibold text-gray-900 dark:text-white">{t('settings.language')}</h2></div><div className="flex flex-wrap gap-2">{languages.map(({ code }) => <button key={code} type="button" aria-pressed={lang === code} onClick={() => setLang(code)} className={`rounded-lg border px-4 py-2 text-sm font-medium ${lang === code ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800'}`}>{t(`lang.${code}`)}</button>)}</div></section>
    <section className={cardClass}><div><h2 className="font-semibold text-gray-900 dark:text-white">{t('settings.theme')}</h2></div><button type="button" role="switch" aria-checked={theme === 'dark'} onClick={toggleTheme} className={`flex w-fit items-center gap-3 rounded-full border px-4 py-2 text-sm font-medium ${theme === 'dark' ? 'border-blue-700 bg-blue-950 text-blue-200' : 'border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}><span className="flex h-5 w-5 items-center justify-center">{theme === 'dark' ? <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg> : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/></svg>}</span>{theme === 'dark' ? t('settings.dark') : t('settings.light')}</button></section>
    <section className={cardClass}><h2 className="font-semibold text-gray-900 dark:text-white">{t('settings.account')}</h2><div><label className={labelClass} htmlFor="account-select">{t('settings.switchAccount')}</label><select id="account-select" value={username} onChange={(event) => switchAccount(event.target.value)} className={inputClass}><option value="" disabled>{t('settings.selectAccount')}</option>{users.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>
      <form onSubmit={submitCreate} className="space-y-4 border-t border-gray-200 pt-5 dark:border-gray-800"><h3 className="font-medium text-gray-900 dark:text-white">{t('settings.createAccount')}</h3><div><label className={labelClass} htmlFor="new-username">{t('settings.newUsername')}</label><input id="new-username" required value={newUsername} onChange={(event) => setNewUsername(event.target.value)} className={inputClass}/></div><div><label className={labelClass} htmlFor="new-password">{t('settings.newPassword')}</label><input id="new-password" type="password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={inputClass}/></div><button className={buttonClass}>{t('settings.create')}</button>{createMessage && <p role="status" className={messageClass(createMessage.success)}>{createMessage.text}</p>}</form>
      <form onSubmit={submitPassword} className="space-y-4 border-t border-gray-200 pt-5 dark:border-gray-800"><h3 className="font-medium text-gray-900 dark:text-white">{t('settings.changePassword')}</h3><div><label className={labelClass} htmlFor="old-password">{t('settings.oldPassword')}</label><input id="old-password" type="password" autoComplete="current-password" required value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} className={inputClass}/></div><div><label className={labelClass} htmlFor="changed-password">{t('settings.newPassword')}</label><input id="changed-password" type="password" autoComplete="new-password" required value={changedPassword} onChange={(event) => setChangedPassword(event.target.value)} className={inputClass}/></div><button className={buttonClass}>{t('settings.change')}</button>{passwordMessage && <p role="status" className={messageClass(passwordMessage.success)}>{passwordMessage.text}</p>}</form>
    </section>
  </main>
}
