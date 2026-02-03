import * as db from '../db/index.js'
import { verifyAccessToken, JwtPayload } from '../utils/jwt.js'
import { ClientTab, processSyncRequest, dbTabToClientTab } from '../utils/conflict.js'

// WebSocket 消息类型
interface WsMessage {
    type: string
    [key: string]: any
}

// 客户端连接信息
interface ClientInfo {
    userId: string
    email: string
    deviceId?: string
}

// 连接池：userId -> Set<WebSocket>
const connections = new Map<string, Set<WebSocket>>()

// WebSocket 数据
interface WsData {
    client?: ClientInfo
}

/**
 * 验证 WebSocket 连接的 token
 */
export function authenticateWs(token: string): ClientInfo | null {
    const payload = verifyAccessToken(token)
    if (!payload) return null

    return {
        userId: payload.userId,
        email: payload.email
    }
}

/**
 * 添加连接到连接池
 */
export function addConnection(userId: string, ws: WebSocket): void {
    let userConnections = connections.get(userId)
    if (!userConnections) {
        userConnections = new Set()
        connections.set(userId, userConnections)
    }
    userConnections.add(ws)
    console.log(`[WS] 用户 ${userId} 连接，当前连接数: ${userConnections.size}`)
}

/**
 * 从连接池移除连接
 */
export function removeConnection(userId: string, ws: WebSocket): void {
    const userConnections = connections.get(userId)
    if (userConnections) {
        userConnections.delete(ws)
        if (userConnections.size === 0) {
            connections.delete(userId)
        }
        console.log(`[WS] 用户 ${userId} 断开，剩余连接数: ${userConnections.size}`)
    }
}

/**
 * 广播消息给用户的其他连接（除了发送者）
 */
export function broadcastToUser(userId: string, message: WsMessage, excludeWs?: WebSocket): void {
    const userConnections = connections.get(userId)
    if (!userConnections) return

    const msgStr = JSON.stringify(message)
    for (const ws of userConnections) {
        if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
            ws.send(msgStr)
        }
    }
}

/**
 * 处理 WebSocket 消息
 */
export function handleWsMessage(ws: WebSocket, client: ClientInfo, message: WsMessage): void {
    switch (message.type) {
        case 'ping':
            ws.send(JSON.stringify({ type: 'pong', serverTime: Date.now() }))
            break

        case 'push':
            handlePush(ws, client, message.tabs as ClientTab[])
            break

        case 'pull':
            handlePull(ws, client, message.since as number)
            break

        default:
            ws.send(JSON.stringify({ type: 'error', message: '未知的消息类型' }))
    }
}

/**
 * 处理推送请求
 */
function handlePush(ws: WebSocket, client: ClientInfo, clientTabs: ClientTab[]): void {
    if (!Array.isArray(clientTabs)) {
        ws.send(JSON.stringify({ type: 'error', message: '无效的数据格式' }))
        return
    }

    // 获取服务器上的对应标签页
    const serverTabs = new Map(
        db.getUserTabs(client.userId, true).map(t => [t.id, t])
    )

    // 处理同步
    const result = processSyncRequest(clientTabs, serverTabs)

    // 将客户端的变更写入数据库
    const tabsToUpsert = clientTabs.filter(t => result.synced.includes(t.id))
    if (tabsToUpsert.length > 0) {
        db.bulkUpsertTabs(client.userId, tabsToUpsert.map(t => ({
            id: t.id,
            title: t.title,
            content: t.content,
            version: t.localVersion,
            created_at: t.createdAt,
            updated_at: t.updatedAt,
            deleted: t.deleted
        })))

        // 广播变更给用户的其他设备
        broadcastToUser(client.userId, {
            type: 'changes',
            tabs: tabsToUpsert.map(t => ({
                id: t.id,
                title: t.title,
                content: t.content,
                version: t.localVersion,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt,
                deleted: t.deleted
            })),
            serverTime: Date.now()
        }, ws)
    }

    // 返回同步结果
    ws.send(JSON.stringify({
        type: 'ack',
        synced: result.synced,
        updates: result.updates.map(dbTabToClientTab),
        conflicts: result.conflicts.map(c => ({
            local: c.localTab,
            remote: dbTabToClientTab(c.remoteTab)
        })),
        serverTime: Date.now()
    }))
}

/**
 * 处理拉取请求
 */
function handlePull(ws: WebSocket, client: ClientInfo, since: number): void {
    const tabs = db.getTabsSince(client.userId, since || 0)

    ws.send(JSON.stringify({
        type: 'changes',
        tabs: tabs.map(dbTabToClientTab),
        serverTime: Date.now()
    }))
}

// 导出 Node.js 兼容的 WebSocket 处理
export { connections }
