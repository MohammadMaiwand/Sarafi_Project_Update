import { useEffect, useState } from 'react'

export default function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('app_theme') || 'light')
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('app_theme', theme)
  }, [theme])
  const toggleTheme = () => setTheme((current) => current === 'dark' ? 'light' : 'dark')
  return { theme, toggleTheme }
}
