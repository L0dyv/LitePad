import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Tab, ClosedTab, ArchivedTab } from '../utils/storage'
import { ConfirmDialog } from './ConfirmDialog'
import './TabSearchModal.css'

export type ModalTab = 'active' | 'archived' | 'closed'

interface TabSearchModalProps {
    isOpen: boolean
    onClose: () => void
    defaultTab?: ModalTab
    tabs: Tab[]
    archivedTabs: ArchivedTab[]
    closedTabs: ClosedTab[]
    onSelectTab: (tab: Tab) => void
    onRestoreArchived: (tab: ArchivedTab) => void
    onRestoreClosed: (tab: ClosedTab) => void
    onDeleteArchived?: (tab: ArchivedTab) => void
    onDeleteClosed?: (tab: ClosedTab) => void
    onClearArchive?: () => void
    onClearTrash?: () => void
}

interface SearchResult {
    tab: Tab | ArchivedTab | ClosedTab
    type: ModalTab
    matchTitle: boolean
    matchContent: boolean
}

export function TabSearchModal({
    isOpen,
    onClose,
    defaultTab = 'active',
    tabs,
    archivedTabs,
    closedTabs,
    onSelectTab,
    onRestoreArchived,
    onRestoreClosed,
    onDeleteArchived,
    onDeleteClosed,
    onClearArchive,
    onClearTrash
}: TabSearchModalProps) {
    const { t } = useTranslation()
    const [activeTab, setActiveTab] = useState<ModalTab>(defaultTab)
    const [query, setQuery] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [confirmDialog, setConfirmDialog] = useState<{
        type: 'clearArchive' | 'clearTrash' | 'deleteArchived' | 'deleteClosed'
        tab?: ArchivedTab | ClosedTab
    } | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)

    // 打开时设置默认 tab 并聚焦
    useEffect(() => {
        if (isOpen) {
            setActiveTab(defaultTab)
            setQuery('')
            setSelectedIndex(0)
            setTimeout(() => inputRef.current?.focus(), 0)
        }
    }, [isOpen, defaultTab])

    // 根据当前 tab 和搜索词过滤结果
    const results = useMemo((): SearchResult[] => {
        const searchResults: SearchResult[] = []
        const lowerQuery = query.toLowerCase().trim()
        const shouldMatch = lowerQuery.length > 0

        const filterTab = (tab: Tab | ArchivedTab | ClosedTab, type: ModalTab) => {
            const matchTitle = shouldMatch ? tab.title.toLowerCase().includes(lowerQuery) : true
            const matchContent = shouldMatch ? tab.content.toLowerCase().includes(lowerQuery) : false
            if (!shouldMatch || matchTitle || matchContent) {
                searchResults.push({ tab, type, matchTitle, matchContent })
            }
        }

        if (activeTab === 'active') {
            tabs.forEach(tab => filterTab(tab, 'active'))
        } else if (activeTab === 'archived') {
            archivedTabs.forEach(tab => filterTab(tab, 'archived'))
        } else if (activeTab === 'closed') {
            closedTabs.forEach(tab => filterTab(tab, 'closed'))
        }

        return searchResults
    }, [query, tabs, archivedTabs, closedTabs, activeTab])

    // 重置选中索引
    useEffect(() => {
        setSelectedIndex(0)
    }, [query, activeTab])

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
            onClose()
        } else if (result.type === 'archived') {
            onRestoreArchived(result.tab as ArchivedTab)
        } else if (result.type === 'closed') {
            onRestoreClosed(result.tab as ClosedTab)
        }
    }

    // 删除项目
    const handleDelete = (e: React.MouseEvent, result: SearchResult) => {
        e.stopPropagation()
        if (result.type === 'archived') {
            setConfirmDialog({ type: 'deleteArchived', tab: result.tab as ArchivedTab })
        } else if (result.type === 'closed') {
            setConfirmDialog({ type: 'deleteClosed', tab: result.tab as ClosedTab })
        }
    }

    // 清空
    const handleClear = () => {
        if (activeTab === 'archived') {
            setConfirmDialog({ type: 'clearArchive' })
        } else if (activeTab === 'closed') {
            setConfirmDialog({ type: 'clearTrash' })
        }
    }

    // 确认对话框处理
    const handleConfirm = () => {
        if (confirmDialog?.type === 'clearArchive') {
            onClearArchive?.()
        } else if (confirmDialog?.type === 'clearTrash') {
            onClearTrash?.()
        } else if (confirmDialog?.type === 'deleteArchived' && confirmDialog.tab) {
            onDeleteArchived?.(confirmDialog.tab as ArchivedTab)
        } else if (confirmDialog?.type === 'deleteClosed' && confirmDialog.tab) {
            onDeleteClosed?.(confirmDialog.tab as ClosedTab)
        }
        setConfirmDialog(null)
    }

    // 获取内容预览
    const getContentPreview = (content: string): string => {
        const lines = content.split('\n').filter(line => line.trim())
        if (lines.length === 0) return ''
        const preview = lines[0].substring(0, 60)
        return preview.length < lines[0].length ? preview + '...' : preview
    }

    // 格式化时间
    const formatTimeAgo = (timestamp: number): string => {
        const diff = Date.now() - timestamp
        const minutes = Math.floor(diff / 60000)
        const hours = Math.floor(diff / 3600000)
        const days = Math.floor(diff / 86400000)

        if (minutes < 1) return t('trash.justNow')
        if (minutes < 60) return t('trash.minutesAgo', { count: minutes })
        if (hours < 24) return t('trash.hoursAgo', { count: hours })
        return t('trash.daysAgo', { count: days })
    }

    // 获取当前列表是否为空
    const getCurrentListEmpty = () => {
        if (activeTab === 'active') return tabs.length === 0
        if (activeTab === 'archived') return archivedTabs.length === 0
        if (activeTab === 'closed') return closedTabs.length === 0
        return true
    }

    // 获取空状态提示
    const getEmptyMessage = () => {
        if (query.trim()) return t('search.noResults')
        if (activeTab === 'archived') return t('archive.empty')
        if (activeTab === 'closed') return t('trash.empty')
        return t('search.noResults')
    }

    if (!isOpen) return null

    return (
        <>
            <div className="search-modal-overlay" onClick={onClose}>
                <div className="search-modal" onClick={e => e.stopPropagation()}>
                    {/* Tab 切换 */}
                    <div className="search-tabs">
                        <button
                            className={`search-tab ${activeTab === 'active' ? 'active' : ''}`}
                            onClick={() => setActiveTab('active')}
                        >
                            {t('search.activeTabs')}
                            <span className="search-tab-count">{tabs.length}</span>
                        </button>
                        <button
                            className={`search-tab ${activeTab === 'archived' ? 'active' : ''}`}
                            onClick={() => setActiveTab('archived')}
                        >
                            {t('search.archivedTabs')}
                            <span className="search-tab-count">{archivedTabs.length}</span>
                        </button>
                        <button
                            className={`search-tab ${activeTab === 'closed' ? 'active' : ''}`}
                            onClick={() => setActiveTab('closed')}
                        >
                            {t('search.closedTabs')}
                            <span className="search-tab-count">{closedTabs.length}</span>
                        </button>
                    </div>

                    {/* 搜索框 */}
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

                    {/* 结果列表 */}
                    <div className="search-results" ref={listRef}>
                        {results.length === 0 ? (
                            <div className="search-empty">{getEmptyMessage()}</div>
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
                                        {activeTab !== 'active' && (
                                            <span className="search-result-time">
                                                {formatTimeAgo('archivedAt' in result.tab ? result.tab.archivedAt : (result.tab as ClosedTab).closedAt)}
                                            </span>
                                        )}
                                        {activeTab !== 'active' && (
                                            <div className="search-result-actions">
                                                <button
                                                    className="search-result-action restore"
                                                    title={activeTab === 'archived' ? t('archive.restoreTooltip') : t('trash.restoreTooltip')}
                                                    onClick={(e) => { e.stopPropagation(); handleSelect(result) }}
                                                >
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="1 4 1 10 7 10"></polyline>
                                                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                                                    </svg>
                                                </button>
                                                <button
                                                    className="search-result-action delete"
                                                    title={activeTab === 'archived' ? t('archive.deleteTooltip') : t('trash.deleteTooltip')}
                                                    onClick={(e) => handleDelete(e, result)}
                                                >
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                                    </svg>
                                                </button>
                                            </div>
                                        )}
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

                    {/* 底部操作栏 */}
                    <div className="search-footer">
                        <div className="search-footer-left">
                            <span><kbd>↑</kbd><kbd>↓</kbd> {t('search.navigate')}</span>
                            <span><kbd>Enter</kbd> {t('search.select')}</span>
                        </div>
                        {activeTab !== 'active' && !getCurrentListEmpty() && (
                            <button className="search-clear-btn" onClick={handleClear}>
                                {activeTab === 'archived' ? t('archive.clear') : t('trash.clear')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
            <ConfirmDialog
                isOpen={confirmDialog !== null}
                title={
                    confirmDialog?.type === 'clearArchive' ? t('archive.clearTitle') :
                        confirmDialog?.type === 'clearTrash' ? t('trash.clearTitle') :
                            confirmDialog?.type === 'deleteArchived' ? t('archive.deleteTitle') :
                                t('trash.deleteTitle')
                }
                message={
                    confirmDialog?.type === 'clearArchive' ? t('archive.clearMessage') :
                        confirmDialog?.type === 'clearTrash' ? t('trash.clearMessage') :
                            confirmDialog?.type === 'deleteArchived' ? t('archive.deleteMessage', { name: confirmDialog?.tab?.title }) :
                                t('trash.deleteMessage', { name: confirmDialog?.tab?.title })
                }
                onConfirm={handleConfirm}
                onCancel={() => setConfirmDialog(null)}
            />
        </>
    )
}
