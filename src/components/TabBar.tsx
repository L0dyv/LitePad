import { Tab } from '../utils/storage'
import './TabBar.css'

interface TabBarProps {
    tabs: Tab[]
    activeTabId: string
    onTabClick: (id: string) => void
    onTabClose: (id: string) => void
    onTabAdd: () => void
    onTabRename: (id: string, newTitle: string) => void
}

export function TabBar({ tabs, activeTabId, onTabClick, onTabClose, onTabAdd, onTabRename }: TabBarProps) {
    const handleDoubleClick = (tab: Tab) => {
        const newTitle = prompt('重命名标签页', tab.title)
        if (newTitle && newTitle.trim()) {
            onTabRename(tab.id, newTitle.trim())
        }
    }

    const handleClose = (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        if (tabs.length > 1) {
            onTabClose(id)
        }
    }

    return (
        <div className="tab-bar">
            {tabs.map((tab) => (
                <div
                    key={tab.id}
                    className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
                    onClick={() => onTabClick(tab.id)}
                    onDoubleClick={() => handleDoubleClick(tab)}
                >
                    <span className="tab-title">{tab.title}</span>
                    {tabs.length > 1 && (
                        <button
                            className="tab-close"
                            onClick={(e) => handleClose(e, tab.id)}
                        >
                            ×
                        </button>
                    )}
                </div>
            ))}
            <button className="tab-add" onClick={onTabAdd}>+</button>
        </div>
    )
}
