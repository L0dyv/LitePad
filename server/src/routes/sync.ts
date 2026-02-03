import { Hono } from 'hono'
import * as db from '../db/index.js'
import { verifyAccessToken } from '../utils/jwt.js'
import { ClientTab, processSyncRequest, dbTabToClientTab } from '../utils/conflict.js'

const sync = new Hono()

// 认证中间件
sync.use('*', async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: '未授权' }, 401)
    }

    const token = authHeader.slice(7)
    const payload = verifyAccessToken(token)
    if (!payload) {
        return c.json({ error: '令牌无效或已过期' }, 401)
    }

    // 将用户信息存入上下文
    c.set('userId', payload.userId)
    c.set('email', payload.email)

    await next()
})

// 全量拉取（首次同步）
sync.get('/full', async (c) => {
    try {
        const userId = c.get('userId') as string
        const tabs = db.getUserTabs(userId, true) // 包含已删除的

        return c.json({
            tabs: tabs.map(dbTabToClientTab),
            serverTime: Date.now()
        })
    } catch (error) {
        console.error('全量拉取失败:', error)
        return c.json({ error: '同步失败' }, 500)
    }
})

// 增量拉取（since 时间戳之后的变更）
sync.get('/pull', async (c) => {
    try {
        const userId = c.get('userId') as string
        const since = parseInt(c.req.query('since') || '0')

        const tabs = db.getTabsSince(userId, since)

        return c.json({
            tabs: tabs.map(dbTabToClientTab),
            serverTime: Date.now()
        })
    } catch (error) {
        console.error('增量拉取失败:', error)
        return c.json({ error: '同步失败' }, 500)
    }
})

// 推送变更
sync.post('/push', async (c) => {
    try {
        const userId = c.get('userId') as string
        const { tabs: clientTabs } = await c.req.json<{ tabs: ClientTab[] }>()

        if (!Array.isArray(clientTabs)) {
            return c.json({ error: '无效的数据格式' }, 400)
        }

        // 获取服务器上的对应标签页
        const serverTabs = new Map(
            db.getUserTabs(userId, true).map(t => [t.id, t])
        )

        // 处理同步
        const result = processSyncRequest(clientTabs, serverTabs)

        // 将客户端的变更写入数据库
        const tabsToUpsert = clientTabs.filter(t => result.synced.includes(t.id))
        if (tabsToUpsert.length > 0) {
            db.bulkUpsertTabs(userId, tabsToUpsert.map(t => ({
                id: t.id,
                title: t.title,
                content: t.content,
                version: t.localVersion,
                created_at: t.createdAt,
                updated_at: t.updatedAt,
                deleted: t.deleted
            })))
        }

        return c.json({
            synced: result.synced,
            updates: result.updates.map(dbTabToClientTab),
            conflicts: result.conflicts.map(c => ({
                local: c.localTab,
                remote: dbTabToClientTab(c.remoteTab)
            })),
            serverTime: Date.now()
        })
    } catch (error) {
        console.error('推送变更失败:', error)
        return c.json({ error: '同步失败' }, 500)
    }
})

export default sync
