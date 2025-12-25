import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ContextMenu, MenuItem } from './ContextMenu'
import { StatusBarSettings, saveStatusBar } from '../utils/storage'
import './StatusBar.css'

interface StatusBarProps {
    lineCount: number
    charCount: number
    settings: StatusBarSettings
    onSettingsChange: (settings: StatusBarSettings) => void
}

export function StatusBar({ lineCount, charCount, settings, onSettingsChange }: StatusBarProps) {
    const { t } = useTranslation()
    const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number }>({
        visible: false,
        x: 0,
        y: 0
    })

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault()
        setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY
        })
    }

    const closeContextMenu = () => {
        setContextMenu(prev => ({ ...prev, visible: false }))
    }

    const toggleSetting = (key: keyof StatusBarSettings) => {
        const newSettings = { ...settings, [key]: !settings[key] }
        onSettingsChange(newSettings)
        saveStatusBar(newSettings)
    }

    const getContextMenuItems = (): MenuItem[] => [
        {
            label: t('statusBar.showShortcuts'),
            checked: settings.showShortcuts,
            onClick: () => toggleSetting('showShortcuts')
        },
        {
            label: t('statusBar.showLineCount'),
            checked: settings.showLineCount,
            onClick: () => toggleSetting('showLineCount')
        },
        {
            label: t('statusBar.showCharCount'),
            checked: settings.showCharCount,
            onClick: () => toggleSetting('showCharCount')
        }
    ]

    return (
        <>
            <footer className="app-footer" onContextMenu={handleContextMenu}>
                {settings.showShortcuts && (
                    <span className="status">{t('statusBar.shortcutHint')}</span>
                )}
                <span className="status-spacer" />
                <span className="char-count">
                    {settings.showLineCount && t('statusBar.lines', { count: lineCount })}
                    {settings.showLineCount && settings.showCharCount && ' | '}
                    {settings.showCharCount && t('statusBar.chars', { count: charCount })}
                </span>
            </footer>
            {contextMenu.visible && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    items={getContextMenuItems()}
                    onClose={closeContextMenu}
                />
            )}
        </>
    )
}
