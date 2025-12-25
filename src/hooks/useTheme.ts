import { useState, useEffect } from 'react'

type Theme = 'dark' | 'light'

const STORAGE_KEY = 'litepad-theme'

export function useTheme() {
    const [theme, setTheme] = useState<Theme>(() => {
        const stored = localStorage.getItem(STORAGE_KEY)
        return (stored as Theme) || 'dark'
    })

    useEffect(() => {
        const root = window.document.documentElement
        if (theme === 'light') {
            root.setAttribute('data-theme', 'light')
        } else {
            root.removeAttribute('data-theme')
        }
        localStorage.setItem(STORAGE_KEY, theme)
    }, [theme])

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark')
    }

    return { theme, toggleTheme }
}
