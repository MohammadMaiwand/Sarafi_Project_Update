import { useContext } from 'react'
import { LanguageContext } from './LanguageContext'

export default function useLanguage() {
  const language = useContext(LanguageContext)
  if (!language) throw new Error('useLanguage requires LanguageProvider')
  return language
}
