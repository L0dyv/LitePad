import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ClosedTab } from '../utils/storage'
import './TrashDropdown.css'

interface TrashDropdownProps {
    closedTabs: ClosedTab[]
    onRestore: (tab: ClosedTab) => void
    onDelete: (tab: ClosedTab) => void
    onClear: () => void
}

export function TrashDropdown({ closedTabs, onRestore, onDelete, onClear }: TrashDropdownProps) {
    const { t } = useTranslation()
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // 点击外部关闭下拉菜单
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen])

    // 格式化时间差
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

    const handleRestore = (tab: ClosedTab) => {
        onRestore(tab)
        if (closedTabs.length <= 1) {
            setIsOpen(false)
        }
    }

    return (
        <div className="trash-dropdown" ref={dropdownRef}>
            <button
                className="trash-btn"
                onClick={() => setIsOpen(!isOpen)}
                title={t('trash.title')}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
            {isOpen && (
                <div className="trash-menu">
                    <div className="trash-header">
                        <span>{t('trash.title')}</span>
                        {closedTabs.length > 0 && (
                            <button className="trash-clear" onClick={onClear}>
                                {t('trash.clear')}
                            </button>
                        )}
                    </div>
                    <div className="trash-list">
                        {closedTabs.length === 0 ? (
                            <div className="trash-empty">{t('trash.empty')}</div>
                        ) : (
                            closedTabs.slice(0, 10).map((tab) => (
                                <div
                                    key={tab.id + tab.closedAt}
                                    className="trash-item"
                                    onClick={() => handleRestore(tab)}
                                >
                                    <span className="trash-item-title">{tab.title}</span>
                                    <span className="trash-item-time">{formatTimeAgo(tab.closedAt)}</span>
                                    <button
                                        className="trash-item-delete"
                                        title={t('trash.deleteTooltip')}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onDelete(tab)
                                        }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
