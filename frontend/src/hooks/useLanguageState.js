import { useCallback, useLayoutEffect, useState } from 'react'
import { getTranslation, languages, translateUI } from '../i18n'
import { readSectionNames,storeSectionNames,customSectionName } from '../personalization'

export default function useLanguageState() {
  const [sectionLabels,setSectionLabels]=useState(readSectionNames)
  const saveSectionLabels=useCallback(value=>setSectionLabels(storeSectionNames(value)),[])
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem('app_lang')
    return languages.some(({ code }) => code === saved) ? saved : 'fa'
  })
  const setLang = useCallback((next) => {
    const valid = languages.some(({ code }) => code === next) ? next : 'fa'
    localStorage.setItem('app_lang', valid)
    setLangState(valid)
  }, [])
  useLayoutEffect(() => {
    document.documentElement.dir = languages.find(({ code }) => code === lang).dir
    document.documentElement.lang = lang
  }, [lang])
  const t = useCallback((key, values = {}) => {
    let result = getTranslation(lang, key)
    Object.entries(values).forEach(([name, value]) => { result = result.replaceAll(`{${name}}`, value) })
    return result
  }, [lang])
  const ui = useCallback((text, values = {}) => customSectionName(text,sectionLabels) ?? translateUI(lang, text, values), [lang,sectionLabels])
  return { lang, setLang, t, ui, languages, isRTL: lang !== 'en',sectionLabels,saveSectionLabels }
}
