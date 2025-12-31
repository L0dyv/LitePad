import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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
    onTabReorder?: (fromIndex: number, toIndex: number) => void
}

interface ContextMenuState {
    visible: boolean
    x: number
    y: number
    tabId: string | null
}

export function TabBar({ tabs, activeTabId, onTabClick, onTabClose, onTabAdd, onTabRename, onTabReorder }: TabBarProps) {
    const { t } = useTranslation()
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editValue, setEditValue] = useState('')
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({
        visible: false,
        x: 0,
        y: 0,
        tabId: null
    })
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
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

    // 拖拽排序相关处理
    const handleDragStart = (e: React.DragEvent, index: number) => {
        // 编辑模式下不允许拖拽
        if (editingId) {
            e.preventDefault()
            return
        }
        setDraggedIndex(index)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', index.toString())
    }

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (draggedIndex !== null && draggedIndex !== index) {
            setDragOverIndex(index)
        }
    }

    const handleDragLeave = () => {
        setDragOverIndex(null)
    }

    const handleDrop = (e: React.DragEvent, toIndex: number) => {
        e.preventDefault()
        if (draggedIndex !== null && draggedIndex !== toIndex && onTabReorder) {
            onTabReorder(draggedIndex, toIndex)
        }
        setDraggedIndex(null)
        setDragOverIndex(null)
    }

    const handleDragEnd = () => {
        setDraggedIndex(null)
        setDragOverIndex(null)
    }

    const getContextMenuItems = (): MenuItem[] => {
        const tabId = contextMenu.tabId
        const tabIndex = tabs.findIndex(t => t.id === tabId)
        const tab = tabs.find(t => t.id === tabId)

        if (!tab) return []

        const items: MenuItem[] = [
            {
                label: t('tabBar.rename'),
                onClick: () => {
                    setEditingId(tab.id)
                    setEditValue(tab.title)
                }
            }
        ]

        if (tabs.length > 1) {
            items.push({
                label: t('tabBar.close'),
                onClick: () => onTabClose(tab.id)
            })

            // 关闭右侧标签页
            if (tabIndex < tabs.length - 1) {
                items.push({
                    label: t('tabBar.closeRight'),
                    onClick: () => {
                        tabs.slice(tabIndex + 1).forEach(t => onTabClose(t.id))
                    }
                })
            }

            // 关闭其他标签页
            items.push({
                label: t('tabBar.closeOthers'),
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
                {tabs.map((tab, index) => (
                    <div
                        key={tab.id}
                        className={`tab ${tab.id === activeTabId ? 'active' : ''}${draggedIndex === index ? ' dragging' : ''}${dragOverIndex === index ? ' drag-over' : ''}`}
                        draggable={editingId !== tab.id}
                        onClick={() => editingId !== tab.id && onTabClick(tab.id)}
                        onDoubleClick={() => handleDoubleClick(tab)}
                        onContextMenu={(e) => handleContextMenu(e, tab.id)}
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={handleDragEnd}
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
