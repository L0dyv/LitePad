import { useState, useEffect } from 'react'
import './Settings.css'

interface SettingsProps {
    isOpen: boolean
    onClose: () => void
}

export function Settings({ isOpen, onClose }: SettingsProps) {
    const [autoLaunch, setAutoLaunch] = useState(false)
    const [alwaysOnTop, setAlwaysOnTop] = useState(false)

    useEffect(() => {
        // 获取当前设置
        window.electronAPI?.getSettings().then((settings) => {
            setAutoLaunch(settings.autoLaunch)
            setAlwaysOnTop(settings.alwaysOnTop)
        })
    }, [isOpen])

    const handleAutoLaunchChange = (checked: boolean) => {
        setAutoLaunch(checked)
        window.electronAPI?.setAutoLaunch(checked)
    }

    const handleAlwaysOnTopChange = (checked: boolean) => {
        setAlwaysOnTop(checked)
        window.electronAPI?.setAlwaysOnTop(checked)
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
                        <div className="settings-item readonly">
                            <span>显示/隐藏窗口</span>
                            <kbd>Alt + X</kbd>
                        </div>
                        <div className="settings-item readonly">
                            <span>计算表达式</span>
                            <kbd>Ctrl + Enter</kbd>
                        </div>
                    </div>
                    <div className="settings-section">
                        <h3>关于</h3>
                        <div className="settings-about">
                            <p><strong>FlashPad Self</strong></p>
                            <p>版本 0.1.0</p>
                            <p className="text-muted">一个快速、本地的速效记事本</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
