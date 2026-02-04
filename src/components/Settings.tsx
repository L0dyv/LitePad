import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { loadShortcuts, saveShortcuts, ShortcutSettings, DEFAULT_SHORTCUTS, loadFont, saveFont, loadEditorFont, saveEditorFont, loadEditorFontSize, saveEditorFontSize } from '../utils/storage'
import { changeLanguage, getCurrentLanguage } from '../i18n/i18n'
import { tauriAPI, BackupSettings, BackupInfo, PathValidationResult, UpdateInfo } from '../lib/tauri-api'
import { FaGithub } from 'react-icons/fa'
import packageJson from '../../package.json'
import { AuthModal } from './AuthModal'
import { isLoggedIn, getUserInfo, logout as authLogout } from '../sync/auth'
import { getConfig, enableSync, disableSync, DEFAULT_SERVER_URL, setConfig } from '../sync/config'
import type { SyncConfig } from '../db'
import { startSync, stopSync, getSyncStatus, manualSync } from '../sync'
import './Settings.css'

interface SettingsProps {
    isOpen: boolean
    onClose: () => void
    onShortcutsChange?: () => void
    onFontChange?: (font: string) => void
    onEditorFontChange?: (font: string) => void
    onEditorFontSizeChange?: (size: number) => void
    onLanguageChange?: (lang: string) => void
    zenModeEnabled?: boolean
    onZenModeChange?: (enabled: boolean) => void
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

export function Settings({ isOpen, onClose, onShortcutsChange, onFontChange, onEditorFontChange, onEditorFontSizeChange, onLanguageChange, zenModeEnabled, onZenModeChange }: SettingsProps) {
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
    const [currentEditorFontSize, setCurrentEditorFontSize] = useState(() => loadEditorFontSize())
    const [showShortcutHelp, setShowShortcutHelp] = useState(false)

    // Backup states
    const [backupSettings, setBackupSettings] = useState<BackupSettings>({
        backupDirectory: null,
        maxBackups: 5,
        autoBackupEnabled: false,
        autoBackupInterval: 30
    })
    const [backupList, setBackupList] = useState<BackupInfo[]>([])
    const [showBackupList, setShowBackupList] = useState(false)
    const [backupMessage, setBackupMessage] = useState<string | null>(null)
    const [pathValidation, setPathValidation] = useState<PathValidationResult | null>(null)
    const [defaultBackupDir, setDefaultBackupDir] = useState<string | null>(null)

    // Update check states
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
    const [checkingUpdate, setCheckingUpdate] = useState(false)
    const [updateError, setUpdateError] = useState<string | null>(null)

    // Sync states
    const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null)
    const [syncStatus, setSyncStatus] = useState(getSyncStatus())
    const [showAuthModal, setShowAuthModal] = useState(false)
    const [customServerUrl, setCustomServerUrl] = useState('')
    const [syncLoading, setSyncLoading] = useState(false)

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
        // 加载备份设置
        tauriAPI?.getBackupSettings().then((settings) => {
            setBackupSettings(settings)
            // 验证路径
            if (settings.backupDirectory) {
                tauriAPI?.validateBackupPath(settings.backupDirectory).then(setPathValidation)
            }
        })
        // 加载默认备份路径
        tauriAPI?.getDefaultBackupDir().then(setDefaultBackupDir)
        // 加载备份列表
        tauriAPI?.getBackupList().then((list) => {
            setBackupList(list)
        })
        // 加载同步配置
        getConfig().then((config) => {
            setSyncConfig(config)
            setCustomServerUrl(config.serverUrl || DEFAULT_SERVER_URL)
        })
        setSyncStatus(getSyncStatus())
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

