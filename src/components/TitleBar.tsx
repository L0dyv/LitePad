import { useTranslation } from 'react-i18next'
import { useTheme } from '../hooks/useTheme'
import './TitleBar.css'

export function TitleBar() {
    const { t } = useTranslation()
    const { themeMode, resolvedTheme, toggleTheme } = useTheme()

    const handleMinimize = () => {
        window.electronAPI?.minimize()
    }

    const handleMaximize = () => {
        window.electronAPI?.maximize()
    }

    const handleClose = () => {
        window.electronAPI?.close()
    }

    // 获取当前模式的提示文本
    const getToggleTitle = () => {
        if (themeMode === 'dark') return t('titleBar.currentDark')
        if (themeMode === 'light') return t('titleBar.currentLight')
        return t('titleBar.currentSystem')
    }

    // 根据当前模式渲染对应图标（图标表示当前状态）
    const renderThemeIcon = () => {
        if (themeMode === 'system') {
            // System 模式图标：电脑/显示器
            return (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
            )
        }
        if (resolvedTheme === 'dark') {
            // 暗色模式：月亮图标（表示当前是暗色）
            return (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
            )
        }
        // 亮色模式：太阳图标（表示当前是亮色）
        return (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
        )
    }

    return (
        <div className="title-bar">
            <div className="title-bar-drag">
                <span className="title-bar-title">{t('app.title')}</span>
            </div>
            <div className="title-bar-controls">
                <button
                    className="title-bar-btn theme-toggle"
                    onClick={toggleTheme}
                    title={getToggleTitle()}
                >
                    {renderThemeIcon()}
                </button>
                <button className="title-bar-btn minimize" onClick={handleMinimize}>
                    <svg width="10" height="1" viewBox="0 0 10 1">
                        <rect width="10" height="1" fill="currentColor" />
                    </svg>
                </button>
                <button className="title-bar-btn maximize" onClick={handleMaximize}>
                    <svg width="10" height="10" viewBox="0 0 10 10">
                        <rect x="0" y="0" width="10" height="10" stroke="currentColor" strokeWidth="1" fill="none" />
                    </svg>
                </button>
                <button className="title-bar-btn close" onClick={handleClose}>
                    <svg width="10" height="10" viewBox="0 0 10 10">
                        <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
                        <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                </button>
            </div>
        </div>
    )
}
