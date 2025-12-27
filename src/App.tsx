import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Editor } from './components/Editor'
import { TabBar } from './components/TabBar'
import { TitleBar } from './components/TitleBar'
import { Settings } from './components/Settings'
import { StatusBar } from './components/StatusBar'
import { loadData, saveData, createTab, AppData, loadShortcuts, ShortcutSettings, matchShortcut, loadStatusBar, StatusBarSettings, loadFont, loadEditorFont } from './utils/storage'
import './styles/App.css'

function App() {
    const { t } = useTranslation()
    const [data, setData] = useState<AppData>(() => loadData())
    const [shortcuts, setShortcuts] = useState<ShortcutSettings>(() => loadShortcuts())
    const [statusBarSettings, setStatusBarSettings] = useState<StatusBarSettings>(() => loadStatusBar())
    const [showSettings, setShowSettings] = useState(false)
    const [currentFont, setCurrentFont] = useState(() => loadFont())
    const [editorFont, setEditorFont] = useState(() => loadEditorFont())
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // 应用字体设置
    useEffect(() => {
        document.body.style.fontFamily = `'${currentFont}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
    }, [currentFont])

    // 当前激活的标签页
    const activeTab = data.tabs.find(t => t.id === data.activeTabId) || data.tabs[0]

    // 防抖保存
    const debounceSave = useCallback((newData: AppData) => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
        }
        saveTimeoutRef.current = setTimeout(() => {
            saveData(newData)
        }, 300)
    }, [])

    // 数据变化时保存
    useEffect(() => {
        debounceSave(data)
    }, [data, debounceSave])

    // 切换标签页
    const handleTabClick = (id: string) => {
        setData(prev => ({ ...prev, activeTabId: id }))
    }

    // 关闭标签页
    const handleTabClose = useCallback((id: string) => {
        setData(prev => {
            const newTabs = prev.tabs.filter(t => t.id !== id)
            const newActiveId = prev.activeTabId === id
                ? newTabs[newTabs.length - 1]?.id || ''
                : prev.activeTabId
            return { tabs: newTabs, activeTabId: newActiveId }
        })
    }, [])

    // 添加标签页
    const handleTabAdd = useCallback(() => {
        const newTab = createTab(t('tabBar.newPage'))
        setData(prev => ({
            tabs: [...prev.tabs, newTab],
            activeTabId: newTab.id
        }))
    }, [t])

    // 切换到下一个标签页
    const handleNextTab = useCallback(() => {
        setData(prev => {
            const currentIndex = prev.tabs.findIndex(t => t.id === prev.activeTabId)
            const nextIndex = (currentIndex + 1) % prev.tabs.length
            return { ...prev, activeTabId: prev.tabs[nextIndex].id }
        })
    }, [])

    // 切换到上一个标签页
    const handlePrevTab = useCallback(() => {
        setData(prev => {
            const currentIndex = prev.tabs.findIndex(t => t.id === prev.activeTabId)
            const prevIndex = (currentIndex - 1 + prev.tabs.length) % prev.tabs.length
            return { ...prev, activeTabId: prev.tabs[prevIndex].id }
        })
    }, [])

    // 切换到指定索引的标签页
    const handleSwitchToTab = useCallback((index: number) => {
        setData(prev => {
            if (index >= 0 && index < prev.tabs.length) {
                return { ...prev, activeTabId: prev.tabs[index].id }
            }
            return prev
        })
    }, [])

    // 刷新快捷键配置
    const refreshShortcuts = useCallback(() => {
        setShortcuts(loadShortcuts())
    }, [])

    // 处理语言切换，更新默认命名的标签页
    const handleLanguageChange = useCallback((lang: string) => {
        // 使用 i18n 的 lng 选项获取不同语言的默认名称
        const zhDefault = t('tabBar.newPage', { lng: 'zh' })
        const enDefault = t('tabBar.newPage', { lng: 'en' })
        const defaultNames = [zhDefault, enDefault]

        // 获取新语言的默认名称
        const newDefaultName = t('tabBar.newPage', { lng: lang })

        setData(prev => ({
            ...prev,
            tabs: prev.tabs.map(tab =>
                defaultNames.includes(tab.title)
                    ? { ...tab, title: newDefaultName }
                    : tab
            )
        }))
    }, [t])

    // 键盘快捷键
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 自定义快捷键：新建标签页
            if (matchShortcut(e, shortcuts.newTab)) {
                e.preventDefault()
                handleTabAdd()
                return
            }

            // 自定义快捷键：关闭标签页
            if (matchShortcut(e, shortcuts.closeTab)) {
                e.preventDefault()
                if (data.tabs.length > 1) {
                    handleTabClose(data.activeTabId)
                }
                return
            }

            // 固定快捷键：Ctrl+, 打开设置
            if (e.ctrlKey && e.key === ',') {
                e.preventDefault()
                setShowSettings(prev => !prev)
                return
            }

            // 固定快捷键：Ctrl+Tab 切换到下一个标签页
            if (e.ctrlKey && e.key === 'Tab') {
                e.preventDefault()
                if (e.shiftKey) {
                    handlePrevTab()
                } else {
                    handleNextTab()
                }
                return
            }

            // 固定快捷键：Ctrl+1~9 切换到指定标签页
            if (e.ctrlKey && !e.altKey && !e.shiftKey) {
                const num = parseInt(e.key)
                if (num >= 1 && num <= 9) {
                    e.preventDefault()
                    handleSwitchToTab(num - 1)
                    return
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [data.tabs.length, data.activeTabId, shortcuts, handleTabAdd, handleTabClose, handleNextTab, handlePrevTab, handleSwitchToTab])

    // 重命名标签页
    const handleTabRename = (id: string, newTitle: string) => {
        setData(prev => ({
            ...prev,
            tabs: prev.tabs.map(t =>
                t.id === id ? { ...t, title: newTitle, updatedAt: Date.now() } : t
            )
        }))
    }

    // 更新标签页内容
    const handleContentChange = (content: string) => {
        setData(prev => ({
            ...prev,
            tabs: prev.tabs.map(t =>
                t.id === prev.activeTabId
                    ? { ...t, content, updatedAt: Date.now() }
                    : t
            )
        }))
    }

    // 字符统计
    const charCount = activeTab?.content.length || 0
    const lineCount = activeTab?.content.split('\n').length || 1

    return (
        <div className="app">
            <TitleBar />
            <header className="app-header">
                <TabBar
                    tabs={data.tabs}
                    activeTabId={data.activeTabId}
                    onTabClick={handleTabClick}
                    onTabClose={handleTabClose}
                    onTabAdd={handleTabAdd}
                    onTabRename={handleTabRename}
                />
                <button className="settings-btn" onClick={() => setShowSettings(true)}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z" />
                        <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z" />
                    </svg>
                </button>
            </header>
            <main className="app-main">
                {activeTab && (
                    <Editor
                        key={activeTab.id}
                        content={activeTab.content}
                        onChange={handleContentChange}
                        font={editorFont}
                        autoFocus
                    />
                )}
            </main>
            <StatusBar
                lineCount={lineCount}
                charCount={charCount}
                settings={statusBarSettings}
                onSettingsChange={setStatusBarSettings}
            />
            <Settings
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                onShortcutsChange={refreshShortcuts}
                onFontChange={setCurrentFont}
                onEditorFontChange={setEditorFont}
                onLanguageChange={handleLanguageChange}
            />
        </div>
    )
}

export default App

