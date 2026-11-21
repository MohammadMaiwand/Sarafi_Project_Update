import useLanguage from '../hooks/useLanguage'
import { navigationGroups, isSectionActive } from '../utils/navigation'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import useDialog from '../hooks/useDialog'
import { Link, useLocation } from 'react-router-dom'
import { moduleAppearance } from '../utils/moduleAppearance'
import { LuArrowLeftRight, LuChartNoAxesCombined, LuHandshake, LuHouse, LuSettings, LuUsers, LuWallet } from 'react-icons/lu'
import { FaBars, FaChevronDown, FaColumns,  FaTimes,  FaCog, FaSignOutAlt } from 'react-icons/fa'

const icons={invoice:LuArrowLeftRight,money:LuWallet,people:LuUsers,handshake:LuHandshake,settings:LuSettings}
const groupIcons={operations:LuArrowLeftRight,customers:LuUsers,finance:LuWallet,reports:LuChartNoAxesCombined,preferences:LuSettings}

export default function Header({ t, lang, setLang, languages, theme, toggleTheme, username, onSettings, onLogout, navigationMode, onNavigationModeChange }) {
  const { ui } = useLanguage();
  const location=useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const headerRef = useRef(null)
  const drawerOpen = Boolean(username && mobileNavOpen && navigationMode === 'sidebar')
  const drawerRef = useDialog(drawerOpen, () => setMobileNavOpen(false))
  useEffect(()=>{
    const closeOutside=event=>headerRef.current?.querySelectorAll('details[data-nav-dropdown][open]').forEach(menu=>{if(!menu.contains(event.target))menu.open=false})
    const escape=event=>{if(event.key==='Escape')headerRef.current?.querySelectorAll('details[data-nav-dropdown][open]').forEach(menu=>{menu.open=false;menu.querySelector('summary')?.focus()})}
    document.addEventListener('pointerdown',closeOutside)
    document.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('pointerdown',closeOutside);document.removeEventListener('keydown',escape)}
  },[])
  useEffect(()=>{headerRef.current?.querySelectorAll('details[data-nav-dropdown]').forEach(menu=>{menu.open=false})},[location.pathname,location.search,navigationMode])
  useLayoutEffect(() => {
    const header = headerRef.current
    const update = () => header.closest('.app-shell')?.style.setProperty('--app-header-height', `${header.getBoundingClientRect().height}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const screen = window.matchMedia('(min-width: 1024px)')
    const close = () => { if (screen.matches) setMobileNavOpen(false) }
    screen.addEventListener('change', close)
    return () => screen.removeEventListener('change', close)
  }, [])
  const navigationLinks = (items) => items.map(({ to, label, icon, end }) => {const Icon=typeof icon==='string'?(moduleAppearance(to).icon||icons[icon]):icon;const active=isSectionActive(location,to,{end});return <Link key={to} to={to} aria-current={active?'page':undefined} onClick={event => {setMobileNavOpen(false);event.currentTarget.closest('details')?.removeAttribute('open')}} className={linkClass({isActive:active})}><Icon className="h-4 w-4 shrink-0" aria-hidden="true"/><span>{ui(label)}</span></Link>})
  const dashboardLink=()=>navigationLinks([{to:'/',label:'\u062f\u0627\u0634\u0628\u0648\u0631\u062f',icon:LuHouse,end:true}])
  const groupedLinks=()=> <>{dashboardLink()}{navigationGroups.map(group=>{const GroupIcon=groupIcons[group.id];return <section key={group.id} className="nav-section"><h2 className="ui-nav-group px-3 pb-2 pt-5 text-xs font-bold tracking-wide text-gray-400 dark:text-gray-500"><GroupIcon aria-hidden="true"/>{ui(group.label)}</h2><div className="flex flex-col gap-1">{navigationLinks(group.items)}</div></section>})}</>
  const linkClass = ({ isActive }) => `app-nav-link inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'}`
  return (
    <><header ref={headerRef} className="app-header sticky top-0 z-30 border-b border-gray-200 bg-white/85 backdrop-blur dark:border-gray-800 dark:bg-gray-950/85">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="app-brand flex items-center gap-2.5 font-semibold tracking-tight text-gray-900 dark:text-white"><span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-sm"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3 4.5 6.5v5.2c0 4.3 2.9 7.6 7.5 9.3 4.6-1.7 7.5-5 7.5-9.3V6.5L12 3Z"/><path strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-4"/></svg></span><span><span className="block">{t('app.title')}</span><span className="brand-caption">{ui("مدیریت حواله و خدمات مالی")}</span></span></div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {username && <>
            <button type="button" onClick={() => setMobileNavOpen((open) => !open)} aria-expanded={mobileNavOpen} aria-controls={navigationMode === 'sidebar' ? 'mobile-sidebar' : 'mobile-menubar'} aria-label={ui("نمایش فهرست بخش‌ها")} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 lg:hidden">{mobileNavOpen ? <FaTimes className="h-4 w-4" /> : <FaBars className="h-4 w-4" />}</button>
            <div role="group" aria-label={ui('نوع نمایش منو')} className="navigation-switch inline-flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900">
              {[['menubar', 'منوبار', FaBars], ['sidebar', 'سایدبار', FaColumns]].map(([mode, label, Icon]) => <button key={mode} type="button" aria-pressed={navigationMode === mode} onClick={() => { setMobileNavOpen(false); onNavigationModeChange(mode) }} className={`!min-h-9 gap-1.5 px-2.5 py-1 text-xs font-semibold ${navigationMode === mode ? 'bg-emerald-700 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}><Icon aria-hidden="true"/>{ui(label)}</button>)}
            </div>
          </>}
          <label className="sr-only" htmlFor="header-language">{t('settings.language')}</label>
          <select id="header-language" value={lang} onChange={(event) => setLang(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
            {languages.map(({ code }) => <option key={code} value={code}>{t(`lang.${code}`)}</option>)}
          </select>
          <button type="button" onClick={toggleTheme} title={theme === 'dark' ? t('settings.light') : t('settings.dark')} aria-label={theme === 'dark' ? t('settings.light') : t('settings.dark')} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-300 text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
            {theme === 'dark' ? <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg> : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/></svg>}
          </button>
          {username && <>
            <span className="hidden px-2 text-sm text-gray-600 dark:text-gray-300 sm:inline">{username}</span>
            <button type="button" onClick={onSettings} className="header-action rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"><FaCog aria-hidden="true" />{t('dashboard.settings')}</button>
            <button type="button" onClick={onLogout} className="header-action rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"><FaSignOutAlt aria-hidden="true" />{t('dashboard.logout')}</button>
          </>}
        </div>
      </div>
      {username && navigationMode === 'menubar' && <>
        <nav aria-label={ui("بخش‌های سیستم")} className="desktop-group-nav mx-auto hidden max-w-7xl items-center gap-2 px-4 pb-3 lg:flex">
          {dashboardLink()}
          {navigationGroups.map(group=>{const active=group.items.some(item=>isSectionActive(location,item.to));const GroupIcon=groupIcons[group.id];return <details key={group.id} data-nav-dropdown className="nav-dropdown relative" onToggle={event=>{if(event.currentTarget.open)headerRef.current?.querySelectorAll('details[data-nav-dropdown]').forEach(other=>{if(other!==event.currentTarget)other.open=false})}}><summary className={`inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${active?'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200':'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}><GroupIcon aria-hidden="true"/>{ui(group.label)}<FaChevronDown className="nav-chevron h-3 w-3" aria-hidden="true"/></summary><div className="nav-dropdown-panel absolute start-0 top-full z-50 mt-2 flex max-h-[65dvh] w-72 flex-col gap-1 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-900">{navigationLinks(group.items)}</div></details>})}

        </nav>
        {mobileNavOpen && <nav id="mobile-menubar" aria-label={ui("بخش‌های سیستم")} className="flex max-h-[65dvh] flex-col gap-1 overflow-y-auto border-t border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900 lg:hidden">{groupedLinks()}</nav>}
      </>}
    </header>
    {username && navigationMode === 'sidebar' && <>
      <aside className="app-sidebar hidden border-e border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950 lg:block" aria-label={ui('سایدبار')}>
        <p className="px-4 pb-4 pt-5 text-xs font-bold text-gray-500 dark:text-gray-400">{ui('بخش‌های سیستم')}</p>
        <nav aria-label={ui('بخش‌های سیستم')} className="flex flex-col gap-1.5 px-3 pb-6">{groupedLinks()}</nav>
      </aside>
      {drawerOpen && <div className="ui-modal-backdrop fixed inset-0 z-40 bg-gray-950/55 backdrop-blur-[2px] lg:hidden" onMouseDown={event => { if (event.target === event.currentTarget) setMobileNavOpen(false) }}>
        <aside id="mobile-sidebar" ref={drawerRef} role="dialog" aria-modal="true" aria-label={ui('بخش‌های سیستم')} tabIndex={-1} className="mobile-sidebar absolute inset-y-0 start-0 w-[min(290px,85vw)] overflow-y-auto bg-white p-3 shadow-2xl dark:bg-gray-950">
          <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3 dark:border-gray-800"><strong className="px-2">{ui('بخش‌های سیستم')}</strong><button type="button" aria-label={ui('بستن منو')} onClick={() => setMobileNavOpen(false)} className="h-11 w-11 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><FaTimes aria-hidden="true"/></button></div>
          <nav aria-label={ui('بخش‌های سیستم')} className="flex flex-col gap-1.5">{groupedLinks()}</nav>
        </aside>
      </div>}
    </>}
    </>
  )
}
