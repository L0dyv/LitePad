import { useTranslation } from 'react-i18next'
import { useTheme } from '../hooks/useTheme'
import { TrashDropdown } from './TrashDropdown'
import { ClosedTab } from '../utils/storage'
import './TitleBar.css'

interface TitleBarProps {
    closedTabs: ClosedTab[]
    onRestoreFromTrash: (tab: ClosedTab) => void
    onClearTrash: () => void
    onOpenSettings: () => void
}

export function TitleBar({ closedTabs, onRestoreFromTrash, onClearTrash, onOpenSettings }: TitleBarProps) {
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
                <TrashDropdown
                    closedTabs={closedTabs}
                    onRestore={onRestoreFromTrash}
                    onClear={onClearTrash}
                />
                <button
                    className="title-bar-btn theme-toggle"
                    onClick={toggleTheme}
                    title={getToggleTitle()}
                >
                    {renderThemeIcon()}
                </button>
                <button
                    className="title-bar-btn settings-btn"
                    onClick={onOpenSettings}
                    title={t('settings.title')}
                >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z" />
                        <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z" />
                    </svg>
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
