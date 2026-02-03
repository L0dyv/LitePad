// 附件同步模块

import {
    Attachment,
    getPendingSyncAttachments,
    getAllAttachments,
    putAttachment,
    updateAttachmentSyncStatus,
    bulkUpdateAttachmentSyncStatus,
    hasAttachment,
    parseImageHashesFromContent,
    getAllTabs
} from '../db'
import { getConfig, emitSyncEvent } from './config'
import { authFetch } from './auth'

// 服务器返回的附件元数据格式
interface ServerAttachmentMeta {
    hash: string
    filename: string
    mimeType: string
    size: number
    ext: string
    createdAt: number
}

// 推送附件元数据
export async function pushAttachmentMeta(): Promise<{
    received: number
    needed: string[]
}> {
    const config = await getConfig()
    if (!config.enabled) {
        throw new Error('同步未启用')
    }

    // 获取所有待同步的附件
    const pendingAttachments = await getPendingSyncAttachments()

    if (pendingAttachments.length === 0) {
        return { received: 0, needed: [] }
    }

    const response = await authFetch(`${config.serverUrl}/attachments/meta`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            attachments: pendingAttachments.map(a => ({
                hash: a.hash,
                filename: a.filename,
                mimeType: a.mimeType,
                size: a.size,
                ext: a.ext,
                createdAt: a.createdAt
            }))
        })
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '推送附件元数据失败')
    }

    const result = await response.json()
    return result
}

// 上传单个附件文件
export async function uploadAttachment(attachment: Attachment): Promise<void> {
    const config = await getConfig()
    if (!config.enabled) {
        throw new Error('同步未启用')
    }

    // 读取本地文件
    const buffer = await window.electronAPI?.readImage(attachment.hash, attachment.ext)
    if (!buffer) {
        throw new Error(`无法读取本地附件: ${attachment.hash}`)
    }

    const response = await authFetch(
        `${config.serverUrl}/attachments/upload/${attachment.hash}?ext=${encodeURIComponent(attachment.ext)}`,
        {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/octet-stream'
            },
            body: buffer
        }
    )

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '上传附件失败')
    }

    // 更新同步状态
    const result = await response.json()
    await updateAttachmentSyncStatus(attachment.hash, 'synced', result.serverTime)
}

// 批量上传附件
export async function uploadPendingAttachments(): Promise<{
    uploaded: number
    failed: string[]
}> {
    // 先推送元数据，获取需要上传的列表
    const { needed } = await pushAttachmentMeta()

    if (needed.length === 0) {
        // 所有附件服务器都有了，标记为已同步
        const pending = await getPendingSyncAttachments()
        if (pending.length > 0) {
            await bulkUpdateAttachmentSyncStatus(
                pending.map(a => a.hash),
                'synced',
                Date.now()
            )
        }
        return { uploaded: 0, failed: [] }
    }

    // 获取需要上传的附件详情
    const allAttachments = await getAllAttachments()
    const attachmentMap = new Map(allAttachments.map(a => [a.hash, a]))

    const uploaded: string[] = []
    const failed: string[] = []

    for (const hash of needed) {
        const attachment = attachmentMap.get(hash)
        if (!attachment) {
            failed.push(hash)
            continue
        }

        try {
            await uploadAttachment(attachment)
            uploaded.push(hash)
        } catch (error) {
            console.error(`上传附件失败 ${hash}:`, error)
            failed.push(hash)
            await updateAttachmentSyncStatus(hash, 'error')
        }
    }

    // 标记成功上传的附件
    if (uploaded.length > 0) {
        await bulkUpdateAttachmentSyncStatus(uploaded, 'synced', Date.now())
    }

    // 标记没有上传需求的为已同步
    const notNeeded = (await getPendingSyncAttachments())
        .filter(a => !needed.includes(a.hash))
        .map(a => a.hash)

    if (notNeeded.length > 0) {
        await bulkUpdateAttachmentSyncStatus(notNeeded, 'synced', Date.now())
    }

    return { uploaded: uploaded.length, failed }
}

