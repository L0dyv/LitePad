import Dexie, { Table } from 'dexie'

// 扩展的 Tab 接口，包含同步字段
export interface Tab {
    id: string
    title: string
    content: string
    createdAt: number
    updatedAt: number
    // 同步相关字段
    localVersion: number      // 本地版本号，每次修改 +1
    syncedAt: number | null   // 上次同步时间，null=从未同步
    deleted: boolean          // 软删除标记
}

// 已关闭的标签页（回收站）
export interface ClosedTab extends Tab {
    closedAt: number
    index: number
}

// 已归档的标签页
export interface ArchivedTab extends Tab {
    archivedAt: number
}

// 同步配置
export interface SyncConfig {
    id: string              // 固定为 'default'
    enabled: boolean        // 同步是否开启
    userId: string | null   // 登录的用户ID
    serverUrl: string       // 服务器地址
    lastSyncAt: number | null // 上次同步时间
    deviceId: string        // 当前设备唯一ID
}

// 应用设置
export interface AppSettings {
    id: string              // 设置项的 key
    value: string           // JSON 序列化的值
}

// 应用状态（活跃标签页ID等）
export interface AppState {
    id: string              // 固定为 'default'
    activeTabId: string
}

// 附件（图片等）
export interface Attachment {
    hash: string            // SHA-256 主键（去重）
    filename: string        // 原始文件名（保留可读性）
    mimeType: string        // image/png, image/jpeg 等
    size: number            // 字节数
    ext: string             // 文件扩展名 .png, .jpg
    localPath: string       // 本地文件路径
    syncStatus: 'pending' | 'synced' | 'downloading' | 'error'
    createdAt: number
    syncedAt: number | null
}

class LitePadDatabase extends Dexie {
    tabs!: Table<Tab, string>
    closedTabs!: Table<ClosedTab, string>
    archivedTabs!: Table<ArchivedTab, string>
    syncConfig!: Table<SyncConfig, string>
    settings!: Table<AppSettings, string>
    appState!: Table<AppState, string>
    attachments!: Table<Attachment, string>

    constructor() {
        super('LitePadDB')

        this.version(1).stores({
            tabs: 'id, updatedAt, deleted',
            closedTabs: 'id, closedAt',
            archivedTabs: 'id, archivedAt',
            syncConfig: 'id',
            settings: 'id',
            appState: 'id'
        })

        // 版本2：添加附件表
        this.version(2).stores({
            tabs: 'id, updatedAt, deleted',
            closedTabs: 'id, closedAt',
            archivedTabs: 'id, archivedAt',
            syncConfig: 'id',
            settings: 'id',
            appState: 'id',
            attachments: 'hash, syncStatus, createdAt'
        })
    }
}

export const db = new LitePadDatabase()

// 生成设备ID
function generateDeviceId(): string {
    return 'device_' + crypto.randomUUID()
}

// 获取或创建设备ID
let cachedDeviceId: string | null = null
export async function getDeviceId(): Promise<string> {
    if (cachedDeviceId) return cachedDeviceId

    const config = await db.syncConfig.get('default')
    if (config?.deviceId) {
        cachedDeviceId = config.deviceId
        return cachedDeviceId
    }

    cachedDeviceId = generateDeviceId()
    return cachedDeviceId
}

// 初始化同步配置（如果不存在）
export async function initSyncConfig(): Promise<SyncConfig> {
    let config = await db.syncConfig.get('default')
    if (!config) {
        const deviceId = await getDeviceId()
        config = {
            id: 'default',
            enabled: false,
            userId: null,
            serverUrl: 'https://sync.litepad.app', // 默认服务器
            lastSyncAt: null,
            deviceId
        }
        await db.syncConfig.put(config)
    }
    return config
}

// 获取同步配置
export async function getSyncConfig(): Promise<SyncConfig> {
    return await initSyncConfig()
}

// 更新同步配置
export async function updateSyncConfig(updates: Partial<Omit<SyncConfig, 'id'>>): Promise<void> {
    await db.syncConfig.update('default', updates)
}

// 获取应用状态
export async function getAppState(): Promise<AppState | undefined> {
    return await db.appState.get('default')
}

// 设置应用状态
export async function setAppState(activeTabId: string): Promise<void> {
    await db.appState.put({ id: 'default', activeTabId })
}

