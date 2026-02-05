import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { ShortcutSettings } from '../utils/storage'
import './HelpPanel.css'

interface HelpPanelProps {
    isOpen: boolean
    onClose: () => void
    shortcuts: ShortcutSettings
}

export function HelpPanel({ isOpen, onClose, shortcuts }: HelpPanelProps) {
    const { t } = useTranslation()

    useEffect(() => {
        if (!isOpen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return
            e.preventDefault()
            onClose()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    if (!isOpen) return null

    return (
        <div className="help-overlay" onClick={onClose}>
            <div className="help-panel" onClick={(e) => e.stopPropagation()}>
                <h2 className="help-title">{t('help.title')}</h2>

                <div className="help-section">
                    <h3 className="help-section-title">{t('help.sectionEditor')}</h3>
                    <div className="help-item">
                        <span>{t('settings.calculate')}</span>
                        <kbd>Ctrl + Enter</kbd>
                    </div>
                    <div className="help-item">
                        <span>{t('help.findInEditor')}</span>
                        <kbd>Ctrl + F</kbd>
                    </div>
                </div>

                <div className="help-section">
                    <h3 className="help-section-title">{t('help.sectionLists')}</h3>
                    <div className="help-item">
                        <span>{t('help.indent')}</span>
                        <kbd>Tab</kbd>
                    </div>
                    <div className="help-item">
                        <span>{t('help.outdent')}</span>
                        <kbd>Shift + Tab</kbd>
                    </div>
                    <div className="help-item">
                        <span>{t('help.continueList')}</span>
                        <kbd>Enter</kbd>
                    </div>
                </div>

                <div className="help-section">
                    <h3 className="help-section-title">{t('help.sectionTabs')}</h3>
                    <div className="help-item">
                        <span>{t('settings.newTab')}</span>
                        <kbd>Ctrl + N / {shortcuts.newTab}</kbd>
                    </div>
                    <div className="help-item">
                        <span>{t('tabBar.rename')}</span>
                        <kbd>F2</kbd>
                    </div>
                    <div className="help-item">
                        <span>{t('settings.closeTab')}</span>
                        <kbd>{shortcuts.closeTab}</kbd>
                    </div>
                    <div className="help-item">
                        <span>{t('settings.reopenTab')}</span>
                        <kbd>{shortcuts.reopenTab}</kbd>
                    </div>
                    <div className="help-item">
                        <span>{t('settings.searchTabs')}</span>
                        <kbd>{shortcuts.searchTabs}</kbd>
                    </div>
                    <div className="help-item">
                        <span>{t('settings.archiveTab')}</span>
                        <kbd>{shortcuts.archiveTab}</kbd>
                    </div>
                    <div className="help-item">
                        <span>{t('settings.switchTab')}</span>
                        <kbd>Ctrl + Tab</kbd>
                    </div>
                    <div className="help-item">
                        <span>{t('settings.jumpToTab')}</span>
                        <kbd>Ctrl + 1~9</kbd>
                    </div>
                    <div className="help-item">
                        <span>{t('settings.toggleSidebar')}</span>
                        <kbd>Ctrl + \</kbd>
                    </div>
                    <div className="help-item">
                        <span>{t('help.openSettings')}</span>
                        <kbd>Ctrl + ,</kbd>
                    </div>
                </div>

                <div className="help-section">
                    <h3 className="help-section-title">{t('help.sectionSystem')}</h3>
                    <div className="help-item">
                        <span>{t('help.toggleFullscreen')}</span>
                        <kbd>F11</kbd>
                    </div>
                    <div className="help-item">
                        <span>{t('settings.showHideWindow')}</span>
                        <kbd>Alt + X</kbd>
                    </div>
                </div>
            </div>
        </div>
    )
}
