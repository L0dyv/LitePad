import { useState, useRef, useEffect } from 'react'
import { Tab } from '../utils/storage'
import { ContextMenu, MenuItem } from './ContextMenu'
import './TabBar.css'

interface TabBarProps {
    tabs: Tab[]
    activeTabId: string
    onTabClick: (id: string) => void
    onTabClose: (id: string) => void
    onTabAdd: () => void
    onTabRename: (id: string, newTitle: string) => void
}

interface ContextMenuState {
    visible: boolean
    x: number
    y: number
    tabId: string | null
}

export function TabBar({ tabs, activeTabId, onTabClick, onTabClose, onTabAdd, onTabRename }: TabBarProps) {
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editValue, setEditValue] = useState('')
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({
        visible: false,
        x: 0,
        y: 0,
        tabId: null
    })
    const inputRef = useRef<HTMLInputElement>(null)

    // 当进入编辑模式时，聚焦输入框
    useEffect(() => {
        if (editingId && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [editingId])

    const handleDoubleClick = (tab: Tab) => {
        setEditingId(tab.id)
        setEditValue(tab.title)
    }

    const handleRenameConfirm = (id: string) => {
        if (editValue.trim()) {
            onTabRename(id, editValue.trim())
        }
        setEditingId(null)
        setEditValue('')
    }

    const handleRenameCancel = () => {
        setEditingId(null)
        setEditValue('')
    }

    const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleRenameConfirm(id)
        } else if (e.key === 'Escape') {
            e.preventDefault()
            handleRenameCancel()
        }
    }

    const handleClose = (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        if (tabs.length > 1) {
            onTabClose(id)
        }
    }

    const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
        e.preventDefault()
        setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            tabId
        })
    }

    const closeContextMenu = () => {
        setContextMenu(prev => ({ ...prev, visible: false }))
    }

    const getContextMenuItems = (): MenuItem[] => {
        const tabId = contextMenu.tabId
        const tabIndex = tabs.findIndex(t => t.id === tabId)
        const tab = tabs.find(t => t.id === tabId)

        if (!tab) return []

        const items: MenuItem[] = [
            {
                label: '重命名',
                onClick: () => {
                    setEditingId(tab.id)
                    setEditValue(tab.title)
                }
            }
        ]

        if (tabs.length > 1) {
            items.push({
                label: '关闭',
                onClick: () => onTabClose(tab.id)
            })

            // 关闭右侧标签页
            if (tabIndex < tabs.length - 1) {
                items.push({
                    label: '关闭右侧标签页',
                    onClick: () => {
                        tabs.slice(tabIndex + 1).forEach(t => onTabClose(t.id))
                    }
                })
            }

            // 关闭其他标签页
            items.push({
                label: '关闭其他标签页',
                onClick: () => {
                    tabs.filter(t => t.id !== tab.id).forEach(t => onTabClose(t.id))
                }
            })
        }

        return items
    }

    return (
        <>
            <div className="tab-bar">
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
                        onClick={() => editingId !== tab.id && onTabClick(tab.id)}
                        onDoubleClick={() => handleDoubleClick(tab)}
                        onContextMenu={(e) => handleContextMenu(e, tab.id)}
                    >
                        {editingId === tab.id ? (
                            <input
                                ref={inputRef}
                                className="tab-rename-input"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, tab.id)}
                                onBlur={() => handleRenameConfirm(tab.id)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <span className="tab-title">{tab.title}</span>
                        )}
                        {tabs.length > 1 && editingId !== tab.id && (
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

