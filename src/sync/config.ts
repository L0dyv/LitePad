import { getSyncConfig, updateSyncConfig, SyncConfig } from '../db'

// 默认服务器地址
export const DEFAULT_SERVER_URL = 'https://sync.litepad.app'

// 同步状态
export type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'syncing' | 'error'

// 同步事件
export type SyncEventType =
    | 'status-change'
    | 'sync-complete'
    | 'sync-error'
    | 'conflict'
    | 'remote-changes'
    | 'attachment-downloaded'
    | 'attachment-uploaded'

export interface SyncEvent {
    type: SyncEventType
    data?: any
}

// 同步事件监听器
type SyncEventListener = (event: SyncEvent) => void
const listeners: SyncEventListener[] = []

export function addSyncListener(listener: SyncEventListener): () => void {
    listeners.push(listener)
    return () => {
        const index = listeners.indexOf(listener)
        if (index > -1) listeners.splice(index, 1)
    }
}

export function emitSyncEvent(event: SyncEvent): void {
    listeners.forEach(l => l(event))
}

// 获取同步配置
export async function getConfig(): Promise<SyncConfig> {
    return await getSyncConfig()
}

// 更新同步配置
export async function setConfig(updates: Partial<Omit<SyncConfig, 'id'>>): Promise<void> {
    await updateSyncConfig(updates)
}

// 启用同步
export async function enableSync(serverUrl?: string): Promise<void> {
    await updateSyncConfig({
        enabled: true,
        serverUrl: serverUrl || DEFAULT_SERVER_URL
    })
}

// 禁用同步
export async function disableSync(): Promise<void> {
    await updateSyncConfig({
        enabled: false
    })
}

// 设置用户
export async function setUser(userId: string | null): Promise<void> {
    await updateSyncConfig({
        userId
    })
}

// 清除登录状态
export async function clearAuth(): Promise<void> {
    await updateSyncConfig({
        userId: null,
        lastSyncAt: null
    })
    // 清除 token
    localStorage.removeItem('litepad-access-token')
    localStorage.removeItem('litepad-refresh-token')
}