// 获取设置
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
    const setting = await db.settings.get(key)
    if (setting) {
        try {
            return JSON.parse(setting.value) as T
        } catch {
            return defaultValue
        }
    }
    return defaultValue
}

// 保存设置
export async function setSetting<T>(key: string, value: T): Promise<void> {
    await db.settings.put({ id: key, value: JSON.stringify(value) })
}

// ===== Tab 操作 =====

// 获取所有活跃标签页（未删除的）
export async function getAllTabs(): Promise<Tab[]> {
    return await db.tabs.filter(t => !t.deleted).toArray()
}

// 获取单个标签页
export async function getTab(id: string): Promise<Tab | undefined> {
    return await db.tabs.get(id)
}

// 创建新标签页
export async function createTab(title: string = 'New Page'): Promise<Tab> {
    const now = Date.now()
    const tab: Tab = {
        id: crypto.randomUUID(),
        title,
        content: '',
        createdAt: now,
        updatedAt: now,
        localVersion: 1,
        syncedAt: null,
        deleted: false
    }
    await db.tabs.put(tab)
    return tab
}

// 更新标签页
export async function updateTab(id: string, updates: Partial<Omit<Tab, 'id' | 'createdAt'>>): Promise<void> {
    const tab = await db.tabs.get(id)
    if (tab) {
        await db.tabs.update(id, {
            ...updates,
            updatedAt: Date.now(),
            localVersion: tab.localVersion + 1
        })
    }
}

// 软删除标签页
export async function softDeleteTab(id: string): Promise<void> {
    const tab = await db.tabs.get(id)
    if (tab) {
        await db.tabs.update(id, {
            deleted: true,
            updatedAt: Date.now(),
            localVersion: tab.localVersion + 1
        })
    }
}

// 硬删除标签页（真正删除）
export async function hardDeleteTab(id: string): Promise<void> {
    await db.tabs.delete(id)
}

// 批量更新标签页（用于同步）
export async function bulkUpdateTabs(tabs: Tab[]): Promise<void> {
    await db.tabs.bulkPut(tabs)
}

// 获取待同步的标签页（本地有修改但未同步的）
export async function getPendingSyncTabs(): Promise<Tab[]> {
    return await db.tabs.filter(t => {
        if (t.syncedAt === null) return true // 从未同步
        return t.updatedAt > t.syncedAt // 有新修改
    }).toArray()
}

// 标记标签页已同步
export async function markTabsSynced(ids: string[]): Promise<void> {
    const now = Date.now()
    await db.transaction('rw', db.tabs, async () => {
        for (const id of ids) {
            await db.tabs.update(id, { syncedAt: now })
        }
    })
}

// ===== 回收站操作 =====

const MAX_CLOSED_TABS = 20

export async function getClosedTabs(): Promise<ClosedTab[]> {
    return await db.closedTabs.orderBy('closedAt').reverse().toArray()
}

export async function addToClosedTabs(tab: Tab, index: number): Promise<void> {
    const closedTab: ClosedTab = {
        ...tab,
        closedAt: Date.now(),
        index
    }
    await db.closedTabs.put(closedTab)

    // 限制数量
    const all = await db.closedTabs.orderBy('closedAt').toArray()
    if (all.length > MAX_CLOSED_TABS) {
        const toDelete = all.slice(0, all.length - MAX_CLOSED_TABS)
        await db.closedTabs.bulkDelete(toDelete.map(t => t.id))
    }
}

export async function popClosedTab(): Promise<ClosedTab | null> {
    const all = await db.closedTabs.orderBy('closedAt').reverse().toArray()
    if (all.length === 0) return null
    const tab = all[0]
    await db.closedTabs.delete(tab.id)
    return tab
}

export async function removeFromClosedTabs(id: string, closedAt: number): Promise<void> {
    const all = await db.closedTabs.toArray()
    const toRemove = all.find(t => t.id === id && t.closedAt === closedAt)
    if (toRemove) {
        await db.closedTabs.delete(toRemove.id)
    }
}

export async function clearClosedTabs(): Promise<void> {
    await db.closedTabs.clear()
}

// ===== 归档操作 =====

export async function getArchivedTabs(): Promise<ArchivedTab[]> {
    return await db.archivedTabs.orderBy('archivedAt').reverse().toArray()
}

export async function addToArchivedTabs(tab: Tab): Promise<void> {
    // 如果已存在相同ID，先删除旧的
    await db.archivedTabs.delete(tab.id)

    const archivedTab: ArchivedTab = {
        ...tab,
        archivedAt: Date.now()
    }
    await db.archivedTabs.put(archivedTab)
}

