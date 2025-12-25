import { useState } from 'react'
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
            label: '显示快捷键提示',
            checked: settings.showShortcuts,
            onClick: () => toggleSetting('showShortcuts')
        },
        {
            label: '显示行数',
            checked: settings.showLineCount,
            onClick: () => toggleSetting('showLineCount')
        },
        {
            label: '显示字符数',
            checked: settings.showCharCount,
            onClick: () => toggleSetting('showCharCount')
        }
    ]

    return (
        <>
            <footer className="app-footer" onContextMenu={handleContextMenu}>
                {settings.showShortcuts && (
                    <span className="status">Ctrl+Tab 切换 | Ctrl+1~9 跳转 | Ctrl+Enter 计算</span>
                )}
                <span className="status-spacer" />
                <span className="char-count">
                    {settings.showLineCount && `${lineCount} 行`}
                    {settings.showLineCount && settings.showCharCount && ' | '}
                    {settings.showCharCount && `${charCount} 字符`}
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
