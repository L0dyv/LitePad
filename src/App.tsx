import { useState, useEffect, useCallback, useRef } from 'react'
import { Editor } from './components/Editor'
import { TabBar } from './components/TabBar'
import { TitleBar } from './components/TitleBar'
import { Settings } from './components/Settings'
import { loadData, saveData, createTab, AppData } from './utils/storage'
import './styles/App.css'

function App() {
    const [data, setData] = useState<AppData>(() => loadData())
    const [showSettings, setShowSettings] = useState(false)
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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
    const handleTabClose = (id: string) => {
        setData(prev => {
            const newTabs = prev.tabs.filter(t => t.id !== id)
            const newActiveId = prev.activeTabId === id
                ? newTabs[newTabs.length - 1]?.id || ''
                : prev.activeTabId
            return { tabs: newTabs, activeTabId: newActiveId }
        })
    }

    // 添加标签页
    const handleTabAdd = () => {
        const newTab = createTab()
        setData(prev => ({
            tabs: [...prev.tabs, newTab],
            activeTabId: newTab.id
        }))
    }

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
                        autoFocus
                    />
                )}
            </main>
            <footer className="app-footer">
                <span className="status">就绪 | Ctrl+Enter 计算</span>
                <span className="char-count">{lineCount} 行 | {charCount} 字符</span>
            </footer>
            <Settings isOpen={showSettings} onClose={() => setShowSettings(false)} />
        </div>
    )
}

export default App