export async function removeFromArchivedTabs(id: string): Promise<ArchivedTab[]> {
    await db.archivedTabs.delete(id)
    return await getArchivedTabs()
}

export async function clearArchivedTabs(): Promise<void> {
    await db.archivedTabs.clear()
}

// ===== 附件操作 =====

// 获取单个附件
export async function getAttachment(hash: string): Promise<Attachment | undefined> {
    return await db.attachments.get(hash)
}

// 检查附件是否存在
export async function hasAttachment(hash: string): Promise<boolean> {
    const attachment = await db.attachments.get(hash)
    return !!attachment
}

// 添加或更新附件
export async function putAttachment(attachment: Attachment): Promise<void> {
    await db.attachments.put(attachment)
}

// 批量添加附件
export async function bulkPutAttachments(attachments: Attachment[]): Promise<void> {
    await db.attachments.bulkPut(attachments)
}

// 获取所有附件
export async function getAllAttachments(): Promise<Attachment[]> {
    return await db.attachments.toArray()
}

// 获取待同步的附件（pending 状态）
export async function getPendingSyncAttachments(): Promise<Attachment[]> {
    return await db.attachments.where('syncStatus').equals('pending').toArray()
}

// 获取下载中的附件
export async function getDownloadingAttachments(): Promise<Attachment[]> {
    return await db.attachments.where('syncStatus').equals('downloading').toArray()
}

// 更新附件同步状态
export async function updateAttachmentSyncStatus(
    hash: string,
    syncStatus: Attachment['syncStatus'],
    syncedAt?: number | null
): Promise<void> {
    const updates: Partial<Attachment> = { syncStatus }
    if (syncedAt !== undefined) {
        updates.syncedAt = syncedAt
    }
    await db.attachments.update(hash, updates)
}

// 批量更新附件同步状态
export async function bulkUpdateAttachmentSyncStatus(
    hashes: string[],
    syncStatus: Attachment['syncStatus'],
    syncedAt?: number
): Promise<void> {
    await db.transaction('rw', db.attachments, async () => {
        for (const hash of hashes) {
            const updates: Partial<Attachment> = { syncStatus }
            if (syncedAt !== undefined) {
                updates.syncedAt = syncedAt
            }
            await db.attachments.update(hash, updates)
        }
    })
}

// 删除附件记录
export async function deleteAttachment(hash: string): Promise<void> {
    await db.attachments.delete(hash)
}

// 获取缺失的附件（在笔记中引用但本地没有的）
export async function getMissingAttachmentHashes(referencedHashes: string[]): Promise<string[]> {
    const existingHashes = new Set(
        (await db.attachments.toArray()).map(a => a.hash)
    )
    return referencedHashes.filter(h => !existingHashes.has(h))
}

// 解析笔记内容中的图片引用，提取 hash
export function parseImageHashesFromContent(content: string): string[] {
    const regex = /litepad:\/\/images\/([a-f0-9]{64})(\.[a-z]+)/gi
    const hashes: string[] = []
    let match
    while ((match = regex.exec(content)) !== null) {
        hashes.push(match[1])
    }
    return hashes
}

// ===== 数据迁移 =====

const MIGRATION_KEY = 'litepad-indexeddb-migrated'

