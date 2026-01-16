import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Tab, ClosedTab, ArchivedTab } from '../utils/storage'
import './TabSearchModal.css'

interface TabSearchModalProps {
    isOpen: boolean
    onClose: () => void
    tabs: Tab[]
    archivedTabs: ArchivedTab[]
    closedTabs: ClosedTab[]
    onSelectTab: (tab: Tab) => void
    onRestoreArchived: (tab: ArchivedTab) => void
    onRestoreClosed: (tab: ClosedTab) => void
}

interface SearchResult {
    tab: Tab | ArchivedTab | ClosedTab
    type: 'active' | 'archived' | 'closed'
    matchTitle: boolean
    matchContent: boolean
}

export function TabSearchModal({
    isOpen,
    onClose,
    tabs,
    archivedTabs,
    closedTabs,
    onSelectTab,
    onRestoreArchived,
    onRestoreClosed
}: TabSearchModalProps) {
    const { t } = useTranslation()
    const [query, setQuery] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)

    // 聚焦输入框
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus()
            setQuery('')
            setSelectedIndex(0)
        }
    }, [isOpen])

    // 搜索结果
    const results = useMemo((): SearchResult[] => {
        const searchResults: SearchResult[] = []
        const lowerQuery = query.toLowerCase().trim()

        // 如果没有搜索词，显示所有标签页
        const shouldMatch = lowerQuery.length > 0

        // 搜索普通标签页
        tabs.forEach(tab => {
            const matchTitle = shouldMatch ? tab.title.toLowerCase().includes(lowerQuery) : true
            const matchContent = shouldMatch ? tab.content.toLowerCase().includes(lowerQuery) : false
            if (!shouldMatch || matchTitle || matchContent) {
                searchResults.push({ tab, type: 'active', matchTitle, matchContent })
            }
        })

        // 搜索归档标签页
        archivedTabs.forEach(tab => {
            const matchTitle = shouldMatch ? tab.title.toLowerCase().includes(lowerQuery) : true
            const matchContent = shouldMatch ? tab.content.toLowerCase().includes(lowerQuery) : false
            if (!shouldMatch || matchTitle || matchContent) {
                searchResults.push({ tab, type: 'archived', matchTitle, matchContent })
            }
        })

        // 搜索回收站标签页
        closedTabs.forEach(tab => {
            const matchTitle = shouldMatch ? tab.title.toLowerCase().includes(lowerQuery) : true
            const matchContent = shouldMatch ? tab.content.toLowerCase().includes(lowerQuery) : false
            if (!shouldMatch || matchTitle || matchContent) {
                searchResults.push({ tab, type: 'closed', matchTitle, matchContent })
            }
        })

        return searchResults
    }, [query, tabs, archivedTabs, closedTabs])

    // 重置选中索引
    useEffect(() => {
        setSelectedIndex(0)
    }, [query])

    // 滚动到选中项
    useEffect(() => {
        if (listRef.current) {
            const selectedItem = listRef.current.querySelector('.search-result-item.selected')
            if (selectedItem) {
                selectedItem.scrollIntoView({ block: 'nearest' })
            }
        }
    }, [selectedIndex])

    // 键盘导航
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIndex(prev => Math.max(prev - 1, 0))
        } else if (e.key === 'Enter') {
            e.preventDefault()
            if (results[selectedIndex]) {
                handleSelect(results[selectedIndex])
            }
        } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
        }
    }

    // 选择结果
    const handleSelect = (result: SearchResult) => {
        if (result.type === 'active') {
            onSelectTab(result.tab as Tab)
        } else if (result.type === 'archived') {
            onRestoreArchived(result.tab as ArchivedTab)
        } else if (result.type === 'closed') {
            onRestoreClosed(result.tab as ClosedTab)
        }
        onClose()
    }

    // 获取类型标签
    const getTypeLabel = (type: 'active' | 'archived' | 'closed'): string => {
        switch (type) {
            case 'active': return t('search.activeTabs')
            case 'archived': return t('search.archivedTabs')
            case 'closed': return t('search.closedTabs')
        }
    }

    // 获取类型颜色类
    const getTypeClass = (type: 'active' | 'archived' | 'closed'): string => {
        return `type-${type}`
    }

    // 获取内容预览
    const getContentPreview = (content: string): string => {
        const lines = content.split('\n').filter(line => line.trim())
        if (lines.length === 0) return ''
        const preview = lines[0].substring(0, 60)
        return preview.length < lines[0].length ? preview + '...' : preview
    }

    if (!isOpen) return null

    return (
        <div className="search-modal-overlay" onClick={onClose}>
            <div className="search-modal" onClick={e => e.stopPropagation()}>
                <div className="search-header">
                    <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input
                        ref={inputRef}
                        className="search-input"
                        type="text"
                        placeholder={t('search.placeholder')}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <kbd className="search-hint">ESC</kbd>
                </div>
                <div className="search-results" ref={listRef}>
                    {results.length === 0 ? (
                        <div className="search-empty">{t('search.noResults')}</div>
                    ) : (
                        results.map((result, index) => (
                            <div
                                key={`${result.type}-${result.tab.id}-${'archivedAt' in result.tab ? result.tab.archivedAt : ('closedAt' in result.tab ? result.tab.closedAt : result.tab.updatedAt)}`}
                                className={`search-result-item ${index === selectedIndex ? 'selected' : ''}`}
                                onClick={() => handleSelect(result)}
                                onMouseEnter={() => setSelectedIndex(index)}
                            >
                                <div className="search-result-main">
                                    <span className="search-result-title">{result.tab.title}</span>
                                    <span className={`search-result-type ${getTypeClass(result.type)}`}>
                                        {getTypeLabel(result.type)}
                                    </span>
                                </div>
                                {result.matchContent && result.tab.content && (
                                    <div className="search-result-preview">
                                        {getContentPreview(result.tab.content)}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
                <div className="search-footer">
                    <span><kbd>↑</kbd><kbd>↓</kbd> {t('search.navigate')}</span>
                    <span><kbd>Enter</kbd> {t('search.select')}</span>
                </div>
            </div>
        </div>
    )
}
