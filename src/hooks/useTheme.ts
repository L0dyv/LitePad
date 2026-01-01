import { useState, useEffect, useCallback } from 'react'

// 用户选择的主题模式
type ThemeMode = 'dark' | 'light' | 'system'

// 实际应用的主题
type ResolvedTheme = 'dark' | 'light'

const STORAGE_KEY = 'litepad-theme'

// 获取系统主题
function getSystemTheme(): ResolvedTheme {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark'
    }
    return 'light'
}

// 根据模式获取实际主题
function resolveTheme(mode: ThemeMode): ResolvedTheme {
    if (mode === 'system') {
        return getSystemTheme()
    }
    return mode
}

export function useTheme() {
    const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored === 'dark' || stored === 'light' || stored === 'system') {
            return stored
        }
        return 'dark'
    })

    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(themeMode))

    // 应用主题到 DOM
    const applyTheme = useCallback((theme: ResolvedTheme) => {
        const root = window.document.documentElement
        if (theme === 'light') {
            root.setAttribute('data-theme', 'light')
        } else {
            root.removeAttribute('data-theme')
        }
    }, [])

    // 监听主题模式变化
    useEffect(() => {
        const resolved = resolveTheme(themeMode)
        setResolvedTheme(resolved)
        applyTheme(resolved)
        localStorage.setItem(STORAGE_KEY, themeMode)
    }, [themeMode, applyTheme])

    // 监听系统主题变化（仅在 system 模式下生效）
    useEffect(() => {
        if (themeMode !== 'system') return

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

        const handleChange = (e: MediaQueryListEvent) => {
            const newTheme = e.matches ? 'dark' : 'light'
            setResolvedTheme(newTheme)
            applyTheme(newTheme)
        }

        mediaQuery.addEventListener('change', handleChange)
        return () => mediaQuery.removeEventListener('change', handleChange)
    }, [themeMode, applyTheme])

    // 三态循环切换: dark -> light -> system -> dark
    const toggleTheme = useCallback(() => {
        setThemeMode(prev => {
            if (prev === 'dark') return 'light'
            if (prev === 'light') return 'system'
            return 'dark'
        })
    }, [])

    return {
        themeMode,        // 用户选择的模式
        resolvedTheme,    // 实际应用的主题
        toggleTheme,      // 切换函数
        setThemeMode      // 直接设置模式
    }
}
