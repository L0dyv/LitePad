import { useTranslation } from 'react-i18next'
import { Minus, Monitor, Moon, PanelLeft, Search, Settings as SettingsIcon, Square, Sun, X } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import './TitleBar.css'

interface TitleBarProps {
    onOpenSettings: () => void
    onToggleSidebar?: () => void
    sidebarVisible?: boolean
    onOpenSearch?: () => void
}

export function TitleBar({ onOpenSettings, onToggleSidebar, sidebarVisible = true, onOpenSearch }: TitleBarProps) {
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
            return <Monitor size={12} strokeWidth={2} />
        }
        if (resolvedTheme === 'dark') {
            return <Moon size={12} strokeWidth={2} />
        }
        return <Sun size={12} strokeWidth={2} />
    }

    return (
        <div className="title-bar">
            {/* 左侧：标题 + 侧边栏按钮 */}
            <div className="title-bar-left">
                <div className="title-bar-drag">
                    <span className="title-bar-title">{t('app.title')}</span>
                </div>
                {onToggleSidebar && (
                    <button
                        className={`title-bar-btn sidebar-toggle ${sidebarVisible ? 'active' : ''}`}
                        onClick={onToggleSidebar}
                        title={t('titleBar.toggleSidebar')}
                    >
                        <PanelLeft size={12} strokeWidth={2} />
                    </button>
                )}
            </div>
            <div className="title-bar-controls">
                <button
                    className="title-bar-btn theme-toggle"
                    onClick={toggleTheme}
                    title={getToggleTitle()}
                >
                    {renderThemeIcon()}
                </button>
                {onOpenSearch && (
                    <button
                        className="title-bar-btn search-btn"
                        onClick={onOpenSearch}
                        title={t('search.title')}
                    >
                        <Search size={12} strokeWidth={2} />
                    </button>
                )}
                <button
                    className="title-bar-btn settings-btn"
                    onClick={onOpenSettings}
                    title={t('settings.title')}
                >
                    <SettingsIcon size={12} strokeWidth={2} />
                </button>
                <button className="title-bar-btn minimize" onClick={handleMinimize}>
                    <Minus size={10} strokeWidth={2.2} />
                </button>
                <button className="title-bar-btn maximize" onClick={handleMaximize}>
                    <Square size={10} strokeWidth={2} />
                </button>
                <button className="title-bar-btn close" onClick={handleClose}>
                    <X size={10} strokeWidth={2.2} />
                </button>
            </div>
        </div>
    )
}
