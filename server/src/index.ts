import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import auth from './routes/auth.js'
import sync from './routes/sync.js'
import attachments from './routes/attachments.js'
import { authenticateWs, addConnection, removeConnection, handleWsMessage, connections } from './ws/handler.js'
import { getDb, closeDb } from './db/index.js'

const app = new Hono()

// WebSocket 升级支持
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

// 中间件
app.use('*', cors({
    origin: '*', // 生产环境应限制
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}))
app.use('*', logger())

// 健康检查
app.get('/', (c) => {
    return c.json({
        name: 'LitePad Sync Server',
        version: '1.0.0',
        status: 'ok',
        time: new Date().toISOString()
    })
})

app.get('/health', (c) => {
    return c.json({ status: 'ok', time: Date.now() })
})

// API 路由
app.route('/auth', auth)
app.route('/sync', sync)
app.route('/attachments', attachments)

// WebSocket 路由
app.get('/ws', upgradeWebSocket((c) => {
    // 从查询参数获取 token
    const token = c.req.query('token')

    return {
        onOpen(evt, ws) {
            if (!token) {
                ws.send(JSON.stringify({ type: 'error', message: '缺少认证令牌' }))
                ws.close(1008, '缺少认证令牌')
                return
            }

            const client = authenticateWs(token)
            if (!client) {
                ws.send(JSON.stringify({ type: 'error', message: '认证失败' }))
                ws.close(1008, '认证失败')
                return
            }

            // 存储客户端信息
            const rawWs = ws.raw as WebSocket
                ; (rawWs as any).__client = client

            // 添加到连接池
            addConnection(client.userId, rawWs)

            // 发送连接成功消息
            ws.send(JSON.stringify({
                type: 'connected',
                userId: client.userId,
                serverTime: Date.now()
            }))
        },

        onMessage(evt, ws) {
            const rawWs = ws.raw as WebSocket
            const client = (rawWs as any).__client

            if (!client) {
                ws.send(JSON.stringify({ type: 'error', message: '未认证' }))
                return
            }

            try {
                const message = JSON.parse(evt.data.toString())
                handleWsMessage(rawWs, client, message)
            } catch (error) {
                console.error('[WS] 解析消息失败:', error)
                ws.send(JSON.stringify({ type: 'error', message: '无效的消息格式' }))
            }
        },

        onClose(evt, ws) {
            const rawWs = ws.raw as WebSocket
            const client = (rawWs as any).__client

            if (client) {
                removeConnection(client.userId, rawWs)
            }
        },

        onError(evt, ws) {
            console.error('[WS] 错误:', evt)
        }
    }
}))

// 启动服务器
const PORT = parseInt(process.env.PORT || '3000')

// 初始化数据库
getDb()
console.log('数据库初始化完成')

const server = serve({
    fetch: app.fetch,
    port: PORT
}, (info) => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║           LitePad Sync Server                         ║
╠═══════════════════════════════════════════════════════╣
║  HTTP:  http://localhost:${PORT}                        ║
║  WS:    ws://localhost:${PORT}/ws                       ║
╚═══════════════════════════════════════════════════════╝
`)
})

// 注入 WebSocket 支持
injectWebSocket(server)

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...')
    closeDb()
    process.exit(0)
})

process.on('SIGTERM', () => {
    console.log('\n正在关闭服务器...')
    closeDb()
    process.exit(0)
})

export default app
