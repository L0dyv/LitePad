// 数据库表结构

export const SCHEMA = `
-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

-- 标签页表
CREATE TABLE IF NOT EXISTS tabs (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    pinned INTEGER NOT NULL DEFAULT 0,
    tab_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 索引：按用户和更新时间查询
CREATE INDEX IF NOT EXISTS idx_tabs_user_updated ON tabs(user_id, updated_at);

-- 索引：按用户查询未删除的标签页
CREATE INDEX IF NOT EXISTS idx_tabs_user_active ON tabs(user_id, deleted);

-- 刷新令牌表（用于长期登录）
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 索引：按用户查询刷新令牌
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- 索引：按 refresh token hash 查询（刷新接口使用）
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- 附件表（图片等）
CREATE TABLE IF NOT EXISTS attachments (
    hash TEXT NOT NULL,
    user_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    ext TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (hash, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 索引：按用户查询附件
CREATE INDEX IF NOT EXISTS idx_attachments_user ON attachments(user_id);
`;

// Tab 类型定义
export interface DbTab {
    id: string
    user_id: string
    title: string
    content: string
    version: number
    created_at: number
    updated_at: number
    deleted: number // SQLite 用 0/1 表示 boolean
    pinned: number // SQLite 用 0/1 表示 boolean
    tab_order: number
}

// User 类型定义
export interface DbUser {
    id: string
    email: string
    password_hash: string
    created_at: number
}

// RefreshToken 类型定义
export interface DbRefreshToken {
    id: string
    user_id: string
    token_hash: string
    expires_at: number
    created_at: number
}

// Attachment 类型定义
export interface DbAttachment {
    hash: string
    user_id: string
    filename: string
    mime_type: string
    size: number
    ext: string
    created_at: number
}
