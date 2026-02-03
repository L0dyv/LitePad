// 旧图片 URL 迁移工具
// 仅对从 v1.x 升级到 v2.0.0 的用户执行
// v2.0.0+ 新用户不需要此迁移

import {
    needsImageUrlMigration,
    extractOldImagePaths,
    getAllTabs,
    updateTab,
    putAttachment,
    markImageMigrationComplete,
    type Attachment
} from '../db'

// 旧图片 URL 正则
const OLD_IMAGE_URL_REGEX = /!\[([^\]]*)\]\(asset:\/\/localhost\/([^)]+)\)/g

// 版本记录 key
const LAST_VERSION_KEY = 'litepad-last-version'

// 需要执行迁移的最低版本（低于此版本需要迁移）
const MIGRATION_REQUIRED_BELOW = '2.0.0'

/**
 * 比较版本号
 * @returns -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number)
    const partsB = b.split('.').map(Number)

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const numA = partsA[i] || 0
        const numB = partsB[i] || 0
        if (numA < numB) return -1
        if (numA > numB) return 1
    }
    return 0
}

/**
 * 检查是否需要执行旧图片迁移（基于版本号）
 * 只有从 < 2.0.0 升级上来的用户才需要迁移
 */
function shouldMigrateBasedOnVersion(): boolean {
    const lastVersion = localStorage.getItem(LAST_VERSION_KEY)

    // 如果没有记录上次版本，检查是否有其他 LitePad 数据
    // 有数据说明是老用户升级，需要迁移
    if (!lastVersion) {
        const hasLegacyData = localStorage.getItem('flashpad-data') !== null ||
            localStorage.getItem('litepad-indexeddb-migrated') !== null
        return hasLegacyData
    }

    // 如果上次版本 < 2.0.0，需要迁移
    return compareVersions(lastVersion, MIGRATION_REQUIRED_BELOW) < 0
}

/**
 * 更新版本记录
 */
export function updateVersionRecord(currentVersion: string): void {
    localStorage.setItem(LAST_VERSION_KEY, currentVersion)
}

/**
 * 执行旧图片 URL 迁移
 * 将 asset://localhost/... 格式迁移为 litepad://images/... 格式
 * 只对从 < 2.0.0 升级的用户执行
 */
export async function migrateOldImageUrls(): Promise<{
    migrated: number
    failed: number
    skipped: number
}> {
    // 首先检查版本：只有 < 2.0.0 的用户需要迁移
    if (!shouldMigrateBasedOnVersion()) {
        console.log('[Migration] 版本 >= 2.0.0 或新用户，跳过旧图片迁移')
        return { migrated: 0, failed: 0, skipped: 0 }
    }

    // 检查是否需要迁移（基于数据内容）
    const needsMigration = await needsImageUrlMigration()
    if (!needsMigration) {
        return { migrated: 0, failed: 0, skipped: 0 }
    }

    console.log('[Migration] 开始迁移旧图片 URL...')

    // 提取所有旧图片路径
    const oldPaths = await extractOldImagePaths()
    if (oldPaths.length === 0) {
        markImageMigrationComplete()
        return { migrated: 0, failed: 0, skipped: 0 }
    }

    console.log(`[Migration] 发现 ${oldPaths.length} 个旧图片路径`)

    // 检查哪些文件存在
    const existsResults = await window.electronAPI?.checkOldImagesExist(oldPaths)
    if (!existsResults) {
        console.error('[Migration] 无法检查文件存在性')
        return { migrated: 0, failed: oldPaths.length, skipped: 0 }
    }

    // 构建路径到 hash 的映射
    const pathToHash = new Map<string, { hash: string; ext: string; newUrl: string }>()
    let migrated = 0
    let failed = 0
    let skipped = 0

    for (let i = 0; i < oldPaths.length; i++) {
        const oldPath = oldPaths[i]
        const exists = existsResults[i]

        if (!exists) {
            console.warn(`[Migration] 文件不存在，跳过: ${oldPath}`)
            skipped++
            continue
        }

        try {
            const result = await window.electronAPI?.migrateOldImage(oldPath)
            if (result) {
                pathToHash.set(oldPath, {
                    hash: result.hash,
                    ext: result.ext,
                    newUrl: result.newUrl
                })

                // 创建附件记录
                const attachment: Attachment = {
                    hash: result.hash,
                    filename: oldPath.split(/[/\\]/).pop() || `image${result.ext}`,
                    mimeType: getMimeType(result.ext),
                    size: result.size,
                    ext: result.ext,
                    localPath: '',
                    syncStatus: 'pending',
                    createdAt: Date.now(),
                    syncedAt: null
                }
                await putAttachment(attachment)

                migrated++
                console.log(`[Migration] 迁移成功: ${oldPath} -> ${result.newUrl}`)
            }
        } catch (error) {
            console.error(`[Migration] 迁移失败: ${oldPath}`, error)
            failed++
        }
    }

    // 更新所有标签页的内容
    const tabs = await getAllTabs()
    for (const tab of tabs) {
        let newContent = tab.content
        let hasChanges = false

        // 替换所有旧 URL
        newContent = newContent.replace(
            new RegExp(OLD_IMAGE_URL_REGEX.source, 'g'),
            (match, alt, oldPath) => {
                const result = pathToHash.get(oldPath)
                if (result) {
                    hasChanges = true
                    return `![${alt}](${result.newUrl})`
                }
                return match
            }
        )

        // 如果有变化，更新标签页
        if (hasChanges) {
            await updateTab(tab.id, { content: newContent })
            console.log(`[Migration] 更新标签页内容: ${tab.title}`)
        }
    }

    // 标记迁移完成
    markImageMigrationComplete()
    console.log(`[Migration] 迁移完成: 成功 ${migrated}, 失败 ${failed}, 跳过 ${skipped}`)

    return { migrated, failed, skipped }
}

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
    return mimeTypes[ext.toLowerCase()] || 'image/png'
}