// 下载单个附件
export async function downloadAttachment(hash: string): Promise<void> {
    const config = await getConfig()
    if (!config.enabled) {
        throw new Error('同步未启用')
    }

    // 标记为下载中
    await updateAttachmentSyncStatus(hash, 'downloading')

    try {
        const response = await authFetch(`${config.serverUrl}/attachments/download/${hash}`)

        if (!response.ok) {
            throw new Error('下载附件失败')
        }

        // 从响应头获取元数据
        const ext = response.headers.get('X-Attachment-Ext') || '.png'
        const filename = decodeURIComponent(response.headers.get('X-Attachment-Filename') || `${hash}${ext}`)
        const mimeType = response.headers.get('Content-Type') || 'image/png'
        const size = parseInt(response.headers.get('Content-Length') || '0')

        // 读取文件内容
        const buffer = await response.arrayBuffer()

        // 保存到本地
        await window.electronAPI?.saveDownloadedImage(hash, ext, buffer)

        // 保存/更新元数据
        const attachment: Attachment = {
            hash,
            filename,
            mimeType,
            size,
            ext,
            localPath: '',
            syncStatus: 'synced',
            createdAt: Date.now(),
            syncedAt: Date.now()
        }
        await putAttachment(attachment)

        emitSyncEvent({
            type: 'attachment-downloaded',
            data: { hash, filename }
        })
    } catch (error) {
        await updateAttachmentSyncStatus(hash, 'error')
        throw error
    }
}

// 查找并下载缺失的附件
export async function downloadMissingAttachments(): Promise<{
    downloaded: number
    failed: string[]
}> {
    // 扫描所有笔记内容，提取图片引用
    const tabs = await getAllTabs()
    const referencedHashes = new Set<string>()

    for (const tab of tabs) {
        const hashes = parseImageHashesFromContent(tab.content)
        hashes.forEach(h => referencedHashes.add(h))
    }

    if (referencedHashes.size === 0) {
        return { downloaded: 0, failed: [] }
    }

    // 检查本地缺失的附件
    const missingHashes: string[] = []
    for (const hash of referencedHashes) {
        const exists = await hasAttachment(hash)
        if (!exists) {
            // 还需要检查本地文件是否存在
            // 这里假设如果 IndexedDB 中没有记录，那就需要下载
            missingHashes.push(hash)
        }
    }

    if (missingHashes.length === 0) {
        return { downloaded: 0, failed: [] }
    }

    // 从服务器查询这些附件的元数据
    const config = await getConfig()
    const response = await authFetch(`${config.serverUrl}/attachments/batch`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ hashes: missingHashes })
    })

    if (!response.ok) {
        throw new Error('查询附件元数据失败')
    }

    const { attachments: serverMetas } = await response.json() as {
        attachments: ServerAttachmentMeta[]
    }

    // 下载每个附件
    const downloaded: string[] = []
    const failed: string[] = []

    for (const meta of serverMetas) {
        try {
            await downloadAttachment(meta.hash)
            downloaded.push(meta.hash)
        } catch (error) {
            console.error(`下载附件失败 ${meta.hash}:`, error)
            failed.push(meta.hash)
        }
    }

    // 标记不存在于服务器的为失败
    const serverHashes = new Set(serverMetas.map(m => m.hash))
    for (const hash of missingHashes) {
        if (!serverHashes.has(hash) && !downloaded.includes(hash)) {
            failed.push(hash)
        }
    }

    return { downloaded: downloaded.length, failed }
}

// 完整附件同步流程
export async function syncAttachments(): Promise<{
    uploaded: number
    downloaded: number
    failed: string[]
}> {
    const uploadResult = await uploadPendingAttachments()
    const downloadResult = await downloadMissingAttachments()

    return {
        uploaded: uploadResult.uploaded,
        downloaded: downloadResult.downloaded,
        failed: [...uploadResult.failed, ...downloadResult.failed]
    }
}

// 检查本地是否有附件文件（通过 Tauri API）
export async function checkLocalAttachment(hash: string, ext: string): Promise<boolean> {
    try {
        return await window.electronAPI?.hasImage(hash, ext) ?? false
    } catch {
        return false
    }
}
