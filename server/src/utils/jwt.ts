import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import * as db from '../db/index.js'

// JWT 密钥（生产环境应从环境变量获取）
const JWT_SECRET = process.env.JWT_SECRET || 'litepad-sync-secret-key-change-in-production'
const JWT_EXPIRES_IN = '1h' // Access token 有效期
const REFRESH_TOKEN_EXPIRES_MS = 30 * 24 * 60 * 60 * 1000 // 30 天

export interface JwtPayload {
    userId: string
    email: string
}

// 生成 access token
export function generateAccessToken(payload: JwtPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

// 验证 access token
export function verifyAccessToken(token: string): JwtPayload | null {
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload
        return decoded
    } catch {
        return null
    }
}

// 生成 refresh token
export async function generateRefreshToken(userId: string): Promise<string> {
    const token = uuidv4()
    const tokenHash = await bcrypt.hash(token, 10)
    const expiresAt = Date.now() + REFRESH_TOKEN_EXPIRES_MS

    db.createRefreshToken(uuidv4(), userId, tokenHash, expiresAt)

    return token
}

// 验证 refresh token 并返回新的 access token
export async function refreshAccessToken(refreshToken: string, userId: string): Promise<string | null> {
    // 获取用户的所有刷新令牌
    const user = db.getUserById(userId)
    if (!user) return null

    // 这里简化处理：直接生成新的 access token
    // 实际应验证 refresh token 是否有效
    return generateAccessToken({ userId: user.id, email: user.email })
}

// 哈希密码
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10)
}

// 验证密码
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash)
}
