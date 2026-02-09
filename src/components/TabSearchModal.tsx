import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw, Search, X } from 'lucide-react'
import { Tab, ClosedTab, ArchivedTab } from '../utils/storage'
import { isSubsequence, toPinyinInitials } from '../utils/pinyin'
import { useVirtualList } from '../hooks/useVirtualList'
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
    onSelectTab: (tab: Tab, jumpTo?: JumpTarget) => void
    onRestoreArchived: (tab: ArchivedTab, jumpTo?: JumpTarget) => void
    onRestoreClosed: (tab: ClosedTab, jumpTo?: JumpTarget) => void
    onDeleteArchived?: (tab: ArchivedTab) => void
    onDeleteClosed?: (tab: ClosedTab) => void
    onClearArchive?: () => void
    onClearTrash?: () => void
}

export interface JumpTarget {
    query: string
    occurrence: number
    matchLength: number
    snippet?: string
    line?: number
    column?: number
}

interface SearchResult {
    tab: Tab | ArchivedTab | ClosedTab
    type: ModalTab
    kind: 'tab' | 'title' | 'content'
    jumpTo?: JumpTarget
    titleHighlight?: { from: number; to: number }
    preview?: { text: string; matchStart: number; matchEnd: number }
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
    const [debouncedQuery, setDebouncedQuery] = useState('')
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
            setDebouncedQuery('')
            setSelectedIndex(0)
            setTimeout(() => inputRef.current?.focus(), 0)
        }
    }, [isOpen, defaultTab])

    useEffect(() => {
        const handle = window.setTimeout(() => setDebouncedQuery(query), 300)
        return () => window.clearTimeout(handle)
    }, [query])

    // 根据当前 tab 和搜索词过滤结果
    const results = useMemo((): SearchResult[] => {
        if (!isOpen) return []

        const searchResults: SearchResult[] = []
        const q = debouncedQuery.trim()
        const lowerQuery = q.toLowerCase()
        const hasQuery = lowerQuery.length > 0

        const MAX_RESULTS = 200
        const CONTEXT_CHARS = 30

        const sourceTabs = activeTab === 'active'
            ? tabs
            : activeTab === 'archived'
                ? archivedTabs
                : closedTabs

        if (!hasQuery) {
            sourceTabs.forEach((tab) => {
                searchResults.push({ tab, type: activeTab, kind: 'tab' })
            })
            return searchResults
        }

        for (const tab of sourceTabs) {
            if (searchResults.length >= MAX_RESULTS) break

            const titleLower = tab.title.toLowerCase()
            const titleIndex = titleLower.indexOf(lowerQuery)
            const compactQuery = lowerQuery.replace(/\s+/g, '')
            const titleInitials = compactQuery ? toPinyinInitials(tab.title) : ''
            const matchedByPinyin =
                compactQuery.length > 0 &&
                (titleInitials.includes(compactQuery) || isSubsequence(compactQuery, titleInitials))
            if (titleIndex !== -1 || matchedByPinyin) {
                searchResults.push({
                    tab,
                    type: activeTab,
                    kind: 'title',
                    titleHighlight: { from: 0, to: tab.title.length },
                })
            }

            const content = tab.content || ''
            const contentLower = content.toLowerCase()
            let startIndex = 0
            let scanIndex = 0
            let scanLine = 1
            let occurrence = 0
            while (searchResults.length < MAX_RESULTS) {
                const matchIndex = contentLower.indexOf(lowerQuery, startIndex)
                if (matchIndex === -1) break
                occurrence += 1

                while (scanIndex < matchIndex) {
                    const nextNewline = contentLower.indexOf('\n', scanIndex)
                    if (nextNewline === -1 || nextNewline >= matchIndex) break
                    scanLine += 1
                    scanIndex = nextNewline + 1
                }

                const lineStart = scanIndex
                const nextBreak = contentLower.indexOf('\n', matchIndex)
                const lineEnd = nextBreak === -1 ? contentLower.length : nextBreak

                const lineText = content.slice(lineStart, lineEnd)
                const withinLineIndex = matchIndex - lineStart

                const snippetStart = Math.max(0, withinLineIndex - CONTEXT_CHARS)
                const snippetEnd = Math.min(lineText.length, withinLineIndex + lowerQuery.length + CONTEXT_CHARS)
                const rawSnippet = lineText.slice(snippetStart, snippetEnd)

                const prefixEllipsis = snippetStart > 0 ? '...' : ''
                const suffixEllipsis = snippetEnd < lineText.length ? '...' : ''
                const previewText = prefixEllipsis + rawSnippet + suffixEllipsis
                const matchStart = prefixEllipsis.length + (withinLineIndex - snippetStart)
                const matchEnd = matchStart + lowerQuery.length

                searchResults.push({
                    tab,
                    type: activeTab,
                    kind: 'content',
                    jumpTo: {
                        query: q,
                        occurrence,
                        matchLength: lowerQuery.length,
                        snippet: rawSnippet,
                        line: scanLine,
                        column: withinLineIndex + 1,
                    },
                    preview: { text: previewText, matchStart, matchEnd },
                })

                startIndex = matchIndex + lowerQuery.length
            }
        }

        return searchResults
    }, [isOpen, debouncedQuery, tabs, archivedTabs, closedTabs, activeTab])

    const shouldVirtualizeResults = debouncedQuery.trim().length === 0 && results.length >= 200
    const {
        startIndex: resultStartIndex,
        endIndex: resultEndIndex,
        topSpacerHeight: resultTopSpacerHeight,
        bottomSpacerHeight: resultBottomSpacerHeight,
        scrollToIndex: scrollResultToIndex,
    } = useVirtualList({
        enabled: shouldVirtualizeResults,
        itemCount: results.length,
        scrollElementRef: listRef,
        itemSelector: '.search-result-item',
        overscan: 8,
        estimateItemStride: 36,
    })

    // 重置选中索引
    useEffect(() => {
        setSelectedIndex(0)
    }, [debouncedQuery, activeTab])

    // 滚动到选中项
    useEffect(() => {
        if (!listRef.current) return

        if (shouldVirtualizeResults) {
            scrollResultToIndex(selectedIndex, 'nearest')
            return
        }

        const selectedItem = listRef.current.querySelector('.search-result-item.selected')
        if (selectedItem) {
            selectedItem.scrollIntoView({ block: 'nearest' })
        }
    }, [selectedIndex, shouldVirtualizeResults, scrollResultToIndex])

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
        const jumpTo = result.kind === 'content' ? result.jumpTo : undefined
        if (result.type === 'active') {
            onSelectTab(result.tab as Tab, jumpTo)
            onClose()
        } else if (result.type === 'archived') {
            onRestoreArchived(result.tab as ArchivedTab, jumpTo)
            onClose()
        } else if (result.type === 'closed') {
            onRestoreClosed(result.tab as ClosedTab, jumpTo)
            onClose()
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
        if (debouncedQuery.trim()) return t('search.noResults')
        if (activeTab === 'archived') return t('archive.empty')
        if (activeTab === 'closed') return t('trash.empty')
        return t('search.noResults')
    }

    const renderHighlight = (text: string, from: number, to: number) => {
        const safeFrom = Math.max(0, Math.min(from, text.length))
        const safeTo = Math.max(safeFrom, Math.min(to, text.length))
        if (safeFrom === safeTo) return text
        return (
            <>
                {text.slice(0, safeFrom)}
                <span className="search-highlight">{text.slice(safeFrom, safeTo)}</span>
                {text.slice(safeTo)}
            </>
        )
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
                        <Search className="search-icon" size={16} strokeWidth={2} />
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
                            <>
                                {shouldVirtualizeResults && resultTopSpacerHeight > 0 && (
                                    <div
                                        aria-hidden="true"
                                        style={{ height: resultTopSpacerHeight, pointerEvents: 'none' }}
                                    />
                                )}
                                {(shouldVirtualizeResults
                                    ? results.slice(resultStartIndex, resultEndIndex + 1)
                                    : results
                                ).map((result, windowIndex) => {
                                    const index = shouldVirtualizeResults
                                        ? resultStartIndex + windowIndex
                                        : windowIndex

                                const resultKey = result.kind === 'content' && result.jumpTo
                                    ? `${result.type}-${result.tab.id}-c-${result.jumpTo.occurrence}`
                                    : result.kind === 'title' && result.titleHighlight
                                        ? `${result.type}-${result.tab.id}-t-${result.titleHighlight.from}`
                                        : `${result.type}-${result.tab.id}`

                                const titleNode = result.kind === 'title' && result.titleHighlight
                                    ? renderHighlight(result.tab.title, result.titleHighlight.from, result.titleHighlight.to)
                                    : result.tab.title

                                return (
                                    <div
                                        key={resultKey}
                                        data-index={index}
                                        className={`search-result-item ${index === selectedIndex ? 'selected' : ''}`}
                                        onClick={() => handleSelect(result)}
                                        onMouseEnter={() => setSelectedIndex(index)}
                                    >
                                        <div className="search-result-main">
                                            <span className="search-result-title">{titleNode}</span>
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
                                                        <RotateCcw size={12} strokeWidth={2} />
                                                    </button>
                                                    <button
                                                        className="search-result-action delete"
                                                        title={activeTab === 'archived' ? t('archive.deleteTooltip') : t('trash.deleteTooltip')}
                                                        onClick={(e) => handleDelete(e, result)}
                                                    >
                                                        <X size={12} strokeWidth={2} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        {result.kind === 'content' && result.preview && (
                                            <div className="search-result-preview">
                                                {renderHighlight(result.preview.text, result.preview.matchStart, result.preview.matchEnd)}
                                            </div>
                                        )}
                                    </div>
                                )
                                })}
                                {shouldVirtualizeResults && resultBottomSpacerHeight > 0 && (
                                    <div
                                        aria-hidden="true"
                                        style={{ height: resultBottomSpacerHeight, pointerEvents: 'none' }}
                                    />
                                )}
                            </>
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
