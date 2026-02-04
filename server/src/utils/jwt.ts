import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import * as db from '../db/index.js'

// JWT 密钥（生产环境应从环境变量获取）
const JWT_SECRET = process.env.JWT_SECRET || 'litepad-sync-secret-key-change-in-production'
const JWT_EXPIRES_IN = '1h' // Access token 有效期
const REFRESH_TOKEN_EXPIRES_MS = 30 * 24 * 60 * 60 * 1000 // 30 天

export interface JwtPayload {
    userId: string
    email: string
}

function sha256Hex(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex')
}

function isBcryptHash(value: string): boolean {
    return value.startsWith('$2')
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
    const tokenHash = sha256Hex(token)
    const expiresAt = Date.now() + REFRESH_TOKEN_EXPIRES_MS

    db.createRefreshToken(uuidv4(), userId, tokenHash, expiresAt)

    return token
}

// 验证 refresh token 并返回新的 access token
export async function refreshAccessToken(refreshToken: string, userId: string): Promise<string | null> {
    // 验证 refresh token 并返回新的 access token
    const user = db.getUserById(userId)
    if (!user) return null

    const now = Date.now()
    const refreshTokenHash = sha256Hex(refreshToken)

    // Fast path: current implementation stores sha256(token) for lookup
    let stored = db.getRefreshToken(refreshTokenHash)

    // Extra safety: ensure token belongs to the requested user
    if (stored && stored.user_id !== userId) {
        stored = undefined
    }

    // Backward compatibility: older versions stored refreshToken as bcrypt hash (not directly queryable)
    if (!stored) {
        const userTokens = db.getUserRefreshTokens(userId)

        for (const tokenRow of userTokens) {
            if (tokenRow.expires_at < now) {
                db.deleteRefreshToken(tokenRow.id)
                continue
            }

            if (tokenRow.token_hash === refreshTokenHash) {
                stored = tokenRow
                break
            }

            if (isBcryptHash(tokenRow.token_hash)) {
                const match = await bcrypt.compare(refreshToken, tokenRow.token_hash)
                if (match) {
                    stored = tokenRow
                    // One-time migration to sha256 for fast lookup next time
                    db.updateRefreshTokenHash(tokenRow.id, refreshTokenHash)
                    break
                }
            }
        }
    } else if (stored.expires_at < now) {
        db.deleteRefreshToken(stored.id)
        return null
    }

    if (!stored) return null

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
