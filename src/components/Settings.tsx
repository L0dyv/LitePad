import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { loadShortcuts, saveShortcuts, ShortcutSettings, DEFAULT_SHORTCUTS, loadFont, saveFont, loadEditorFont, saveEditorFont } from '../utils/storage'
import { changeLanguage, getCurrentLanguage } from '../i18n/i18n'
import packageJson from '../../package.json'
import './Settings.css'

interface SettingsProps {
    isOpen: boolean
    onClose: () => void
    onShortcutsChange?: () => void
    onFontChange?: (font: string) => void
    onEditorFontChange?: (font: string) => void
    onLanguageChange?: (lang: string) => void
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

export function Settings({ isOpen, onClose, onShortcutsChange, onFontChange, onEditorFontChange, onLanguageChange }: SettingsProps) {
    const { t } = useTranslation()
    const [autoLaunch, setAutoLaunch] = useState(false)
    const [alwaysOnTop, setAlwaysOnTop] = useState(false)
    const [shortcuts, setShortcuts] = useState<ShortcutSettings>(() => loadShortcuts())
    const [recording, setRecording] = useState<keyof ShortcutSettings | null>(null)
    const [currentLang, setCurrentLang] = useState(() => getCurrentLanguage())
    const [currentFont, setCurrentFont] = useState(() => loadFont())
    const [currentEditorFont, setCurrentEditorFont] = useState(() => loadEditorFont())
    const [systemFonts, setSystemFonts] = useState<string[]>([
        'SimSun', 'Microsoft YaHei', 'SimHei', 'KaiTi', 'FangSong', 'Consolas', 'Segoe UI'
    ])
    const [showShortcutHelp, setShowShortcutHelp] = useState(false)

    useEffect(() => {
        // 获取当前设置
        window.electronAPI?.getSettings().then((settings) => {
            setAutoLaunch(settings.autoLaunch)
            setAlwaysOnTop(settings.alwaysOnTop)
        })
        // 加载快捷键配置
        setShortcuts(loadShortcuts())
        // 获取当前语言
        setCurrentLang(getCurrentLanguage())
        // 获取当前字体
        setCurrentFont(loadFont())
        // 获取当前编辑器字体
        setCurrentEditorFont(loadEditorFont())
        // 获取系统字体列表
        window.electronAPI?.getSystemFonts().then((fonts) => {
            if (fonts && fonts.length > 0) {
                setSystemFonts(fonts)
            }
        })
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

    const handleLanguageChange = (lang: string) => {
        setCurrentLang(lang)
        changeLanguage(lang)
        onLanguageChange?.(lang)
    }

    const handleFontChange = (font: string) => {
        setCurrentFont(font)
        saveFont(font)
        onFontChange?.(font)
    }

    const handleEditorFontChange = (font: string) => {
        setCurrentEditorFont(font)
        saveEditorFont(font)
        onEditorFontChange?.(font)
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

    // 快捷键帮助弹窗
    if (showShortcutHelp) {
        return (
            <div className="settings-overlay" onClick={() => setShowShortcutHelp(false)}>
                <div className="settings-panel shortcut-help-panel" onClick={(e) => e.stopPropagation()}>
                    <div className="settings-header">
                        <h2>{t('settings.shortcutReference')}</h2>
                        <button className="settings-close" onClick={() => setShowShortcutHelp(false)}>×</button>
                    </div>
                    <div className="settings-content">
                        <div className="settings-section">
                            <div className="settings-item readonly">
                                <span>{t('settings.showHideWindow')}</span>
                                <kbd>Alt + X</kbd>
                            </div>
                            <div className="settings-item readonly">
                                <span>{t('settings.calculate')}</span>
                                <kbd>Ctrl + Enter</kbd>
                            </div>
                            <div className="settings-item readonly">
                                <span>{t('settings.switchTab')}</span>
                                <kbd>Ctrl + Tab</kbd>
                            </div>
                            <div className="settings-item readonly">
                                <span>{t('settings.jumpToTab')}</span>
                                <kbd>Ctrl + 1~9</kbd>
                            </div>
                            <div className="settings-item readonly">
                                <span>{t('settings.newTab')}</span>
                                <kbd>{shortcuts.newTab}</kbd>
                            </div>
                            <div className="settings-item readonly">
                                <span>{t('settings.closeTab')}</span>
                                <kbd>{shortcuts.closeTab}</kbd>
                            </div>
                            <div className="settings-item readonly">
                                <span>{t('settings.reopenTab')}</span>
                                <kbd>{shortcuts.reopenTab}</kbd>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="settings-overlay" onClick={onClose}>
            <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
                <div className="settings-header">
                    <h2>{t('settings.title')}</h2>
                    <button className="settings-close" onClick={onClose}>×</button>
                </div>
                <div className="settings-content">
                    <div className="settings-section">
                        <h3>{t('settings.general')}</h3>
                        <label className="settings-item">
                            <span>{t('settings.language')}</span>
                            <select
                                value={currentLang}
                                onChange={(e) => handleLanguageChange(e.target.value)}
                                className="settings-select"
                            >
                                <option value="zh">{t('languages.zh')}</option>
                                <option value="en">{t('languages.en')}</option>
                            </select>
                        </label>
                        <label className="settings-item">
                            <span>{t('settings.font')}</span>
                            <select
                                value={currentFont}
                                onChange={(e) => handleFontChange(e.target.value)}
                                className="settings-select font-select"
                            >
                                {systemFonts.map((font) => (
                                    <option key={font} value={font}>{font}</option>
                                ))}
                            </select>
                        </label>
                        <label className="settings-item">
                            <span>{t('settings.editorFont')}</span>
                            <select
                                value={currentEditorFont}
                                onChange={(e) => handleEditorFontChange(e.target.value)}
                                className="settings-select font-select"
                            >
                                {systemFonts.map((font) => (
                                    <option key={font} value={font}>{font}</option>
                                ))}
                            </select>
                        </label>
                        <label className="settings-item">
                            <span>{t('settings.autoLaunch')}</span>
                            <input
                                type="checkbox"
                                checked={autoLaunch}
                                onChange={(e) => handleAutoLaunchChange(e.target.checked)}
                            />
                        </label>
                        <label className="settings-item">
                            <span>{t('settings.alwaysOnTop')}</span>
                            <input
                                type="checkbox"
                                checked={alwaysOnTop}
                                onChange={(e) => handleAlwaysOnTopChange(e.target.checked)}
                            />
                        </label>
                    </div>
                    <div className="settings-section">
                        <h3>{t('settings.shortcuts')}</h3>
                        <div className="settings-item">
                            <span>{t('settings.shortcutReference')}</span>
                            <button
                                className="view-shortcuts-btn"
                                onClick={() => setShowShortcutHelp(true)}
                            >
                                {t('settings.viewShortcuts')} ⌨️
                            </button>
                        </div>

                        <p className="settings-hint custom">{t('settings.customShortcuts')}</p>
                        <div className="settings-item editable">
                            <span>{t('settings.newTab')}</span>
                            <div className="shortcut-input">
                                <kbd
                                    className={recording === 'newTab' ? 'recording' : ''}
                                    onClick={() => startRecording('newTab')}
                                >
                                    {recording === 'newTab' ? t('settings.pressShortcut') : shortcuts.newTab}
                                </kbd>
                                {shortcuts.newTab !== DEFAULT_SHORTCUTS.newTab && (
                                    <button
                                        className="reset-btn"
                                        onClick={() => handleResetShortcut('newTab')}
                                        title={t('settings.resetDefault')}
                                    >↺</button>
                                )}
                            </div>
                        </div>
                        <div className="settings-item editable">
                            <span>{t('settings.closeTab')}</span>
                            <div className="shortcut-input">
                                <kbd
                                    className={recording === 'closeTab' ? 'recording' : ''}
                                    onClick={() => startRecording('closeTab')}
                                >
                                    {recording === 'closeTab' ? t('settings.pressShortcut') : shortcuts.closeTab}
                                </kbd>
                                {shortcuts.closeTab !== DEFAULT_SHORTCUTS.closeTab && (
                                    <button
                                        className="reset-btn"
                                        onClick={() => handleResetShortcut('closeTab')}
                                        title={t('settings.resetDefault')}
                                    >↺</button>
                                )}
                            </div>
                        </div>
                        <div className="settings-item editable">
                            <span>{t('settings.reopenTab')}</span>
                            <div className="shortcut-input">
                                <kbd
                                    className={recording === 'reopenTab' ? 'recording' : ''}
                                    onClick={() => startRecording('reopenTab')}
                                >
                                    {recording === 'reopenTab' ? t('settings.pressShortcut') : shortcuts.reopenTab}
                                </kbd>
                                {shortcuts.reopenTab !== DEFAULT_SHORTCUTS.reopenTab && (
                                    <button
                                        className="reset-btn"
                                        onClick={() => handleResetShortcut('reopenTab')}
                                        title={t('settings.resetDefault')}
                                    >↺</button>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="settings-section">
                        <h3>{t('settings.about')}</h3>
                        <div className="settings-about">
                            <p><strong>{t('app.title')}</strong></p>
                            <p>{t('settings.version')} {packageJson.version}</p>
                            <p className="text-muted">{t('app.description')}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
