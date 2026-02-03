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
 * 核心逻辑：基于 localVersion（乐观锁）判定
 * 1. 服务器没有此 Tab：无冲突，接受客户端版本
 * 2. 客户端 localVersion >= 服务器 version：客户端较新，接受客户端版本
 * 3. 客户端 localVersion < 服务器 version：服务器有更新版本
 *    - 如果客户端有本地未同步修改：冲突
 *    - 否则：返回服务器版本给客户端
 */
export function detectConflict(clientTab: ClientTab, serverTab: DbTab | undefined): ConflictResult | null {
    // 服务器没有此标签页，不会冲突
    if (!serverTab) {
        return null
    }

    // 客户端版本 >= 服务器版本，客户端较新或相同，不冲突
    if (clientTab.localVersion >= serverTab.version) {
        return null
    }

    // 服务器版本更高，检查客户端是否有本地未同步修改
    const clientHasLocalChanges =
        clientTab.syncedAt === null ||  // 从未同步过
        clientTab.updatedAt > clientTab.syncedAt  // 有本地修改

    if (clientHasLocalChanges) {
        // 客户端有本地修改，但服务器版本更高 = 冲突
        return {
            hasConflict: true,
            localTab: clientTab,
            remoteTab: serverTab
        }
    }

    // 客户端无本地修改，不是冲突（只是需要更新）
    return null
}

/**
 * 处理同步请求
 * 返回同步结果：成功同步的、需要更新的、冲突的
 * 
 * 判定规则（基于 localVersion）：
 * - 服务器没有：接受客户端版本
 * - 客户端 localVersion >= 服务器 version：接受客户端版本
 * - 客户端 localVersion < 服务器 version 且客户端有修改：冲突
 * - 客户端 localVersion < 服务器 version 且客户端无修改：返回服务器版本
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

        // 无冲突，判断是接受客户端还是返回服务器版本
        if (!serverTab) {
            // 服务器没有，接受客户端版本
            result.synced.push(clientTab.id)
        } else if (clientTab.localVersion >= serverTab.version) {
            // 客户端版本较新或相同，接受客户端版本
            result.synced.push(clientTab.id)
        } else {
            // 服务器版本更高，客户端无本地修改，返回服务器版本
            result.updates.push(serverTab)
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