    const handleEditorFontSizeChange = (size: number) => {
        setCurrentEditorFontSize(size)
        saveEditorFontSize(size)
        onEditorFontSizeChange?.(size)
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

    // Sync handlers
    const handleSyncToggle = async (enabled: boolean) => {
        if (enabled) {
            if (!isLoggedIn()) {
                setShowAuthModal(true)
                return
            }
            await enableSync(customServerUrl)
            setSyncConfig(await getConfig())
            try {
                await startSync()
            } catch (error) {
                console.error('启动同步失败:', error)
            }
        } else {
            stopSync()
            await disableSync()
            setSyncConfig(await getConfig())
        }
        setSyncStatus(getSyncStatus())
    }

    const handleAuthSuccess = async () => {
        setSyncConfig(await getConfig())
        // 自动启用同步
        await enableSync(customServerUrl)
        setSyncConfig(await getConfig())
        try {
            await startSync()
        } catch (error) {
            console.error('启动同步失败:', error)
        }
        setSyncStatus(getSyncStatus())
    }

    const handleLogout = async () => {
        stopSync()
        await authLogout()
        await disableSync()
        setSyncConfig(await getConfig())
        setSyncStatus(getSyncStatus())
    }

    const handleManualSync = async () => {
        if (!isLoggedIn()) return
        setSyncLoading(true)
        try {
            await manualSync()
        } catch (error) {
            console.error('同步失败:', error)
        } finally {
            setSyncLoading(false)
        }
    }

    const handleServerUrlChange = async (url: string) => {
        setCustomServerUrl(url)
        await setConfig({ serverUrl: url })
        setSyncConfig(await getConfig())
    }

    const formatLastSync = (timestamp: number | null) => {
        if (!timestamp) return t('sync.never')
        const now = Date.now()
        const diff = now - timestamp
        if (diff < 60000) return t('trash.justNow')
        if (diff < 3600000) return t('trash.minutesAgo', { count: Math.floor(diff / 60000) })
        if (diff < 86400000) return t('trash.hoursAgo', { count: Math.floor(diff / 3600000) })
        return t('trash.daysAgo', { count: Math.floor(diff / 86400000) })
    }

    const getSyncStatusText = () => {
        switch (syncStatus) {
            case 'connected': return t('sync.connected')
            case 'connecting': return t('sync.connecting')
            case 'syncing': return t('sync.syncing')
            case 'error': return t('sync.error')
            default: return t('sync.disconnected')
        }
    }

    // Backup handlers
    const handleSelectBackupDirectory = async () => {
        try {
            const dir = await tauriAPI?.selectBackupDirectory()
            if (dir) {
                const newSettings = { ...backupSettings, backupDirectory: dir }
                setBackupSettings(newSettings)
                await tauriAPI?.setBackupSettings(newSettings)
                // 验证新路径
                const validation = await tauriAPI?.validateBackupPath(dir)
                if (validation) setPathValidation(validation)
            }
        } catch (error) {
            setBackupMessage(t('settings.invalidBackupDirectory'))
            setTimeout(() => setBackupMessage(null), 3000)
        }
    }

    const handleBackupSettingChange = async <K extends keyof BackupSettings>(key: K, value: BackupSettings[K]) => {
        const newSettings = { ...backupSettings, [key]: value }
        setBackupSettings(newSettings)
        await tauriAPI?.setBackupSettings(newSettings)
    }

    const collectBackupData = () => {
        const keys = [
            'flashpad-data',
            'flashpad-archived-tabs',
            'flashpad-closed-tabs',
            'flashpad-shortcuts',
            'flashpad-font',
            'flashpad-editor-font',
            'flashpad-editor-font-size',
            'flashpad-zen-mode',
            'flashpad-statusbar'
        ]
        const data: Record<string, string | null> = {}
        for (const key of keys) {
            data[key] = localStorage.getItem(key)
        }
        return data
    }

    const handleManualBackup = async () => {
        if (!backupSettings.backupDirectory) {
            setBackupMessage(t('settings.notSet'))
            setTimeout(() => setBackupMessage(null), 3000)
            return
        }
        try {
            const data = collectBackupData()
            await tauriAPI?.performBackup(JSON.stringify(data))
            setBackupMessage(t('settings.backupSuccess'))
            // Refresh backup list
            const list = await tauriAPI?.getBackupList()
            if (list) setBackupList(list)
        } catch {
            setBackupMessage(t('settings.backupFailed'))
        }
        setTimeout(() => setBackupMessage(null), 3000)
    }

    const handleRestoreBackup = async (filename: string) => {
        if (!confirm(t('settings.confirmRestore'))) return
        try {
            const dataJson = await tauriAPI?.restoreBackup(filename)
            if (dataJson) {
                const data = JSON.parse(dataJson)
                for (const [key, value] of Object.entries(data)) {
                    if (value !== null) {
                        localStorage.setItem(key, value as string)
                    }
                }
                setBackupMessage(t('settings.restoreSuccess'))
                // Reload the page to apply restored data
                setTimeout(() => window.location.reload(), 1500)
            }
        } catch {
            setBackupMessage(t('settings.restoreFailed'))
        }
        setTimeout(() => setBackupMessage(null), 3000)
    }

    const handleDeleteBackup = async (filename: string) => {
        if (!confirm(t('settings.confirmDelete'))) return
        try {
            await tauriAPI?.deleteBackup(filename)
            const list = await tauriAPI?.getBackupList()
            if (list) setBackupList(list)
        } catch {
            // Ignore errors
        }
    }

    // Update check handlers
    const handleCheckUpdate = async () => {
        setCheckingUpdate(true)
        setUpdateError(null)
        setUpdateInfo(null)

        try {
            const info = await tauriAPI?.checkForUpdates()
            if (info) {
                setUpdateInfo(info)
            }
        } catch (error) {
            setUpdateError(error as string)
        } finally {
            setCheckingUpdate(false)
        }
    }

    const handleOpenRelease = () => {
        if (updateInfo?.releaseUrl) {
            tauriAPI?.openExternalUrl(updateInfo.releaseUrl)
        }
    }

    const formatReleaseDate = (dateString: string | null) => {
        if (!dateString) return ''
        try {
            return new Date(dateString).toLocaleString()
        } catch {
            return dateString
        }
    }

    const formatBackupTime = (timestamp: number) => {
        return new Date(timestamp * 1000).toLocaleString()
    }

    const formatBackupSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
                                <span>{t('settings.toggleSidebar')}</span>
                                <kbd>Ctrl + \</kbd>
                            </div>
                            <div className="settings-item readonly">
                                <span>{t('settings.newTab')}</span>
                                <kbd>Ctrl + N / {shortcuts.newTab}</kbd>
                            </div>
                            <div className="settings-item readonly">
                                <span>{t('settings.closeTab')}</span>
                                <kbd>{shortcuts.closeTab}</kbd>
                            </div>
                            <div className="settings-item readonly">
                                <span>{t('settings.reopenTab')}</span>
                                <kbd>{shortcuts.reopenTab}</kbd>
                            </div>
                            <div className="settings-item readonly">
                                <span>{t('settings.searchTabs')}</span>
                                <kbd>{shortcuts.searchTabs}</kbd>
                            </div>
                            <div className="settings-item readonly">
                                <span>{t('settings.archiveTab')}</span>
                                <kbd>{shortcuts.archiveTab}</kbd>
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
                            <span>{t('settings.editorFontSize')}</span>
                            <select
                                value={currentEditorFontSize}
                                onChange={(e) => handleEditorFontSizeChange(parseInt(e.target.value, 10))}
                                className="settings-select"
                            >
                                {[12, 13, 14, 15, 16, 18, 20, 22, 24].map((size) => (
                                    <option key={size} value={size}>{size}px</option>
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
                        <label className="settings-item">
                            <span>{t('settings.zenModeEnabled')}</span>
                            <input
                                type="checkbox"
                                checked={zenModeEnabled ?? true}
                                onChange={(e) => onZenModeChange?.(e.target.checked)}
                            />
                        </label>
                    </div>
                    <div className="settings-section">
                        <h3>{t('sync.title')}</h3>
                        <div className="settings-item sync-server-url">
                            <span>{t('sync.serverUrl')}</span>
                            <input
                                type="text"
                                className="settings-input"
                                value={customServerUrl}
                                onChange={(e) => handleServerUrlChange(e.target.value)}
                                placeholder={DEFAULT_SERVER_URL}
                            />
                        </div>
                        <label className="settings-item">
                            <span>{t('sync.enabled')}</span>
                            <input
                                type="checkbox"
                                checked={syncConfig?.enabled ?? false}
                                onChange={(e) => handleSyncToggle(e.target.checked)}
                            />
                        </label>
                        {syncConfig?.enabled && (
                            <>
                                <div className="settings-item">
                                    <span>{t('sync.status')}</span>
                                    <span className={`sync-status sync-status-${syncStatus}`}>
                                        {getSyncStatusText()}
                                    </span>
                                </div>
                                <div className="settings-item">
                                    <span>{t('sync.lastSync')}</span>
                                    <span className="sync-last-time">
                                        {formatLastSync(syncConfig?.lastSyncAt ?? null)}
                                    </span>
                                </div>
                                <div className="settings-item">
                                    <span>{t('sync.account')}</span>
                                    <span className="sync-account">
                                        {isLoggedIn() ? getUserInfo()?.email : t('sync.notLoggedIn')}
                                    </span>
                                </div>
                                {isLoggedIn() && (
                                    <div className="settings-item">
                                        <span></span>
                                        <div className="sync-actions">
                                            <button
                                                className="sync-btn"
                                                onClick={handleManualSync}
                                                disabled={syncLoading}
                                            >
                                                {syncLoading ? t('sync.syncing') : t('sync.syncNow')}
                                            </button>
                                            <button
                                                className="sync-btn logout"
                                                onClick={handleLogout}
                                            >
                                                {t('sync.logout')}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                        {!syncConfig?.enabled && !isLoggedIn() && (
                            <div className="sync-hint">
                                {t('sync.loginToSync')}
                            </div>
                        )}
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
                        <div className="settings-item editable">
                            <span>{t('settings.searchTabs')}</span>
                            <div className="shortcut-input">
                                <kbd
                                    className={recording === 'searchTabs' ? 'recording' : ''}
                                    onClick={() => startRecording('searchTabs')}
                                >
                                    {recording === 'searchTabs' ? t('settings.pressShortcut') : shortcuts.searchTabs}
                                </kbd>
                                {shortcuts.searchTabs !== DEFAULT_SHORTCUTS.searchTabs && (
                                    <button
                                        className="reset-btn"
                                        onClick={() => handleResetShortcut('searchTabs')}
                                        title={t('settings.resetDefault')}
                                    >↺</button>
                                )}
                            </div>
                        </div>
                        <div className="settings-item editable">
                            <span>{t('settings.archiveTab')}</span>
                            <div className="shortcut-input">
                                <kbd
                                    className={recording === 'archiveTab' ? 'recording' : ''}
                                    onClick={() => startRecording('archiveTab')}
                                >
                                    {recording === 'archiveTab' ? t('settings.pressShortcut') : shortcuts.archiveTab}
                                </kbd>
                                {shortcuts.archiveTab !== DEFAULT_SHORTCUTS.archiveTab && (
                                    <button
                                        className="reset-btn"
                                        onClick={() => handleResetShortcut('archiveTab')}
                                        title={t('settings.resetDefault')}
                                    >↺</button>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="settings-section">
                        <h3>{t('settings.backup')}</h3>
                        {backupMessage && (
                            <div className="backup-message">{backupMessage}</div>
                        )}
                        <div className="settings-item">
                            <span>{t('settings.backupDirectory')}</span>
                            <div className="backup-directory-picker">
                                <span className="directory-path" title={backupSettings.backupDirectory || defaultBackupDir || ''}>
                                    {backupSettings.backupDirectory || defaultBackupDir || t('settings.notSet')}
                                    {!backupSettings.backupDirectory && defaultBackupDir && (
                                        <span className="default-indicator"> ({t('settings.default')})</span>
                                    )}
                                </span>
                                <button className="browse-btn" onClick={handleSelectBackupDirectory}>
                                    {t('settings.browse')}
                                </button>
                            </div>
                        </div>
                        {pathValidation && !pathValidation.isValid && (
                            <div className="path-warning">
                                {pathValidation.errorCode === 'NO_WRITE_PERMISSION'
                                    ? t('settings.pathNoWritePermission')
                                    : t('settings.pathNotAccessible')}
                            </div>
                        )}
                        <label className="settings-item">
                            <span>{t('settings.maxBackups')}</span>
                            <select
                                value={backupSettings.maxBackups}
                                onChange={(e) => handleBackupSettingChange('maxBackups', parseInt(e.target.value, 10))}
                                className="settings-select"
                            >
                                {[3, 5, 10, 20, 50].map((n) => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </label>
                        <label className="settings-item">
                            <span>{t('settings.autoBackup')}</span>
                            <input
                                type="checkbox"
                                checked={backupSettings.autoBackupEnabled}
                                onChange={(e) => handleBackupSettingChange('autoBackupEnabled', e.target.checked)}
                            />
                        </label>
                        {backupSettings.autoBackupEnabled && (
                            <label className="settings-item">
                                <span>{t('settings.backupInterval')}</span>
                                <select
                                    value={backupSettings.autoBackupInterval}
                                    onChange={(e) => handleBackupSettingChange('autoBackupInterval', parseInt(e.target.value, 10))}
                                    className="settings-select"
                                >
                                    {[15, 30, 60, 120, 360].map((n) => (
                                        <option key={n} value={n}>{n} {t('settings.minutes')}</option>
                                    ))}
                                </select>
                            </label>
                        )}
                        <div className="settings-item">
                            <span>{t('settings.manualBackup')}</span>
                            <button className="backup-btn" onClick={handleManualBackup}>
                                {t('settings.backupNow')}
                            </button>
                        </div>
                        <div className="settings-item">
                            <span>{t('settings.backupList')}</span>
                            <button className="backup-btn" onClick={() => setShowBackupList(!showBackupList)}>
                                {t('settings.viewBackups')}
                            </button>
                        </div>
                        {showBackupList && (
                            <div className="backup-list">
                                {backupList.length === 0 ? (
                                    <div className="backup-empty">{t('settings.noBackups')}</div>
                                ) : (
                                    backupList.map((backup) => (
                                        <div key={backup.filename} className="backup-item">
                                            <div className="backup-info">
                                                <span className="backup-time">{formatBackupTime(backup.createdAt)}</span>
                                                <span className="backup-size">{formatBackupSize(backup.size)}</span>
                                            </div>
                                            <div className="backup-actions">
                                                <button
                                                    className="backup-action-btn restore"
                                                    onClick={() => handleRestoreBackup(backup.filename)}
                                                    title={t('settings.restore')}
                                                >
                                                    ↺
                                                </button>
                                                <button
                                                    className="backup-action-btn delete"
                                                    onClick={() => handleDeleteBackup(backup.filename)}
                                                    title={t('settings.delete')}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                    <div className="settings-section">
                        <h3>{t('settings.about')}</h3>
                        <div className="settings-about">
                            <p><strong>{t('app.title')}</strong></p>
                            <p>{t('settings.version')} {packageJson.version}</p>
                            <p className="text-muted">{t('app.description')}</p>
                            <div className="update-check-section">
                                <button
                                    className="check-update-btn"
                                    onClick={handleCheckUpdate}
                                    disabled={checkingUpdate}
                                >
                                    {checkingUpdate ? t('settings.checkingUpdate') : t('settings.checkUpdate')}
                                </button>
                                {updateInfo && (
                                    <div className={`update-result ${updateInfo.hasUpdate ? 'has-update' : 'no-update'}`}>
                                        {updateInfo.hasUpdate ? (
                                            <>
                                                <p className="update-title">{t('settings.updateAvailable')}</p>
                                                <p><span className="update-label">{t('settings.latestVersion')}:</span> {updateInfo.latestVersion}</p>
                                                <p><span className="update-label">{t('settings.currentVersion')}:</span> {updateInfo.currentVersion}</p>
                                                {updateInfo.publishedAt && (
                                                    <p><span className="update-label">{t('settings.publishedAt')}:</span> {formatReleaseDate(updateInfo.publishedAt)}</p>
                                                )}
                                                {updateInfo.releaseNotes && (
                                                    <div className="release-notes">
                                                        <p className="update-label">{t('settings.releaseNotes')}:</p>
                                                        <div className="release-notes-content">{updateInfo.releaseNotes}</div>
                                                    </div>
                                                )}
                                                <button className="download-update-btn" onClick={handleOpenRelease}>
                                                    {t('settings.downloadUpdate')}
                                                </button>
                                            </>
                                        ) : (
                                            <p className="up-to-date">{t('settings.upToDate')}</p>
                                        )}
                                    </div>
                                )}
                                {updateError && (
                                    <div className="update-result update-error">
                                        <p>{t('settings.checkUpdateFailed')}</p>
                                        <p className="error-detail">{updateError}</p>
                                    </div>
                                )}
                            </div>
                            <button
                                className="github-link"
                                onClick={() => tauriAPI?.openExternalUrl('https://github.com/L0dyv/LitePad')}
                                title="https://github.com/L0dyv/LitePad"
                            >
                                <FaGithub size={16} />
                                <span>GitHub</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <AuthModal
                isOpen={showAuthModal}
                onClose={() => setShowAuthModal(false)}
                onSuccess={handleAuthSuccess}
            />
        </div>
    )
}
