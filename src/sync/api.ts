import { Tab, getPendingSyncTabs, markTabsSynced, bulkUpdateTabs, getAllTabs } from '../db'
import { getConfig, emitSyncEvent, setConfig } from './config'
import { authFetch, getAccessToken } from './auth'

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

// 同步冲突
export interface SyncConflict {
    local: Tab
    remote: ServerTab
}

// 同步结果
export interface SyncPushResult {
    synced: string[]
    updates: ServerTab[]
    conflicts: Array<{
        local: Tab
        remote: ServerTab
    }>
    serverTime: number
}

// 全量拉取
export async function fullSync(): Promise<ServerTab[]> {
    const config = await getConfig()
    if (!config.enabled) {
        throw new Error('同步未启用')
    }

    const response = await authFetch(`${config.serverUrl}/sync/full`)

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '同步失败')
    }

    const { tabs, serverTime } = await response.json()

    // 更新本地数据
    if (tabs.length > 0) {
        const localTabs: Tab[] = tabs.map((t: ServerTab) => ({
            id: t.id,
            title: t.title,
            content: t.content,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            localVersion: t.version,
            syncedAt: serverTime,
            deleted: t.deleted
        }))
        await bulkUpdateTabs(localTabs)
    }

    // 更新最后同步时间
    await setConfig({ lastSyncAt: serverTime })

    emitSyncEvent({ type: 'sync-complete', data: { tabs } })

    return tabs
}

// 增量拉取
export async function pullChanges(since?: number): Promise<ServerTab[]> {
    const config = await getConfig()
    if (!config.enabled) {
        throw new Error('同步未启用')
    }

    const sinceTime = since || config.lastSyncAt || 0
    const response = await authFetch(`${config.serverUrl}/sync/pull?since=${sinceTime}`)

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '同步失败')
    }

    const { tabs, serverTime } = await response.json()

    // 更新本地数据
    if (tabs.length > 0) {
        const localTabs: Tab[] = tabs.map((t: ServerTab) => ({
            id: t.id,
            title: t.title,
            content: t.content,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            localVersion: t.version,
            syncedAt: serverTime,
            deleted: t.deleted
        }))
        await bulkUpdateTabs(localTabs)
        emitSyncEvent({ type: 'remote-changes', data: { tabs: localTabs } })
    }

    // 更新最后同步时间
    await setConfig({ lastSyncAt: serverTime })

    return tabs
}

// 推送变更
export async function pushChanges(): Promise<SyncPushResult> {
    const config = await getConfig()
    if (!config.enabled) {
        throw new Error('同步未启用')
    }

    // 获取待同步的标签页
    const pendingTabs = await getPendingSyncTabs()

    if (pendingTabs.length === 0) {
        return {
            synced: [],
            updates: [],
            conflicts: [],
            serverTime: Date.now()
        }
    }

    const response = await authFetch(`${config.serverUrl}/sync/push`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            tabs: pendingTabs.map(t => ({
                id: t.id,
                title: t.title,
                content: t.content,
                localVersion: t.localVersion,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt,
                syncedAt: t.syncedAt,
                deleted: t.deleted
            }))
        })
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '同步失败')
    }

    const result = await response.json() as SyncPushResult

    // 标记已同步的标签页（使用服务器时间）
    if (result.synced.length > 0) {
        await markTabsSynced(result.synced, result.serverTime)
    }

    // 更新来自服务器的变更
    if (result.updates.length > 0) {
        const localTabs: Tab[] = result.updates.map((t: ServerTab) => ({
            id: t.id,
            title: t.title,
            content: t.content,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            localVersion: t.version,
            syncedAt: result.serverTime,
            deleted: t.deleted
        }))
        await bulkUpdateTabs(localTabs)
        emitSyncEvent({ type: 'remote-changes', data: { tabs: localTabs } })
    }

    // 处理冲突
    if (result.conflicts.length > 0) {
        emitSyncEvent({ type: 'conflict', data: { conflicts: result.conflicts, serverTime: result.serverTime } })
    }

    // 更新最后同步时间
    await setConfig({ lastSyncAt: result.serverTime })

    emitSyncEvent({ type: 'sync-complete', data: result })

    return result
}

// 完整同步流程（拉取 + 推送）
export async function sync(): Promise<void> {
    const config = await getConfig()
    if (!config.enabled || !getAccessToken()) {
        return
    }

    try {
        // 如果从未同步过，先全量拉取
        if (!config.lastSyncAt) {
            // 检查本地是否有数据
            const localTabs = await getAllTabs()
            if (localTabs.length > 0) {
                // 先推送本地数据
                const pushResult = await pushChanges()
                // 如果有冲突，暂停同步，等待用户解决
                if (pushResult.conflicts.length > 0) {
                    console.log('[Sync] 检测到冲突，暂停同步等待用户处理')
                    return
                }
            }
            // 再拉取服务器数据
            await fullSync()
        } else {
            // 先推送本地变更
            const pushResult = await pushChanges()
            // 如果有冲突，暂停同步，等待用户解决
            if (pushResult.conflicts.length > 0) {
                console.log('[Sync] 检测到冲突，暂停同步等待用户处理')
                return
            }
            // 无冲突时才拉取服务器变更
            await pullChanges()
        }
    } catch (error) {
        emitSyncEvent({ type: 'sync-error', data: { error } })
        throw error
    }
}