export async function migrateFromLocalStorage(): Promise<boolean> {
    // 检查是否已迁移
    if (localStorage.getItem(MIGRATION_KEY)) {
        return false
    }

    try {
        // 迁移主数据
        const mainData = localStorage.getItem('flashpad-data')
        if (mainData) {
            const parsed = JSON.parse(mainData)
            if (parsed.tabs && Array.isArray(parsed.tabs)) {
                const tabs: Tab[] = parsed.tabs.map((t: any) => ({
                    id: t.id,
                    title: t.title,
                    content: t.content,
                    createdAt: t.createdAt || Date.now(),
                    updatedAt: t.updatedAt || Date.now(),
                    localVersion: 1,
                    syncedAt: null,
                    deleted: false
                }))
                await db.tabs.bulkPut(tabs)

                if (parsed.activeTabId) {
                    await setAppState(parsed.activeTabId)
                }
            }
        }

        // 迁移回收站
        const closedData = localStorage.getItem('flashpad-closed-tabs')
        if (closedData) {
            const parsed = JSON.parse(closedData)
            if (Array.isArray(parsed)) {
                const closedTabs: ClosedTab[] = parsed.map((t: any) => ({
                    id: t.id,
                    title: t.title,
                    content: t.content,
                    createdAt: t.createdAt || Date.now(),
                    updatedAt: t.updatedAt || Date.now(),
                    localVersion: 1,
                    syncedAt: null,
                    deleted: false,
                    closedAt: t.closedAt || Date.now(),
                    index: t.index || 0
                }))
                await db.closedTabs.bulkPut(closedTabs)
            }
        }

        // 迁移归档
        const archivedData = localStorage.getItem('flashpad-archived-tabs')
        if (archivedData) {
            const parsed = JSON.parse(archivedData)
            if (Array.isArray(parsed)) {
                const archivedTabs: ArchivedTab[] = parsed.map((t: any) => ({
                    id: t.id,
                    title: t.title,
                    content: t.content,
                    createdAt: t.createdAt || Date.now(),
                    updatedAt: t.updatedAt || Date.now(),
                    localVersion: 1,
                    syncedAt: null,
                    deleted: false,
                    archivedAt: t.archivedAt || Date.now()
                }))
                await db.archivedTabs.bulkPut(archivedTabs)
            }
        }

        // 迁移设置
        const settingsToMigrate = [
            'flashpad-shortcuts',
            'flashpad-statusbar',
            'flashpad-font',
            'flashpad-editor-font',
            'flashpad-editor-font-size',
            'flashpad-zen-mode'
        ]

        for (const key of settingsToMigrate) {
            const value = localStorage.getItem(key)
            if (value) {
                await db.settings.put({ id: key, value })
            }
        }

        // 标记迁移完成
        localStorage.setItem(MIGRATION_KEY, 'true')
        console.log('数据迁移完成：localStorage → IndexedDB')
        return true
    } catch (error) {
        console.error('数据迁移失败:', error)
        return false
    }
}

// 初始化数据库（包括迁移）
export async function initDatabase(): Promise<void> {
    await migrateFromLocalStorage()
    await initSyncConfig()
}

// ===== 旧图片 URL 迁移 =====

const IMAGE_MIGRATION_KEY = 'litepad-image-url-migrated'

// 旧图片 URL 正则：asset://localhost/path/to/image.ext
const OLD_IMAGE_URL_REGEX = /!\[([^\]]*)\]\(asset:\/\/localhost\/([^)]+)\)/g

// 检查是否需要迁移图片 URL
export async function needsImageUrlMigration(): Promise<boolean> {
    if (localStorage.getItem(IMAGE_MIGRATION_KEY)) {
        return false
    }

    // 检查是否有旧格式的图片 URL
    const tabs = await getAllTabs()
    for (const tab of tabs) {
        if (OLD_IMAGE_URL_REGEX.test(tab.content)) {
            return true
        }
        // 重置正则状态
        OLD_IMAGE_URL_REGEX.lastIndex = 0
    }

    return false
}

// 迁移单个标签页的图片 URL
// 返回更新后的内容和发现的附件信息
export function migrateTabImageUrls(
    content: string,
    hashLookup: (oldPath: string) => { hash: string; ext: string } | null
): {
    newContent: string
    attachments: Array<{ hash: string; ext: string; oldPath: string }>
} {
    const attachments: Array<{ hash: string; ext: string; oldPath: string }> = []
    const regex = new RegExp(OLD_IMAGE_URL_REGEX.source, 'g')

    const newContent = content.replace(regex, (match, alt, oldPath) => {
        const result = hashLookup(oldPath)
        if (result) {
            attachments.push({ ...result, oldPath })
            return `![${alt}](litepad://images/${result.hash}${result.ext})`
        }
        // 如果无法获取 hash，保留原 URL
        return match
    })

    return { newContent, attachments }
}

// 提取所有旧图片路径
export async function extractOldImagePaths(): Promise<string[]> {
    const tabs = await getAllTabs()
    const paths = new Set<string>()

    for (const tab of tabs) {
        const regex = new RegExp(OLD_IMAGE_URL_REGEX.source, 'g')
        let match
        while ((match = regex.exec(tab.content)) !== null) {
            paths.add(match[2]) // oldPath
        }
    }

    return Array.from(paths)
}

// 标记图片迁移完成
export function markImageMigrationComplete(): void {
    localStorage.setItem(IMAGE_MIGRATION_KEY, 'true')
}
