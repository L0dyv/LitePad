import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import { SCHEMA, DbTab, DbUser, DbRefreshToken, DbAttachment } from './schema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/litepad.db')

// 数据库实例
let db: Database.Database | null = null

// 获取数据库实例
export function getDb(): Database.Database {
    if (!db) {
        db = new Database(DB_PATH)
        db.pragma('journal_mode = WAL')
        db.pragma('foreign_keys = ON')
        // 初始化表结构
        db.exec(SCHEMA)
    }
    return db
}

// 关闭数据库
export function closeDb(): void {
    if (db) {
        db.close()
        db = null
    }
}

// ===== 用户操作 =====

export function createUser(id: string, email: string, passwordHash: string): DbUser {
    const db = getDb()
    const now = Date.now()
    const stmt = db.prepare(`
        INSERT INTO users (id, email, password_hash, created_at)
        VALUES (?, ?, ?, ?)
    `)
    stmt.run(id, email, passwordHash, now)
    return { id, email, password_hash: passwordHash, created_at: now }
}

export function getUserByEmail(email: string): DbUser | undefined {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?')
    return stmt.get(email) as DbUser | undefined
}

export function getUserById(id: string): DbUser | undefined {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?')
    return stmt.get(id) as DbUser | undefined
}

// ===== 标签页操作 =====

export function getUserTabs(userId: string, includeDeleted = false): DbTab[] {
    const db = getDb()
    const stmt = includeDeleted
        ? db.prepare('SELECT * FROM tabs WHERE user_id = ? ORDER BY updated_at DESC')
        : db.prepare('SELECT * FROM tabs WHERE user_id = ? AND deleted = 0 ORDER BY updated_at DESC')
    return stmt.all(userId) as DbTab[]
}

export function getTabsSince(userId: string, since: number): DbTab[] {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM tabs WHERE user_id = ? AND updated_at > ? ORDER BY updated_at ASC')
    return stmt.all(userId, since) as DbTab[]
}

export function getTab(userId: string, tabId: string): DbTab | undefined {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM tabs WHERE user_id = ? AND id = ?')
    return stmt.get(userId, tabId) as DbTab | undefined
}

export function upsertTab(userId: string, tab: {
    id: string
    title: string
    content: string
    version: number
    created_at: number
    updated_at: number
    deleted: boolean
}): DbTab {
    const db = getDb()

    // 检查是否已存在
    const existing = getTab(userId, tab.id)

    if (existing) {
        // 只有版本更高才更新
        if (tab.version > existing.version) {
            const stmt = db.prepare(`
                UPDATE tabs SET
                    title = ?,
                    content = ?,
                    version = ?,
                    updated_at = ?,
                    deleted = ?
                WHERE user_id = ? AND id = ?
            `)
            stmt.run(tab.title, tab.content, tab.version, tab.updated_at, tab.deleted ? 1 : 0, userId, tab.id)
        }
    } else {
        // 新建
        const stmt = db.prepare(`
            INSERT INTO tabs (id, user_id, title, content, version, created_at, updated_at, deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        stmt.run(tab.id, userId, tab.title, tab.content, tab.version, tab.created_at, tab.updated_at, tab.deleted ? 1 : 0)
    }

    return getTab(userId, tab.id)!
}

export function bulkUpsertTabs(userId: string, tabs: Array<{
    id: string
    title: string
    content: string
    version: number
    created_at: number
    updated_at: number
    deleted: boolean
}>): DbTab[] {
    const db = getDb()
    const results: DbTab[] = []

    const transaction = db.transaction(() => {
        for (const tab of tabs) {
            const result = upsertTab(userId, tab)
            results.push(result)
        }
    })

    transaction()
    return results
}

// ===== 刷新令牌操作 =====

export function createRefreshToken(id: string, userId: string, tokenHash: string, expiresAt: number): DbRefreshToken {
    const db = getDb()
    const now = Date.now()
    const stmt = db.prepare(`
        INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
    `)
    stmt.run(id, userId, tokenHash, expiresAt, now)
    return { id, user_id: userId, token_hash: tokenHash, expires_at: expiresAt, created_at: now }
}

export function getRefreshToken(tokenHash: string): DbRefreshToken | undefined {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?')
    return stmt.get(tokenHash) as DbRefreshToken | undefined
}

export function getUserRefreshTokens(userId: string): DbRefreshToken[] {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM refresh_tokens WHERE user_id = ?')
    return stmt.all(userId) as DbRefreshToken[]
}

export function updateRefreshTokenHash(id: string, tokenHash: string): void {
    const db = getDb()
    const stmt = db.prepare('UPDATE refresh_tokens SET token_hash = ? WHERE id = ?')
    stmt.run(tokenHash, id)
}

export function deleteRefreshToken(id: string): void {
    const db = getDb()
    const stmt = db.prepare('DELETE FROM refresh_tokens WHERE id = ?')
    stmt.run(id)
}

export function deleteUserRefreshTokens(userId: string): void {
    const db = getDb()
    const stmt = db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?')
    stmt.run(userId)
}

export function cleanExpiredRefreshTokens(): void {
    const db = getDb()
    const stmt = db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?')
    stmt.run(Date.now())
}

// ===== 附件操作 =====

export function getAttachment(userId: string, hash: string): DbAttachment | undefined {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM attachments WHERE user_id = ? AND hash = ?')
    return stmt.get(userId, hash) as DbAttachment | undefined
}

export function getUserAttachments(userId: string): DbAttachment[] {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM attachments WHERE user_id = ? ORDER BY created_at DESC')
    return stmt.all(userId) as DbAttachment[]
}

export function hasAttachment(userId: string, hash: string): boolean {
    const attachment = getAttachment(userId, hash)
    return !!attachment
}

export function createAttachment(attachment: DbAttachment): DbAttachment {
    const db = getDb()
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO attachments (hash, user_id, filename, mime_type, size, ext, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
        attachment.hash,
        attachment.user_id,
        attachment.filename,
        attachment.mime_type,
        attachment.size,
        attachment.ext,
        attachment.created_at
    )
    return attachment
}

export function bulkCreateAttachments(attachments: DbAttachment[]): void {
    const db = getDb()
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO attachments (hash, user_id, filename, mime_type, size, ext, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const transaction = db.transaction(() => {
        for (const attachment of attachments) {
            stmt.run(
                attachment.hash,
                attachment.user_id,
                attachment.filename,
                attachment.mime_type,
                attachment.size,
                attachment.ext,
                attachment.created_at
            )
        }
    })

    transaction()
}

export function getAttachmentsByHashes(userId: string, hashes: string[]): DbAttachment[] {
    if (hashes.length === 0) return []

    const db = getDb()
    const placeholders = hashes.map(() => '?').join(',')
    const stmt = db.prepare(`
        SELECT * FROM attachments
        WHERE user_id = ? AND hash IN (${placeholders})
    `)
    return stmt.all(userId, ...hashes) as DbAttachment[]
}

export function getMissingAttachmentHashes(userId: string, hashes: string[]): string[] {
    if (hashes.length === 0) return []

    const existing = getAttachmentsByHashes(userId, hashes)
    const existingSet = new Set(existing.map(a => a.hash))
    return hashes.filter(h => !existingSet.has(h))
}

export function deleteAttachment(userId: string, hash: string): void {
    const db = getDb()
    const stmt = db.prepare('DELETE FROM attachments WHERE user_id = ? AND hash = ?')
    stmt.run(userId, hash)
}
