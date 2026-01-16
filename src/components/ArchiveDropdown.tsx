import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ArchivedTab } from '../utils/storage'
import { ConfirmDialog } from './ConfirmDialog'
import './ArchiveDropdown.css'

interface ArchiveDropdownProps {
    archivedTabs: ArchivedTab[]
    onRestore: (tab: ArchivedTab) => void
    onDelete: (tab: ArchivedTab) => void
    onClear: () => void
}

export function ArchiveDropdown({ archivedTabs, onRestore, onDelete, onClear }: ArchiveDropdownProps) {
    const { t } = useTranslation()
    const [isOpen, setIsOpen] = useState(false)
    const [confirmDialog, setConfirmDialog] = useState<{
        type: 'clear' | 'delete'
        tab?: ArchivedTab
    } | null>(null)
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

        if (minutes < 1) return t('archive.justNow')
        if (minutes < 60) return t('archive.minutesAgo', { count: minutes })
        if (hours < 24) return t('archive.hoursAgo', { count: hours })
        return t('archive.daysAgo', { count: days })
    }

    const handleRestore = (e: React.MouseEvent, tab: ArchivedTab) => {
        e.stopPropagation()
        onRestore(tab)
        if (archivedTabs.length <= 1) {
            setIsOpen(false)
        }
    }

    const handleClearClick = () => {
        setConfirmDialog({ type: 'clear' })
    }

    const handleDeleteClick = (e: React.MouseEvent, tab: ArchivedTab) => {
        e.stopPropagation()
        setConfirmDialog({ type: 'delete', tab })
    }

    const handleConfirm = () => {
        if (confirmDialog?.type === 'clear') {
            onClear()
            setIsOpen(false)
        } else if (confirmDialog?.type === 'delete' && confirmDialog.tab) {
            onDelete(confirmDialog.tab)
        }
        setConfirmDialog(null)
    }

    const handleCancel = () => {
        setConfirmDialog(null)
    }

    return (
        <>
            <div className="archive-dropdown" ref={dropdownRef}>
                <button
                    className="archive-btn"
                    onClick={() => setIsOpen(!isOpen)}
                    title={t('archive.title')}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="21 8 21 21 3 21 3 8"></polyline>
                        <rect x="1" y="3" width="22" height="5"></rect>
                        <line x1="10" y1="12" x2="14" y2="12"></line>
                    </svg>
                </button>
                {isOpen && (
                    <div className="archive-menu">
                        <div className="archive-header">
                            <span>{t('archive.title')}</span>
                            {archivedTabs.length > 0 && (
                                <button className="archive-clear" onClick={handleClearClick}>
                                    {t('archive.clear')}
                                </button>
                            )}
                        </div>
                        <div className="archive-list">
                            {archivedTabs.length === 0 ? (
                                <div className="archive-empty">{t('archive.empty')}</div>
                            ) : (
                                archivedTabs.map((tab) => {
                                    const tabKey = tab.id + tab.archivedAt
                                    return (
                                        <div key={tabKey} className="archive-item">
                                            <span className="archive-item-title">{tab.title}</span>
                                            <span className="archive-item-time">{formatTimeAgo(tab.archivedAt)}</span>
                                            <button
                                                className="archive-item-restore"
                                                title={t('archive.restoreTooltip')}
                                                onClick={(e) => handleRestore(e, tab)}
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="1 4 1 10 7 10"></polyline>
                                                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                                                </svg>
                                            </button>
                                            <button
                                                className="archive-item-delete"
                                                title={t('archive.deleteTooltip')}
                                                onClick={(e) => handleDeleteClick(e, tab)}
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                                </svg>
                                            </button>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>
            <ConfirmDialog
                isOpen={confirmDialog !== null}
                title={confirmDialog?.type === 'clear' ? t('archive.clearTitle') : t('archive.deleteTitle')}
                message={confirmDialog?.type === 'clear'
                    ? t('archive.clearMessage')
                    : t('archive.deleteMessage', { name: confirmDialog?.tab?.title })}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
            />
        </>
    )
}
