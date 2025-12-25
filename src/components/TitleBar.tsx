import { useTranslation } from 'react-i18next'
import { useTheme } from '../hooks/useTheme'
import './TitleBar.css'

export function TitleBar() {
    const { t } = useTranslation()
    const { theme, toggleTheme } = useTheme()

    const handleMinimize = () => {
        window.electronAPI?.minimize()
    }

    const handleMaximize = () => {
        window.electronAPI?.maximize()
    }

    const handleClose = () => {
        window.electronAPI?.close()
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
                    title={theme === 'dark' ? t('titleBar.switchToLight') : t('titleBar.switchToDark')}
                >
                    {theme === 'dark' ? (
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
                    ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                        </svg>
                    )}
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
