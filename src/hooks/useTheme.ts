import { useState } from 'react'

type Theme = 'light' | 'dark'

const storageKey = 'tejas-portfolio-theme'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'),
  )

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = nextTheme
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
      'content',
      nextTheme === 'light' ? '#f4f2eb' : '#0a0b0e',
    )
    try {
      window.localStorage.setItem(storageKey, nextTheme)
    } catch (error) {
      console.warn('Could not save the selected theme:', error)
    }
    setTheme(nextTheme)
  }

  return { theme, toggleTheme }
}
