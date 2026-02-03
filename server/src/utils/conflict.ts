import { DbTab } from '../db/schema.js'

// 客户端发送的 Tab 格式
export interface ClientTab {
    id: string
    title: string
    content: string
    localVersion: number
    createdAt: number
    updatedAt: number
    syncedAt: number | null
    deleted: boolean
}

// 冲突检测结果
export interface ConflictResult {
    hasConflict: boolean
    localTab: ClientTab
    remoteTab: DbTab
}

// 同步结果
export interface SyncResult {
    // 成功同步的标签页 ID
    synced: string[]
    // 需要客户端更新的标签页（服务器版本更新）
    updates: DbTab[]
    // 冲突的标签页
    conflicts: ConflictResult[]
}

/**
 * 检测并处理同步冲突
 * 
 * 冲突条件：
 * 1. 客户端有修改（updatedAt > syncedAt）
 * 2. 服务器也有修改（server.updated_at > client.syncedAt）
 * 3. 两边版本不一致
 */
export function detectConflict(clientTab: ClientTab, serverTab: DbTab | undefined): ConflictResult | null {
    // 服务器没有此标签页，不会冲突
    if (!serverTab) {
        return null
    }

    // 客户端从未同步过，但服务器有此标签页（可能是其他设备创建的）
    // 这不算冲突，应该合并
    if (clientTab.syncedAt === null) {
        return null
    }

    // 检查是否有冲突
    // 客户端有本地修改
    const clientHasLocalChanges = clientTab.updatedAt > clientTab.syncedAt

    // 服务器在客户端上次同步后有修改
    const serverHasNewerChanges = serverTab.updated_at > clientTab.syncedAt

    // 两边都有修改 = 冲突
    if (clientHasLocalChanges && serverHasNewerChanges) {
        return {
            hasConflict: true,
            localTab: clientTab,
            remoteTab: serverTab
        }
    }

    return null
}

/**
 * 处理同步请求
 * 返回同步结果：成功同步的、需要更新的、冲突的
 */
export function processSyncRequest(
    clientTabs: ClientTab[],
    serverTabs: Map<string, DbTab>
): SyncResult {
    const result: SyncResult = {
        synced: [],
        updates: [],
        conflicts: []
    }

    for (const clientTab of clientTabs) {
        const serverTab = serverTabs.get(clientTab.id)

        // 检测冲突
        const conflict = detectConflict(clientTab, serverTab)

        if (conflict) {
            result.conflicts.push(conflict)
            continue
        }

        // 无冲突，判断谁的版本更新
        if (!serverTab) {
            // 服务器没有，直接同步
            result.synced.push(clientTab.id)
        } else if (clientTab.updatedAt > serverTab.updated_at) {
            // 客户端更新，同步到服务器
            result.synced.push(clientTab.id)
        } else if (serverTab.updated_at > clientTab.updatedAt) {
            // 服务器更新，返回给客户端
            result.updates.push(serverTab)
        } else {
            // 时间相同，认为已同步
            result.synced.push(clientTab.id)
        }
    }

    // 检查服务器有但客户端没有提交的标签页（其他设备创建的）
    for (const [tabId, serverTab] of serverTabs) {
        const clientHas = clientTabs.some(t => t.id === tabId)
        if (!clientHas) {
            result.updates.push(serverTab)
        }
    }

    return result
}

/**
 * 将服务器 Tab 转换为客户端格式
 */
export function dbTabToClientTab(dbTab: DbTab): Omit<ClientTab, 'syncedAt'> & { version: number } {
    return {
        id: dbTab.id,
        title: dbTab.title,
        content: dbTab.content,
        localVersion: dbTab.version,
        version: dbTab.version,
        createdAt: dbTab.created_at,
        updatedAt: dbTab.updated_at,
        deleted: dbTab.deleted === 1
    }
}
