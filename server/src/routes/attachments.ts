import { Hono } from 'hono'
import * as db from '../db/index.js'
import { verifyAccessToken } from '../utils/jwt.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import crypto from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR || path.join(__dirname, '../../data/attachments')

// 确保附件目录存在
if (!fs.existsSync(ATTACHMENTS_DIR)) {
    fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true })
}

const attachments = new Hono()

// 认证中间件
attachments.use('*', async (c, next) => {
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

// 附件元数据类型
interface AttachmentMeta {
    hash: string
    filename: string
    mimeType: string
    size: number
    ext: string
    createdAt: number
}

// 批量推送附件元数据
attachments.post('/meta', async (c) => {
    try {
        const userId = c.get('userId') as string
        const { attachments: metas } = await c.req.json<{ attachments: AttachmentMeta[] }>()

        if (!Array.isArray(metas)) {
            return c.json({ error: '无效的数据格式' }, 400)
        }

        // 转换并保存到数据库
        const dbAttachments = metas.map(m => ({
            hash: m.hash,
            user_id: userId,
            filename: m.filename,
            mime_type: m.mimeType,
            size: m.size,
            ext: m.ext,
            created_at: m.createdAt
        }))

        db.bulkCreateAttachments(dbAttachments)

        // 检查哪些附件文件不存在于服务器
        const needed: string[] = []
        for (const meta of metas) {
            const filePath = path.join(ATTACHMENTS_DIR, `${meta.hash}${meta.ext}`)
            if (!fs.existsSync(filePath)) {
                needed.push(meta.hash)
            }
        }

        return c.json({
            received: metas.length,
            needed,
            serverTime: Date.now()
        })
    } catch (error) {
        console.error('推送附件元数据失败:', error)
        return c.json({ error: '操作失败' }, 500)
    }
})

// 查询服务器缺失的附件
attachments.post('/needed', async (c) => {
    try {
        const userId = c.get('userId') as string
        const { hashes } = await c.req.json<{ hashes: string[] }>()

        if (!Array.isArray(hashes)) {
            return c.json({ error: '无效的数据格式' }, 400)
        }

        // 查找服务器上缺失的附件
        const existingMetas = db.getAttachmentsByHashes(userId, hashes)
        const existingMap = new Map(existingMetas.map(m => [m.hash, m]))

        const needed: string[] = []
        for (const hash of hashes) {
            const meta = existingMap.get(hash)
            if (meta) {
                // 元数据存在，检查文件是否存在
                const filePath = path.join(ATTACHMENTS_DIR, `${hash}${meta.ext}`)
                if (!fs.existsSync(filePath)) {
                    needed.push(hash)
                }
            } else {
                // 元数据不存在，需要客户端上传
                needed.push(hash)
            }
        }

        return c.json({
            needed,
            serverTime: Date.now()
        })
    } catch (error) {
        console.error('查询缺失附件失败:', error)
        return c.json({ error: '操作失败' }, 500)
    }
})

// 上传附件文件
attachments.put('/upload/:hash', async (c) => {
    try {
        const userId = c.get('userId') as string
        const hash = c.req.param('hash')
        const ext = c.req.query('ext') || '.png'

        // 获取请求体
        const body = await c.req.arrayBuffer()
        const buffer = Buffer.from(body)

        // 验证 hash
        const computedHash = crypto.createHash('sha256').update(buffer).digest('hex')
        if (computedHash !== hash) {
            return c.json({
                error: 'Hash 不匹配',
                expected: hash,
                computed: computedHash
            }, 400)
        }

        // 检查文件大小限制 (10MB)
        const MAX_SIZE = 10 * 1024 * 1024
        if (buffer.length > MAX_SIZE) {
            return c.json({ error: '文件过大，最大 10MB' }, 413)
        }

        // 保存文件
        const filename = `${hash}${ext}`
        const filePath = path.join(ATTACHMENTS_DIR, filename)

        // 如果文件已存在（相同 hash），不需要重复写入
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, buffer)
        }

        // 更新或创建元数据
        const existingMeta = db.getAttachment(userId, hash)
        if (!existingMeta) {
            // 创建默认元数据
            db.createAttachment({
                hash,
                user_id: userId,
                filename: filename,
                mime_type: getMimeType(ext),
                size: buffer.length,
                ext,
                created_at: Date.now()
            })
        }

        return c.json({
            hash,
            size: buffer.length,
            serverTime: Date.now()
        })
    } catch (error) {
        console.error('上传附件失败:', error)
        return c.json({ error: '上传失败' }, 500)
    }
})

// 下载附件文件
attachments.get('/download/:hash', async (c) => {
    try {
        const userId = c.get('userId') as string
        const hash = c.req.param('hash')

        // 获取元数据
        const meta = db.getAttachment(userId, hash)
        if (!meta) {
            return c.json({ error: '附件不存在' }, 404)
        }

        // 读取文件
        const filePath = path.join(ATTACHMENTS_DIR, `${hash}${meta.ext}`)
        if (!fs.existsSync(filePath)) {
            return c.json({ error: '文件不存在' }, 404)
        }

        const buffer = fs.readFileSync(filePath)

        // 返回文件内容
        return new Response(buffer, {
            status: 200,
            headers: {
                'Content-Type': meta.mime_type,
                'Content-Length': buffer.length.toString(),
                'Cache-Control': 'max-age=31536000, immutable',
                'X-Attachment-Hash': hash,
                'X-Attachment-Ext': meta.ext,
                'X-Attachment-Filename': encodeURIComponent(meta.filename)
            }
        })
    } catch (error) {
        console.error('下载附件失败:', error)
        return c.json({ error: '下载失败' }, 500)
    }
})

// 批量查询附件元数据
attachments.post('/batch', async (c) => {
    try {
        const userId = c.get('userId') as string
        const { hashes } = await c.req.json<{ hashes: string[] }>()

        if (!Array.isArray(hashes)) {
            return c.json({ error: '无效的数据格式' }, 400)
        }

        const metas = db.getAttachmentsByHashes(userId, hashes)

        return c.json({
            attachments: metas.map(m => ({
                hash: m.hash,
                filename: m.filename,
                mimeType: m.mime_type,
                size: m.size,
                ext: m.ext,
                createdAt: m.created_at
            })),
            serverTime: Date.now()
        })
    } catch (error) {
        console.error('批量查询附件失败:', error)
        return c.json({ error: '查询失败' }, 500)
    }
})

// 获取用户所有附件列表
attachments.get('/list', async (c) => {
    try {
        const userId = c.get('userId') as string
        const metas = db.getUserAttachments(userId)

        return c.json({
            attachments: metas.map(m => ({
                hash: m.hash,
                filename: m.filename,
                mimeType: m.mime_type,
                size: m.size,
                ext: m.ext,
                createdAt: m.created_at
            })),
            serverTime: Date.now()
        })
    } catch (error) {
        console.error('获取附件列表失败:', error)
        return c.json({ error: '查询失败' }, 500)
    }
})

// 根据扩展名获取 MIME 类型
function getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp'
    }
    return mimeTypes[ext.toLowerCase()] || 'application/octet-stream'
}

export default attachments
