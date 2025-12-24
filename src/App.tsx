import { useState, useEffect, useCallback, useRef } from 'react'
import { Editor } from './components/Editor'
import { TabBar } from './components/TabBar'
import { TitleBar } from './components/TitleBar'
import { loadData, saveData, createTab, AppData } from './utils/storage'
import './styles/App.css'

function App() {
    const [data, setData] = useState<AppData>(() => loadData())
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
        </div>
    )
}

export default App
