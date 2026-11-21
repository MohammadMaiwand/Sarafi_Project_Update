import { colleagueTranslations } from './colleagues/translations'
import { customerTranslations } from './remittances/customerTranslations'
import { remittanceTranslations } from './remittances/translations'
import { uiTranslations } from './uiTranslations'

export function translateUI(lang, text, values = {}) {
  if (typeof text !== 'string') return text
  const row = customerTranslations[text] || colleagueTranslations[text] || remittanceTranslations[text] || uiTranslations[text]
  let result = lang === 'fa' ? text : row?.[lang === 'ps' ? 1 : 0] ?? text
  Object.entries(values).forEach(([key, value]) => { result = result.replaceAll(`{${key}}`, value) })
  return result
}

export const translations = {
  en: {
    app: { title: 'Amiri Workspace' },
    login: { title: 'Sign in to your workspace', username: 'Username', password: 'Password', button: 'Sign in', error: 'Invalid username or password. Please try again.' },
    dashboard: { welcome: 'Welcome, {username}', message: 'Your workspace is ready. Use settings to personalize your experience and manage accounts.', logout: 'Log out', settings: 'Settings' },
    settings: { title: 'Settings', back: 'Back to dashboard', language: 'Language', theme: 'Appearance', dark: 'Dark mode', light: 'Light mode', account: 'Account', switchAccount: 'Switch account', selectAccount: 'Select an account', createAccount: 'Create account', changePassword: 'Change password', newUsername: 'New username', newPassword: 'New password', oldPassword: 'Current password', create: 'Create account', change: 'Change password', successCreate: 'Account created successfully.', successChange: 'Password changed successfully.', errorExists: 'That username already exists.', errorOld: 'Current password is incorrect.', errorGeneric: 'Something went wrong. Please try again.' },
    common: { loading: 'Loading…', cancel: 'Cancel', save: 'Save' },
    lang: { en: 'English', fa: 'Dari', ps: 'Pashto' },
  },
  fa: {
    app: { title: 'فضای کاری امیری' },
    login: { title: 'به فضای کاری خود وارد شوید', username: 'نام کاربری', password: 'رمز عبور', button: 'ورود', error: 'نام کاربری یا رمز عبور نادرست است. دوباره تلاش کنید.' },
    dashboard: { welcome: 'خوش آمدید، {username}', message: 'فضای کاری شما آماده است. برای شخصی‌سازی و مدیریت حساب‌ها از تنظیمات استفاده کنید.', logout: 'خروج', settings: 'تنظیمات' },
    settings: { title: 'تنظیمات', back: 'بازگشت به داشبورد', language: 'زبان', theme: 'نمایش', dark: 'حالت تاریک', light: 'حالت روشن', account: 'حساب کاربری', switchAccount: 'تغییر حساب', selectAccount: 'یک حساب انتخاب کنید', createAccount: 'ایجاد حساب', changePassword: 'تغییر رمز عبور', newUsername: 'نام کاربری جدید', newPassword: 'رمز عبور جدید', oldPassword: 'رمز عبور فعلی', create: 'ایجاد حساب', change: 'تغییر رمز عبور', successCreate: 'حساب با موفقیت ایجاد شد.', successChange: 'رمز عبور با موفقیت تغییر کرد.', errorExists: 'این نام کاربری از قبل وجود دارد.', errorOld: 'رمز عبور فعلی نادرست است.', errorGeneric: 'مشکلی پیش آمد. دوباره تلاش کنید.' },
    common: { loading: 'در حال بارگذاری…', cancel: 'لغو', save: 'ذخیره' },
    lang: { en: 'انگلیسی', fa: 'دری', ps: 'پشتو' },
  },
  ps: {
    app: { title: 'اميري کاري ځای' },
    login: { title: 'خپل کاري ځای ته ننوځئ', username: 'کارن نوم', password: 'پټنوم', button: 'ننوتل', error: 'کارن نوم یا پټنوم ناسم دی. بیا هڅه وکړئ.' },
    dashboard: { welcome: 'ښه راغلاست، {username}', message: 'ستاسو کاري ځای چمتو دی. د خپلې تجربې د تنظیم او حسابونو د سمبالولو لپاره امستنې وکاروئ.', logout: 'وتل', settings: 'امستنې' },
    settings: { title: 'امستنې', back: 'ډشبورډ ته بېرته تګ', language: 'ژبه', theme: 'بڼه', dark: 'تیاره بڼه', light: 'روښانه بڼه', account: 'حساب', switchAccount: 'حساب بدلول', selectAccount: 'حساب وټاکئ', createAccount: 'حساب جوړول', changePassword: 'پټنوم بدلول', newUsername: 'نوی کارن نوم', newPassword: 'نوی پټنوم', oldPassword: 'اوسنی پټنوم', create: 'حساب جوړول', change: 'پټنوم بدلول', successCreate: 'حساب په بریالیتوب جوړ شو.', successChange: 'پټنوم په بریالیتوب بدل شو.', errorExists: 'دا کارن نوم له مخکې شته.', errorOld: 'اوسنی پټنوم ناسم دی.', errorGeneric: 'ستونزه رامنځته شوه. بیا هڅه وکړئ.' },
    common: { loading: 'بارېږي…', cancel: 'لغوه کول', save: 'ساتل' },
    lang: { en: 'انګلیسي', fa: 'دري', ps: 'پښتو' },
  },
}

export const languages = [{ code: 'en', dir: 'ltr' }, { code: 'fa', dir: 'rtl' }, { code: 'ps', dir: 'rtl' }]

export function getTranslation(lang, key) {
  const read = (source) => key.split('.').reduce((value, part) => value?.[part], source)
  return read(translations[lang]) ?? read(translations.en) ?? key
}
