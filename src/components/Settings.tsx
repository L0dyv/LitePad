import { useState, useEffect, useCallback } from 'react'
import { loadShortcuts, saveShortcuts, ShortcutSettings, DEFAULT_SHORTCUTS } from '../utils/storage'
import './Settings.css'

interface SettingsProps {
    isOpen: boolean
    onClose: () => void
    onShortcutsChange?: () => void
}

// 将键盘事件转换为快捷键字符串
function eventToShortcut(e: KeyboardEvent): string | null {
    // 忽略单独的修饰键
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        return null
    }

    const parts: string[] = []
    if (e.ctrlKey) parts.push('Ctrl')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')

    // 需要至少一个修饰键
    if (parts.length === 0) return null

    // 处理特殊键名
    let key = e.key
    if (key === ' ') key = 'Space'
    else if (key.length === 1) key = key.toUpperCase()

    parts.push(key)
    return parts.join('+')
}

export function Settings({ isOpen, onClose, onShortcutsChange }: SettingsProps) {
    const [autoLaunch, setAutoLaunch] = useState(false)
    const [alwaysOnTop, setAlwaysOnTop] = useState(false)
    const [shortcuts, setShortcuts] = useState<ShortcutSettings>(() => loadShortcuts())
    const [recording, setRecording] = useState<keyof ShortcutSettings | null>(null)

    useEffect(() => {
        // 获取当前设置
        window.electronAPI?.getSettings().then((settings) => {
            setAutoLaunch(settings.autoLaunch)
            setAlwaysOnTop(settings.alwaysOnTop)
        })
        // 加载快捷键配置
        setShortcuts(loadShortcuts())
    }, [isOpen])

    // 录制快捷键
    useEffect(() => {
        if (!recording) return

        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault()
            e.stopPropagation()

            const shortcut = eventToShortcut(e)
            if (shortcut) {
                const newShortcuts = { ...shortcuts, [recording]: shortcut }
                setShortcuts(newShortcuts)
                saveShortcuts(newShortcuts)
                setRecording(null)
                onShortcutsChange?.()
            }
        }

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setRecording(null)
            }
        }

        window.addEventListener('keydown', handleKeyDown, true)
        window.addEventListener('keydown', handleEscape)

        return () => {
            window.removeEventListener('keydown', handleKeyDown, true)
            window.removeEventListener('keydown', handleEscape)
        }
    }, [recording, shortcuts, onShortcutsChange])

    const handleAutoLaunchChange = (checked: boolean) => {
        setAutoLaunch(checked)
        window.electronAPI?.setAutoLaunch(checked)
    }

    const handleAlwaysOnTopChange = (checked: boolean) => {
        setAlwaysOnTop(checked)
        window.electronAPI?.setAlwaysOnTop(checked)
    }

    const handleResetShortcut = useCallback((key: keyof ShortcutSettings) => {
        const newShortcuts = { ...shortcuts, [key]: DEFAULT_SHORTCUTS[key] }
        setShortcuts(newShortcuts)
        saveShortcuts(newShortcuts)
        onShortcutsChange?.()
    }, [shortcuts, onShortcutsChange])

    const startRecording = (key: keyof ShortcutSettings) => {
        setRecording(key)
    }

    if (!isOpen) return null

    return (
        <div className="settings-overlay" onClick={onClose}>
            <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
                <div className="settings-header">
                    <h2>设置</h2>
                    <button className="settings-close" onClick={onClose}>×</button>
                </div>
                <div className="settings-content">
                    <div className="settings-section">
                        <h3>常规</h3>
                        <label className="settings-item">
                            <span>开机自启动</span>
                            <input
                                type="checkbox"
                                checked={autoLaunch}
                                onChange={(e) => handleAutoLaunchChange(e.target.checked)}
                            />
                        </label>
                        <label className="settings-item">
                            <span>窗口置顶</span>
                            <input
                                type="checkbox"
                                checked={alwaysOnTop}
                                onChange={(e) => handleAlwaysOnTopChange(e.target.checked)}
                            />
                        </label>
                    </div>
                    <div className="settings-section">
                        <h3>快捷键</h3>
                        <p className="settings-hint">固定快捷键（不可更改）</p>
                        <div className="settings-item readonly">
                            <span>显示/隐藏窗口</span>
                            <kbd>Alt + X</kbd>
                        </div>
                        <div className="settings-item readonly">
                            <span>计算表达式</span>
                            <kbd>Ctrl + Enter</kbd>
                        </div>
                        <div className="settings-item readonly">
                            <span>切换标签页</span>
                            <kbd>Ctrl + Tab</kbd>
                        </div>
                        <div className="settings-item readonly">
                            <span>跳转到标签页</span>
                            <kbd>Ctrl + 1~9</kbd>
                        </div>

                        <p className="settings-hint custom">自定义快捷键（点击修改）</p>
                        <div className="settings-item editable">
                            <span>新建标签页</span>
                            <div className="shortcut-input">
                                <kbd
                                    className={recording === 'newTab' ? 'recording' : ''}
                                    onClick={() => startRecording('newTab')}
                                >
                                    {recording === 'newTab' ? '按下快捷键...' : shortcuts.newTab}
                                </kbd>
                                {shortcuts.newTab !== DEFAULT_SHORTCUTS.newTab && (
                                    <button
                                        className="reset-btn"
                                        onClick={() => handleResetShortcut('newTab')}
                                        title="恢复默认"
                                    >↺</button>
                                )}
                            </div>
                        </div>
                        <div className="settings-item editable">
                            <span>关闭标签页</span>
                            <div className="shortcut-input">
                                <kbd
                                    className={recording === 'closeTab' ? 'recording' : ''}
                                    onClick={() => startRecording('closeTab')}
                                >
                                    {recording === 'closeTab' ? '按下快捷键...' : shortcuts.closeTab}
                                </kbd>
                                {shortcuts.closeTab !== DEFAULT_SHORTCUTS.closeTab && (
                                    <button
                                        className="reset-btn"
                                        onClick={() => handleResetShortcut('closeTab')}
                                        title="恢复默认"
                                    >↺</button>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="settings-section">
                        <h3>关于</h3>
                        <div className="settings-about">
                            <p><strong>LitePad速记本</strong></p>
                            <p>版本 0.1.0</p>
                            <p className="text-muted">一个快速、本地的速效记事本</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

