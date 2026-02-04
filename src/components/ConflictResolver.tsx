import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tab, bulkUpdateTabs } from '../db'
import './ConflictResolver.css'

// 服务器返回的 Tab 格式
interface ServerTab {
    id: string
    title: string
    content: string
    version: number
    localVersion: number
    createdAt: number
    updatedAt: number
    deleted: boolean
}

export interface Conflict {
    local: Tab
    remote: ServerTab
}

interface ConflictResolverProps {
    conflicts: Conflict[]
    serverTime?: number
    onResolved: () => void
    onClose: () => void
}

type Resolution = 'local' | 'remote' | 'both'

function appendCloudSuffix(title: string): string {
    const suffixBase = '（云端）'

    if (!title.endsWith('）')) {
        return `${title}${suffixBase}`
    }

    if (title.endsWith(suffixBase)) {
        return title.replace(suffixBase, '（云端2）')
    }

    const match = title.match(/（云端(\d+)）$/)
    if (match) {
        const n = Number(match[1])
        if (Number.isFinite(n) && n >= 2) {
            return title.replace(/（云端(\d+)）$/, `（云端${n + 1}）`)
        }
    }

    return `${title}${suffixBase}`
}

export function ConflictResolver({ conflicts, serverTime, onResolved, onClose }: ConflictResolverProps) {
    const { t } = useTranslation()
    const [currentIndex, setCurrentIndex] = useState(0)
    const [resolutions, setResolutions] = useState<Map<string, Resolution>>(new Map())
    const [resolving, setResolving] = useState(false)

    const currentConflict = conflicts[currentIndex]
    const totalConflicts = conflicts.length

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString()
    }

    const handleResolution = (resolution: Resolution) => {
        setResolutions(prev => {
            const newMap = new Map(prev)
            newMap.set(currentConflict.local.id, resolution)
            return newMap
        })

        // 自动跳转到下一个冲突
        if (currentIndex < totalConflicts - 1) {
            setCurrentIndex(currentIndex + 1)
        }
    }

    const handleResolveAll = async () => {
        setResolving(true)

        try {
            const tabsToUpdate: Tab[] = []
            const resolvedServerTime = serverTime ?? Date.now()

            for (const conflict of conflicts) {
                const resolution = resolutions.get(conflict.local.id)

                if (resolution === 'local') {
                    // 保留本地版本，强制同步
                    tabsToUpdate.push({
                        ...conflict.local,
                        localVersion: Math.max(conflict.local.localVersion, conflict.remote.version) + 1,
                        syncedAt: resolvedServerTime,
                        updatedAt: Math.max(conflict.local.updatedAt, resolvedServerTime + 1) // 确保会被当作待同步
                    })
                } else if (resolution === 'remote') {
                    // 使用远程版本
                    tabsToUpdate.push({
                        id: conflict.remote.id,
                        title: conflict.remote.title,
                        content: conflict.remote.content,
                        createdAt: conflict.remote.createdAt,
                        updatedAt: conflict.remote.updatedAt,
                        localVersion: conflict.remote.version,
                        syncedAt: resolvedServerTime,
                        deleted: conflict.remote.deleted
                    })
                } else if (resolution === 'both') {
                    // 保留两个版本 - 将远程版本作为新标签页
                    // 更新本地版本
                    tabsToUpdate.push({
                        ...conflict.local,
                        localVersion: Math.max(conflict.local.localVersion, conflict.remote.version) + 1,
                        syncedAt: resolvedServerTime,
                        updatedAt: Math.max(conflict.local.updatedAt, resolvedServerTime + 1)
                    })
                    // 创建远程版本的副本
                    tabsToUpdate.push({
                        id: crypto.randomUUID(),
                        title: appendCloudSuffix(conflict.remote.title),
                        content: conflict.remote.content,
                        createdAt: conflict.remote.createdAt,
                        updatedAt: Date.now(),
                        localVersion: 1,
                        syncedAt: null,
                        deleted: false
                    })
                }
            }

            if (tabsToUpdate.length > 0) {
                await bulkUpdateTabs(tabsToUpdate)
            }

            onResolved()
            onClose()
        } catch (error) {
            console.error('解决冲突失败:', error)
        } finally {
            setResolving(false)
        }
    }

    const allResolved = conflicts.every(c => resolutions.has(c.local.id))

    if (conflicts.length === 0) return null

    return (
        <div className="conflict-overlay">
            <div className="conflict-modal">
                <div className="conflict-header">
                    <h2>{t('conflict.title')}</h2>
                    <span className="conflict-progress">
                        {currentIndex + 1} / {totalConflicts}
                    </span>
                </div>

                <div className="conflict-content">
                    <p className="conflict-desc">{t('conflict.description')}</p>

                    <div className="conflict-tabs">
                        {conflicts.map((conflict, index) => (
                            <button
                                key={conflict.local.id}
                                className={`conflict-tab ${index === currentIndex ? 'active' : ''} ${resolutions.has(conflict.local.id) ? 'resolved' : ''}`}
                                onClick={() => setCurrentIndex(index)}
                            >
                                {conflict.local.title}
                                {resolutions.has(conflict.local.id) && <span className="check">✓</span>}
                            </button>
                        ))}
                    </div>

                    <div className="conflict-comparison">
                        <div className="conflict-version local">
                            <div className="version-header">
                                <h3>{t('conflict.localVersion')}</h3>
                                <span className="version-time">
                                    {formatDate(currentConflict.local.updatedAt)}
                                </span>
                            </div>
                            <div className="version-title">{currentConflict.local.title}</div>
                            <div className="version-content">
                                {currentConflict.local.content || <em>{t('conflict.empty')}</em>}
                            </div>
                            <button
                                className={`version-select ${resolutions.get(currentConflict.local.id) === 'local' ? 'selected' : ''}`}
                                onClick={() => handleResolution('local')}
                            >
                                {t('conflict.keepLocal')}
                            </button>
                        </div>

                        <div className="conflict-version remote">
                            <div className="version-header">
                                <h3>{t('conflict.remoteVersion')}</h3>
                                <span className="version-time">
                                    {formatDate(currentConflict.remote.updatedAt)}
                                </span>
                            </div>
                            <div className="version-title">{currentConflict.remote.title}</div>
                            <div className="version-content">
                                {currentConflict.remote.content || <em>{t('conflict.empty')}</em>}
                            </div>
                            <button
                                className={`version-select ${resolutions.get(currentConflict.local.id) === 'remote' ? 'selected' : ''}`}
                                onClick={() => handleResolution('remote')}
                            >
                                {t('conflict.keepRemote')}
                            </button>
                        </div>
                    </div>

                    <button
                        className={`keep-both-btn ${resolutions.get(currentConflict.local.id) === 'both' ? 'selected' : ''}`}
                        onClick={() => handleResolution('both')}
                    >
                        {t('conflict.keepBoth')}
                    </button>
                </div>

                <div className="conflict-footer">
                    <button className="conflict-cancel" onClick={onClose}>
                        {t('dialog.cancel')}
                    </button>
                    <button
                        className="conflict-confirm"
                        onClick={handleResolveAll}
                        disabled={!allResolved || resolving}
                    >
                        {resolving ? t('sync.processing') : t('conflict.resolve')}
                    </button>
                </div>
            </div>
        </div>
    )
}
