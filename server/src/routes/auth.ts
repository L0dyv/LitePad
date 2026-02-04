import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import * as db from '../db/index.js'
import { generateAccessToken, generateRefreshToken, hashPassword, verifyPassword, refreshAccessToken, verifyAccessToken } from '../utils/jwt.js'

const auth = new Hono()

// 注册
auth.post('/register', async (c) => {
    try {
        const { email, password } = await c.req.json<{ email: string; password: string }>()

        // 验证输入
        if (!email || !password) {
            return c.json({ error: '邮箱和密码不能为空' }, 400)
        }

        if (password.length < 6) {
            return c.json({ error: '密码至少6个字符' }, 400)
        }

        // 检查邮箱是否已存在
        const existingUser = db.getUserByEmail(email)
        if (existingUser) {
            return c.json({ error: '该邮箱已注册' }, 409)
        }

        // 创建用户
        const userId = uuidv4()
        const passwordHash = await hashPassword(password)
        const user = db.createUser(userId, email, passwordHash)

        // 生成令牌
        const accessToken = generateAccessToken({ userId: user.id, email: user.email })
        const refreshToken = await generateRefreshToken(user.id)

        return c.json({
            user: {
                id: user.id,
                email: user.email
            },
            accessToken,
            refreshToken
        })
    } catch (error) {
        console.error('注册失败:', error)
        return c.json({ error: '注册失败' }, 500)
    }
})

// 登录
auth.post('/login', async (c) => {
    try {
        const { email, password } = await c.req.json<{ email: string; password: string }>()

        // 验证输入
        if (!email || !password) {
            return c.json({ error: '邮箱和密码不能为空' }, 400)
        }

        // 查找用户
        const user = db.getUserByEmail(email)
        if (!user) {
            return c.json({ error: '邮箱或密码错误' }, 401)
        }

        // 验证密码
        const isValid = await verifyPassword(password, user.password_hash)
        if (!isValid) {
            return c.json({ error: '邮箱或密码错误' }, 401)
        }

        // 生成令牌
        const accessToken = generateAccessToken({ userId: user.id, email: user.email })
        const refreshToken = await generateRefreshToken(user.id)

        return c.json({
            user: {
                id: user.id,
                email: user.email
            },
            accessToken,
            refreshToken
        })
    } catch (error) {
        console.error('登录失败:', error)
        return c.json({ error: '登录失败' }, 500)
    }
})

// 刷新令牌
auth.post('/refresh', async (c) => {
    try {
        const { refreshToken, userId } = await c.req.json<{ refreshToken: string; userId: string }>()

        if (!refreshToken || !userId) {
            return c.json({ error: '缺少参数' }, 400)
        }

        // 验证 refresh token 并生成新的 access token
        const accessToken = await refreshAccessToken(refreshToken, userId)
        if (!accessToken) {
            return c.json({ error: 'refresh token 无效' }, 401)
        }

        return c.json({ accessToken })
    } catch (error) {
        console.error('刷新令牌失败:', error)
        return c.json({ error: '刷新令牌失败' }, 500)
    }
})

// 登出（删除刷新令牌）
auth.post('/logout', async (c) => {
    try {
        const authHeader = c.req.header('Authorization')
        if (!authHeader?.startsWith('Bearer ')) {
            return c.json({ error: '未授权' }, 401)
        }

        const token = authHeader.slice('Bearer '.length)
        const payload = verifyAccessToken(token)
        if (!payload) {
            return c.json({ error: '未授权' }, 401)
        }

        db.deleteUserRefreshTokens(payload.userId)
        return c.json({ success: true })
    } catch (error) {
        console.error('登出失败:', error)
        return c.json({ error: '登出失败' }, 500)
    }
})

export default auth
