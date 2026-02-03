import { Tab, getPendingSyncTabs, markTabsSynced, bulkUpdateTabs, getTab } from '../db'
import { getConfig, emitSyncEvent, SyncStatus, setConfig } from './config'
import { getAccessToken } from './auth'

// WebSocket 消息类型
interface WsMessage {
    type: string
    [key: string]: any
}

// WebSocket 客户端
class SyncWebSocket {
    private ws: WebSocket | null = null
    private status: SyncStatus = 'disconnected'
    private reconnectTimer: NodeJS.Timeout | null = null
    private pingTimer: NodeJS.Timeout | null = null
    private reconnectAttempts = 0
    private maxReconnectAttempts = 5
    private baseReconnectDelay = 1000

    // 连接
    async connect(): Promise<void> {
        const config = await getConfig()
        const token = getAccessToken()

        if (!config.enabled || !token) {
            this.setStatus('disconnected')
            return
        }

        if (this.ws?.readyState === WebSocket.OPEN) {
            return
        }

        this.setStatus('connecting')

        try {
            // 将 http(s):// 转换为 ws(s)://
            const wsUrl = config.serverUrl
                .replace(/^http:/, 'ws:')
                .replace(/^https:/, 'wss:')

            this.ws = new WebSocket(`${wsUrl}/ws?token=${token}`)

            this.ws.onopen = () => {
                console.log('[Sync] WebSocket 已连接')
                this.setStatus('connected')
                this.reconnectAttempts = 0
                this.startPing()
            }

            this.ws.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data))
            }

            this.ws.onclose = (event) => {
                console.log('[Sync] WebSocket 已断开', event.code, event.reason)
                this.setStatus('disconnected')
                this.stopPing()
                this.scheduleReconnect()
            }

            this.ws.onerror = (error) => {
                console.error('[Sync] WebSocket 错误', error)
                this.setStatus('error')
            }
        } catch (error) {
            console.error('[Sync] 连接失败', error)
            this.setStatus('error')
            this.scheduleReconnect()
        }
    }

    // 断开连接
    disconnect(): void {
        this.stopPing()
        this.clearReconnect()

        if (this.ws) {
            this.ws.close(1000, '主动断开')
            this.ws = null
        }

        this.setStatus('disconnected')
    }

    // 发送消息
    private send(message: WsMessage): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message))
        }
    }

    // 推送变更
    async push(tabs: Tab[]): Promise<void> {
        if (tabs.length === 0) return

        this.send({
            type: 'push',
            tabs: tabs.map(t => ({
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
    }

    // 推送待同步的变更
    async pushPending(): Promise<void> {
        const pending = await getPendingSyncTabs()
        await this.push(pending)
    }

    // 拉取变更
    async pull(since?: number): Promise<void> {
        const config = await getConfig()
        this.send({
            type: 'pull',
            since: since || config.lastSyncAt || 0
        })
    }

    // 处理消息
    private async handleMessage(message: WsMessage): Promise<void> {
        switch (message.type) {
            case 'connected':
                console.log('[Sync] 服务器确认连接', message.userId)
                // 连接后：先推送待同步的变更，再拉取离线期间的变更
                await this.pushPending()
                await this.pull()  // 补齐离线期间的变更
                break

            case 'pong':
                // 心跳响应
                break

            case 'ack':
                await this.handleAck(message)
                break

            case 'changes':
                await this.handleChanges(message)
                break

            case 'conflict':
                this.handleConflict(message)
                break

            case 'error':
                console.error('[Sync] 服务器错误', message.message)
                emitSyncEvent({ type: 'sync-error', data: { error: message.message } })
                break
        }
    }

    // 处理同步确认
    private async handleAck(message: WsMessage): Promise<void> {
        const { synced, updates, conflicts, serverTime } = message

        // 标记已同步（使用服务器时间）
        if (synced && synced.length > 0) {
            await markTabsSynced(synced, serverTime)
        }

        // 更新来自服务器的变更
        if (updates && updates.length > 0) {
            const localTabs: Tab[] = updates.map((t: any) => ({
                id: t.id,
                title: t.title,
                content: t.content,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt,
                localVersion: t.version || t.localVersion,
                syncedAt: serverTime,
                deleted: t.deleted
            }))
            await bulkUpdateTabs(localTabs)
            emitSyncEvent({ type: 'remote-changes', data: { tabs: localTabs } })
        }

        // 处理冲突
        if (conflicts && conflicts.length > 0) {
            emitSyncEvent({ type: 'conflict', data: { conflicts } })
        }

        // 更新最后同步时间
        if (serverTime) {
            await setConfig({ lastSyncAt: serverTime })
        }

        emitSyncEvent({ type: 'sync-complete', data: message })
    }

    // 处理来自其他设备的变更
    private async handleChanges(message: WsMessage): Promise<void> {
        const { tabs, serverTime } = message

        if (tabs && tabs.length > 0) {
            const toUpdate: Tab[] = []
            const conflicts: Array<{ local: Tab; remote: any }> = []

            for (const remoteTab of tabs) {
                const localTab = await getTab(remoteTab.id)

                if (!localTab) {
                    // 本地不存在，直接插入
                    toUpdate.push({
                        id: remoteTab.id,
                        title: remoteTab.title,
                        content: remoteTab.content,
                        createdAt: remoteTab.createdAt,
                        updatedAt: remoteTab.updatedAt,
                        localVersion: remoteTab.version || remoteTab.localVersion,
                        syncedAt: serverTime,
                        deleted: remoteTab.deleted
                    })
                } else if (localTab.syncedAt === null) {
                    // 本地是新创建未同步的，标记为冲突
                    conflicts.push({ local: localTab, remote: remoteTab })
                } else if (localTab.updatedAt > localTab.syncedAt) {
                    // 本地有未同步的修改，标记为冲突
                    conflicts.push({ local: localTab, remote: remoteTab })
                } else {
                    // 本地无修改，可以安全覆盖
                    toUpdate.push({
                        id: remoteTab.id,
                        title: remoteTab.title,
                        content: remoteTab.content,
                        createdAt: remoteTab.createdAt,
                        updatedAt: remoteTab.updatedAt,
                        localVersion: remoteTab.version || remoteTab.localVersion,
                        syncedAt: serverTime,
                        deleted: remoteTab.deleted
                    })
                }
            }

            // 更新无冲突的 Tab
            if (toUpdate.length > 0) {
                await bulkUpdateTabs(toUpdate)
                emitSyncEvent({ type: 'remote-changes', data: { tabs: toUpdate } })
            }

            // 触发冲突事件
            if (conflicts.length > 0) {
                emitSyncEvent({ type: 'conflict', data: { conflicts } })
            }
        }

        // 更新最后同步时间
        if (serverTime) {
            await setConfig({ lastSyncAt: serverTime })
        }
    }

    // 处理冲突
    private handleConflict(message: WsMessage): void {
        emitSyncEvent({ type: 'conflict', data: message })
    }

    // 设置状态
    private setStatus(status: SyncStatus): void {
        if (this.status !== status) {
            this.status = status
            emitSyncEvent({ type: 'status-change', data: { status } })
        }
    }

    // 获取当前状态
    getStatus(): SyncStatus {
        return this.status
    }

    // 心跳
    private startPing(): void {
        this.stopPing()
        this.pingTimer = setInterval(() => {
            this.send({ type: 'ping' })
        }, 30000) // 30秒一次
    }

    private stopPing(): void {
        if (this.pingTimer) {
            clearInterval(this.pingTimer)
            this.pingTimer = null
        }
    }

    // 重连
    private scheduleReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('[Sync] 达到最大重连次数')
            return
        }

        this.clearReconnect()

        const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts)
        console.log(`[Sync] ${delay}ms 后重连 (第 ${this.reconnectAttempts + 1} 次)`)

        this.reconnectTimer = setTimeout(() => {
            this.reconnectAttempts++
            this.connect()
        }, delay)
    }

    private clearReconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
        }
    }

    // 重置重连计数
    resetReconnect(): void {
        this.reconnectAttempts = 0
    }
}

// 单例
export const syncWs = new SyncWebSocket()
