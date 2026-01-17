import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Editor } from './components/Editor'
import { TabBar } from './components/TabBar'
import { Sidebar } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { Settings } from './components/Settings'
import { StatusBar } from './components/StatusBar'
import { TabSearchModal } from './components/TabSearchModal'
import { loadData, saveData, createTab, AppData, loadShortcuts, ShortcutSettings, matchShortcut, loadStatusBar, StatusBarSettings, loadFont, loadEditorFont, saveClosedTab, popClosedTab, loadClosedTabs, ClosedTab, ArchivedTab, loadArchivedTabs, saveArchivedTab, removeArchivedTab, clearArchivedTabs, ZenModeSettings, loadZenMode, saveZenMode } from './utils/storage'
import './styles/App.css'

function App() {
    const { t } = useTranslation()
    const [data, setData] = useState<AppData>(() => loadData())
    const [shortcuts, setShortcuts] = useState<ShortcutSettings>(() => loadShortcuts())
    const [statusBarSettings, setStatusBarSettings] = useState<StatusBarSettings>(() => loadStatusBar())
    const [showSettings, setShowSettings] = useState(false)
    const [showSearch, setShowSearch] = useState(false)
    const [currentFont, setCurrentFont] = useState(() => loadFont())
    const [editorFont, setEditorFont] = useState(() => loadEditorFont())
    const [closedTabs, setClosedTabs] = useState<ClosedTab[]>(() => loadClosedTabs())
    const [archivedTabs, setArchivedTabs] = useState<ArchivedTab[]>(() => loadArchivedTabs())
    const [zenModeSettings, setZenModeSettings] = useState<ZenModeSettings>(() => loadZenMode())
    const [isImmersive, setIsImmersive] = useState(false)
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const immersiveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const lastPointerRef = useRef<{ x: number; y: number; t: number } | null>(null)
    const pointerAccumRef = useRef(0)

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
            // 找到要关闭的标签页和其位置
            const tabIndex = prev.tabs.findIndex(t => t.id === id)
            const tabToClose = prev.tabs[tabIndex]
            if (tabToClose) {
                saveClosedTab(tabToClose, tabIndex)
                // 刷新回收站列表
                setClosedTabs(loadClosedTabs())
            }
            const newTabs = prev.tabs.filter(t => t.id !== id)
            const newActiveId = prev.activeTabId === id
                ? newTabs[newTabs.length - 1]?.id || ''
                : prev.activeTabId
            return { tabs: newTabs, activeTabId: newActiveId }
        })
    }, [])

    // 添加标签页
    const handleTabAdd = useCallback(() => {
        const baseName = t('tabBar.newPage')
        // 生成唯一名称
        let newName = baseName
        let counter = 1
        setData(prev => {
            const existingNames = new Set(prev.tabs.map(tab => tab.title))
            while (existingNames.has(newName)) {
                newName = `${baseName} ${counter}`
                counter++
            }
            const newTab = createTab(newName)
            return {
                tabs: [...prev.tabs, newTab],
                activeTabId: newTab.id
            }
        })
    }, [t])

    // 恢复关闭的标签页（快捷键）
    const handleReopenTab = useCallback(() => {
        const closedTab = popClosedTab()
        if (closedTab) {
            // 移除 closedAt 和 index 属性，恢复为普通 Tab
            const { closedAt, index, ...tab } = closedTab
            setData(prev => {
                const newTabs = [...prev.tabs]
                // 恢复到原位置，如果位置超出范围则放到末尾
                const insertIndex = Math.min(index, newTabs.length)
                newTabs.splice(insertIndex, 0, tab)
                return {
                    tabs: newTabs,
                    activeTabId: tab.id
                }
            })
            // 刷新回收站列表
            setClosedTabs(loadClosedTabs())
        }
    }, [])

    // 从回收站恢复指定标签页
    const handleRestoreFromTrash = useCallback((tab: ClosedTab) => {
        // 从回收站中移除该标签页
        const remaining = closedTabs.filter(t => !(t.id === tab.id && t.closedAt === tab.closedAt))
        localStorage.setItem('flashpad-closed-tabs', JSON.stringify(remaining))
        setClosedTabs(remaining)
        // 恢复标签页到原位置
        const { closedAt, index, ...restoredTab } = tab
        setData(prev => {
            const newTabs = [...prev.tabs]
            const insertIndex = Math.min(index, newTabs.length)
            newTabs.splice(insertIndex, 0, restoredTab)
            return {
                tabs: newTabs,
                activeTabId: restoredTab.id
            }
        })
    }, [closedTabs])

    // 清空回收站
    const handleClearTrash = useCallback(() => {
        localStorage.setItem('flashpad-closed-tabs', JSON.stringify([]))
        setClosedTabs([])
    }, [])

    // 从回收站删除单个标签页
    const handleDeleteFromTrash = useCallback((tab: ClosedTab) => {
        const remaining = closedTabs.filter(t => !(t.id === tab.id && t.closedAt === tab.closedAt))
        localStorage.setItem('flashpad-closed-tabs', JSON.stringify(remaining))
        setClosedTabs(remaining)
    }, [closedTabs])

    // 归档标签页
    const handleArchiveTab = useCallback((id: string) => {
        setData(prev => {
            const tabToArchive = prev.tabs.find(t => t.id === id)
            if (tabToArchive) {
                saveArchivedTab(tabToArchive)
                setArchivedTabs(loadArchivedTabs())
            }
            const newTabs = prev.tabs.filter(t => t.id !== id)
            // 如果归档的是当前激活的标签页，切换到最后一个
            const newActiveId = prev.activeTabId === id
                ? newTabs[newTabs.length - 1]?.id || ''
                : prev.activeTabId
            return { tabs: newTabs, activeTabId: newActiveId }
        })
    }, [])

    // 从归档恢复标签页
    const handleRestoreFromArchive = useCallback((tab: ArchivedTab) => {
        const remaining = removeArchivedTab(tab)
        setArchivedTabs(remaining)
        // 恢复标签页
        const { archivedAt, ...restoredTab } = tab
        setData(prev => ({
            tabs: [...prev.tabs, restoredTab],
            activeTabId: restoredTab.id
        }))
    }, [])

    // 从归档删除标签页
    const handleDeleteFromArchive = useCallback((tab: ArchivedTab) => {
        const remaining = removeArchivedTab(tab)
        setArchivedTabs(remaining)
    }, [])

    // 清空归档
    const handleClearArchive = useCallback(() => {
        clearArchivedTabs()
        setArchivedTabs([])
    }, [])

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
        // 需要处理 newPage（新建页）和 defaultPage（默认页）两种情况
        const zhNewPage = t('tabBar.newPage', { lng: 'zh' })
        const enNewPage = t('tabBar.newPage', { lng: 'en' })
        const zhDefaultPage = t('tabBar.defaultPage', { lng: 'zh' })
        const enDefaultPage = t('tabBar.defaultPage', { lng: 'en' })
        // 还需要包含硬编码的初始值 'New Page'（storage.ts 中的默认值）
        const defaultNames = [zhNewPage, enNewPage, zhDefaultPage, enDefaultPage, 'New Page']

        // 获取新语言的默认名称（使用 newPage 作为新标签的名称）
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

            // 自定义快捷键：恢复关闭的标签页
            if (matchShortcut(e, shortcuts.reopenTab)) {
                e.preventDefault()
                handleReopenTab()
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

            // 自定义快捷键：搜索标签页
            if (matchShortcut(e, shortcuts.searchTabs)) {
                e.preventDefault()
                setShowSearch(true)
                return
            }

            // 自定义快捷键：归档当前标签页
            if (matchShortcut(e, shortcuts.archiveTab)) {
                e.preventDefault()
                if (data.activeTabId) {
                    handleArchiveTab(data.activeTabId)
                }
                return
            }

            // 固定快捷键：Ctrl+\ 切换侧边栏
            if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key === '\\') {
                e.preventDefault()
                setZenModeSettings(prev => {
                    const newSettings = { ...prev, sidebarVisible: !prev.sidebarVisible }
                    saveZenMode(newSettings)
                    return newSettings
                })
                return
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [data.tabs.length, data.activeTabId, shortcuts, handleTabAdd, handleTabClose, handleReopenTab, handleNextTab, handlePrevTab, handleSwitchToTab, handleArchiveTab])

    // 重命名标签页
    const handleTabRename = (id: string, newTitle: string) => {
        setData(prev => ({
            ...prev,
            tabs: prev.tabs.map(t =>
                t.id === id ? { ...t, title: newTitle, updatedAt: Date.now() } : t
            )
        }))
    }

    // 标签页拖拽重新排序
    const handleTabReorder = useCallback((fromIndex: number, toIndex: number) => {
        setData(prev => {
            const newTabs = [...prev.tabs]
            const [movedTab] = newTabs.splice(fromIndex, 1)
            newTabs.splice(toIndex, 0, movedTab)
            return { ...prev, tabs: newTabs }
        })
    }, [])

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

    // 沉浸模式处理：编辑器活动回调
    const handleEditorActivity = useCallback((type: 'typing') => {
        if (!zenModeSettings.enabled) return

        if (type === 'typing') {
            setIsImmersive(true)
        }
    }, [zenModeSettings.enabled])

    // 指针水平移动退出沉浸模式（需要明确的水平移动意图）
    useEffect(() => {
        if (!isImmersive) return

        const POINTER_STEP_MIN = 4
        const POINTER_INTENT_THRESHOLD = 90
        const POINTER_RESET_MS = 250

        const handlePointerMove = (e: PointerEvent | MouseEvent) => {
            const prev = lastPointerRef.current
            const now = Date.now()
            if (!prev) {
                lastPointerRef.current = { x: e.clientX, y: e.clientY, t: now }
                pointerAccumRef.current = 0
                return
            }

            const dx = e.clientX - prev.x
            const dy = e.clientY - prev.y
            const dt = now - prev.t
            lastPointerRef.current = { x: e.clientX, y: e.clientY, t: now }

            if (dt > POINTER_RESET_MS) {
                pointerAccumRef.current = 0
            }

            const absDx = Math.abs(dx)
            const absDy = Math.abs(dy)
            if (absDx <= absDy || absDx < POINTER_STEP_MIN) {
                if (absDy > absDx && pointerAccumRef.current > 0) {
                    pointerAccumRef.current = 0
                }
                return
            }

            pointerAccumRef.current += absDx
            if (pointerAccumRef.current >= POINTER_INTENT_THRESHOLD) {
                pointerAccumRef.current = 0
                setIsImmersive(false)
            }
        }

        window.addEventListener('pointermove', handlePointerMove, { passive: true })
        window.addEventListener('mousemove', handlePointerMove, { passive: true })
        return () => {
            lastPointerRef.current = null
            pointerAccumRef.current = 0
            window.removeEventListener('pointermove', handlePointerMove)
            window.removeEventListener('mousemove', handlePointerMove)
        }
    }, [isImmersive])

    // 字符统计
    const charCount = activeTab?.content.length || 0
    const lineCount = activeTab?.content.split('\n').length || 1

    return (
        <div className={`app with-sidebar ${isImmersive ? 'immersive' : ''}`}>
            <TitleBar
                onOpenSettings={() => setShowSettings(true)}
                onOpenSearch={() => setShowSearch(true)}
            />
            <div className="app-body">
                {zenModeSettings.sidebarVisible && (
                    <Sidebar
                        tabs={data.tabs}
                        activeTabId={data.activeTabId}
                        onTabClick={handleTabClick}
                        onTabClose={handleTabClose}
                        onTabAdd={handleTabAdd}
                        onTabRename={handleTabRename}
                        onTabReorder={handleTabReorder}
                        onTabArchive={handleArchiveTab}
                        closedTabs={closedTabs}
                        onRestoreFromTrash={handleRestoreFromTrash}
                        onDeleteFromTrash={handleDeleteFromTrash}
                        onClearTrash={handleClearTrash}
                        archivedTabs={archivedTabs}
                        onRestoreFromArchive={handleRestoreFromArchive}
                        onDeleteFromArchive={handleDeleteFromArchive}
                        onClearArchive={handleClearArchive}
                    />
                )}
                <main className="app-main">
                    {activeTab && (
                        <Editor
                            key={`${activeTab.id}-${editorFont}`}
                            content={activeTab.content}
                            onChange={handleContentChange}
                            onActivity={handleEditorActivity}
                            font={editorFont}
                            autoFocus
                        />
                    )}
                </main>
            </div>
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
                zenModeEnabled={zenModeSettings.enabled}
                onZenModeChange={(enabled) => {
                    setZenModeSettings(prev => {
                        const newSettings = { ...prev, enabled }
                        saveZenMode(newSettings)
                        return newSettings
                    })
                }}
            />
            <TabSearchModal
                isOpen={showSearch}
                onClose={() => setShowSearch(false)}
                tabs={data.tabs}
                archivedTabs={archivedTabs}
                closedTabs={closedTabs}
                onSelectTab={(tab) => {
                    setData(prev => ({ ...prev, activeTabId: tab.id }))
                    setShowSearch(false)
                }}
                onRestoreArchived={(tab) => {
                    handleRestoreFromArchive(tab)
                    setShowSearch(false)
                }}
                onRestoreClosed={(tab) => {
                    handleRestoreFromTrash(tab)
                    setShowSearch(false)
                }}
            />
        </div>
    )
}

export default App



