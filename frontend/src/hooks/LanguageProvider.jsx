import useLanguageState from './useLanguageState'
import { LanguageContext } from './LanguageContext'

export default function LanguageProvider({ children }) {
  const language = useLanguageState()
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>
}
