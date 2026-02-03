// 同步模块入口

export * from './config'
export * from './auth'
export * from './api'
export * from './attachments'
export { syncWs } from './websocket'

import { syncWs } from './websocket'
import { getConfig, addSyncListener, SyncStatus, disableSync } from './config'
import { isLoggedIn, logout } from './auth'
import { sync as apiSync } from './api'
import { syncAttachments } from './attachments'

// 初始化同步
export async function initSync(): Promise<void> {
    const config = await getConfig()

    if (!config.enabled || !isLoggedIn()) {
        return
    }

    // 连接 WebSocket
    await syncWs.connect()
}

// 启动同步（登录后调用）
export async function startSync(): Promise<void> {
    const config = await getConfig()

    if (!config.enabled || !isLoggedIn()) {
        throw new Error('请先登录')
    }

    // 先进行一次完整同步（标签页）
    await apiSync()

    // 同步附件
    try {
        await syncAttachments()
    } catch (error) {
        console.error('附件同步失败:', error)
        // 附件同步失败不阻止整体流程
    }

    // 然后连接 WebSocket 保持实时同步
    await syncWs.connect()
}

// 停止同步
export function stopSync(): void {
    syncWs.disconnect()
}

// 退出登录
export async function logoutAndStopSync(): Promise<void> {
    stopSync()
    await logout()
}

// 禁用同步并退出
export async function disableSyncAndLogout(): Promise<void> {
    stopSync()
    await logout()
    await disableSync()
}

// 获取当前状态
export function getSyncStatus(): SyncStatus {
    return syncWs.getStatus()
}

// 手动触发同步
export async function manualSync(): Promise<void> {
    if (!isLoggedIn()) {
        throw new Error('请先登录')
    }

    // 推送待同步的变更
    await syncWs.pushPending()
}

// 监听状态变化
export function onStatusChange(callback: (status: SyncStatus) => void): () => void {
    return addSyncListener((event) => {
        if (event.type === 'status-change') {
            callback(event.data.status)
        }
    })
}
