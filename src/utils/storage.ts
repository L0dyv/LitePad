import { v4 as uuidv4 } from 'uuid'
import * as db from '../db'

// 重新导出 db 模块的类型
export type { Tab, ClosedTab, ArchivedTab, SyncConfig } from '../db'

// 保持原有接口兼容
export interface AppData {
    tabs: db.Tab[]
    activeTabId: string
}

// Zen Mode 设置
export interface ZenModeSettings {
    sidebarVisible: boolean
    enabled: boolean
    hideStatsCapsule: boolean
}

// 快捷键配置
export interface ShortcutSettings {
    newTab: string
    closeTab: string
    reopenTab: string
    searchTabs: string
    archiveTab: string
}

// 状态栏显示配置
export interface StatusBarSettings {
    showShortcuts: boolean
    showLineCount: boolean
    showCharCount: boolean
}

// Storage keys (用于设置迁移兼容)
const SHORTCUTS_KEY = 'flashpad-shortcuts'
const STATUSBAR_KEY = 'flashpad-statusbar'
const FONT_KEY = 'flashpad-font'
const EDITOR_FONT_KEY = 'flashpad-editor-font'
const EDITOR_FONT_SIZE_KEY = 'flashpad-editor-font-size'
const EDITOR_TAB_INDENT_KEY = 'flashpad-editor-tab-indent'
const EDITOR_LINE_HEIGHT_KEY = 'flashpad-editor-line-height'
const EDITOR_CODE_BLOCK_HIGHLIGHT_KEY = 'flashpad-editor-code-block-highlight'
const EDITOR_QUICK_SYMBOL_INPUT_KEY = 'flashpad-editor-quick-symbol-input'
const ZEN_MODE_KEY = 'flashpad-zen-mode'

// 默认快捷键
export const DEFAULT_SHORTCUTS: ShortcutSettings = {
    newTab: 'Ctrl+T',
    closeTab: 'Ctrl+W',
    reopenTab: 'Ctrl+Shift+T',
    searchTabs: 'Ctrl+P',
    archiveTab: 'Ctrl+M'
}

// 默认状态栏设置
export const DEFAULT_STATUSBAR: StatusBarSettings = {
    showShortcuts: true,
    showLineCount: true,
    showCharCount: true
}

// 默认 Zen Mode 设置
export const DEFAULT_ZEN_MODE: ZenModeSettings = {
    sidebarVisible: true,
    enabled: true,
    hideStatsCapsule: false
}

// 默认字体
export const DEFAULT_FONT = 'SimSun'
export const DEFAULT_EDITOR_FONT = 'Consolas'
export const DEFAULT_EDITOR_FONT_SIZE = 14
export const DEFAULT_EDITOR_TAB_INDENT_TEXT = '    '
export const DEFAULT_EDITOR_LINE_HEIGHT = 1.6
export const DEFAULT_EDITOR_CODE_BLOCK_HIGHLIGHT = false
export const DEFAULT_EDITOR_QUICK_SYMBOL_INPUT = true

function normalizeOrder(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
        const n = Number(value)
        if (Number.isFinite(n)) return n
    }
    return fallback
}

export function normalizeTabs(tabs: db.Tab[]): db.Tab[] {
    const withDefaults = tabs.map((t, index) => ({
        ...t,
        pinned: !!t.pinned,
        order: normalizeOrder(t.order, index)
    }))

    const sorted = [...withDefaults].sort((a, b) => {
        const ap = a.pinned ? 1 : 0
        const bp = b.pinned ? 1 : 0
        if (ap !== bp) return bp - ap
        return a.order - b.order
    })

    return sorted.map((t, index) => ({
        ...t,
        pinned: !!t.pinned,
        order: index
    }))
}

export function reindexTabs(tabs: db.Tab[]): db.Tab[] {
    return tabs.map((t, index) => ({
        ...t,
        pinned: !!t.pinned,
        order: index
    }))
}

// ===== 同步 API（兼容层，内部使用 IndexedDB）=====

// 初始化数据库
export async function initStorage(): Promise<void> {
    await db.initDatabase()
}

// 加载数据（异步版本）
export async function loadDataAsync(): Promise<AppData> {
    const rawTabs = await db.getAllTabs()
    const appState = await db.getAppState()

    if (rawTabs.length === 0) {
        // 创建默认标签页
        const defaultTab = await db.createTab('New Page')
        await db.setAppState(defaultTab.id)
        return {
            tabs: [defaultTab],
            activeTabId: defaultTab.id
        }
    }

    const tabs = normalizeTabs(rawTabs)
    // 持久化缺失的 pinned/order 或不连续的 order
    const rawById = new Map(rawTabs.map(t => [t.id, t]))
    const needsPersist = tabs.some(t => {
        const raw = rawById.get(t.id)
        if (!raw) return true
        const rawPinnedIsValid = typeof raw.pinned === 'boolean'
        const rawOrderIsValid = typeof raw.order === 'number' && Number.isFinite(raw.order)
        if (!rawPinnedIsValid || !rawOrderIsValid) return true
        return !!raw.pinned !== t.pinned || raw.order !== t.order
    })

    if (needsPersist) {
        await db.bulkUpdateTabs(tabs)
    }

    return {
        tabs,
        activeTabId: appState?.activeTabId || tabs[0].id
    }
}

// 保存数据（异步版本）
export async function saveDataAsync(data: AppData): Promise<void> {
    // 更新所有标签页
    await db.bulkUpdateTabs(data.tabs)
    // 更新活跃标签页
    await db.setAppState(data.activeTabId)
}

// ===== 同步包装器（用于保持原有同步 API 兼容）=====

// 缓存数据，用于同步 API
let cachedData: AppData | null = null
let cacheInitialized = false

// 加载数据（同步版本 - 使用缓存）
export function loadData(): AppData {
    if (cachedData) {
        return cachedData
    }

    // 首次加载时从 localStorage 读取（迁移前的兼容）
    try {
        const stored = localStorage.getItem('flashpad-data')
        if (stored) {
            const parsed = JSON.parse(stored)
            // 为旧数据添加新字段
            const tabs = normalizeTabs((parsed.tabs || []).map((t: any, index: number) => ({
                ...t,
                localVersion: t.localVersion ?? 1,
                syncedAt: t.syncedAt ?? null,
                deleted: t.deleted ?? false,
                pinned: t.pinned ?? false,
                order: typeof t.order === 'number' ? t.order : index
            })))
            cachedData = {
                tabs,
                activeTabId: parsed.activeTabId || tabs[0]?.id || ''
            }
            return cachedData
        }
    } catch (e) {
        console.error('加载数据失败:', e)
    }

    // 默认数据
    const defaultTab = createTab()
    cachedData = {
        tabs: [defaultTab],
        activeTabId: defaultTab.id
    }
    return cachedData
}

// 保存数据（同步版本 - 更新缓存并异步写入）
export function saveData(data: AppData): void {
    cachedData = data

    // 同时写入 localStorage（兼容）和 IndexedDB
    try {
        localStorage.setItem('flashpad-data', JSON.stringify(data))
    } catch (e) {
        console.error('保存数据失败:', e)
    }

    // 异步写入 IndexedDB
    saveDataAsync(data).catch(e => console.error('IndexedDB 保存失败:', e))
}

// 刷新缓存（从 IndexedDB 加载最新数据）
export async function refreshCache(): Promise<AppData> {
    cachedData = await loadDataAsync()
    cacheInitialized = true
    return cachedData
}

// 检查缓存是否已从 IndexedDB 初始化
export function isCacheInitialized(): boolean {
    return cacheInitialized
}

// 创建新标签页
export function createTab(title?: string): db.Tab {
    return {
        id: uuidv4(),
        title: title || 'New Page',
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        localVersion: 1,
        syncedAt: null,
        deleted: false,
        pinned: false,
        order: 0
    }
}

// ===== 设置相关（保持原有 API）=====

// 加载字体设置
export function loadFont(): string {
    try {
        const stored = localStorage.getItem(FONT_KEY)
        if (stored) {
            return stored
        }
    } catch (e) {
        console.error('加载字体设置失败:', e)
    }
    return DEFAULT_FONT
}

// 保存字体设置
export function saveFont(font: string): void {
    try {
        localStorage.setItem(FONT_KEY, font)
        db.setSetting(FONT_KEY, font).catch(console.error)
    } catch (e) {
        console.error('保存字体设置失败:', e)
    }
}

// 加载编辑器字体设置
export function loadEditorFont(): string {
    try {
        const stored = localStorage.getItem(EDITOR_FONT_KEY)
        if (stored) {
            return stored
        }
    } catch (e) {
        console.error('加载编辑器字体设置失败:', e)
    }
    return DEFAULT_EDITOR_FONT
}

// 保存编辑器字体设置
export function saveEditorFont(font: string): void {
    try {
        localStorage.setItem(EDITOR_FONT_KEY, font)
        db.setSetting(EDITOR_FONT_KEY, font).catch(console.error)
    } catch (e) {
        console.error('保存编辑器字体设置失败:', e)
    }
}

// 加载编辑器字号设置
export function loadEditorFontSize(): number {
    try {
        const stored = localStorage.getItem(EDITOR_FONT_SIZE_KEY)
        if (stored) {
            const size = parseInt(stored, 10)
            if (size >= 12 && size <= 24) {
                return size
            }
        }
    } catch (e) {
        console.error('加载编辑器字号设置失败:', e)
    }
    return DEFAULT_EDITOR_FONT_SIZE
}

// 保存编辑器字号设置
export function saveEditorFontSize(size: number): void {
    try {
        localStorage.setItem(EDITOR_FONT_SIZE_KEY, size.toString())
        db.setSetting(EDITOR_FONT_SIZE_KEY, size).catch(console.error)
    } catch (e) {
        console.error('保存编辑器字号设置失败:', e)
    }
}

// 加载 Tab 缩进设置
export function loadEditorTabIndentText(): string {
    try {
        const stored = localStorage.getItem(EDITOR_TAB_INDENT_KEY)
        if (stored === '\t' || stored === '  ' || stored === '    ') {
            return stored
        }
    } catch (e) {
        console.error('加载 Tab 缩进设置失败:', e)
    }
    return DEFAULT_EDITOR_TAB_INDENT_TEXT
}

// 保存 Tab 缩进设置
export function saveEditorTabIndentText(text: string): void {
    const normalized = text === '\t' || text === '  ' ? text : '    '
    try {
        localStorage.setItem(EDITOR_TAB_INDENT_KEY, normalized)
        db.setSetting(EDITOR_TAB_INDENT_KEY, normalized).catch(console.error)
    } catch (e) {
        console.error('保存 Tab 缩进设置失败:', e)
    }
}

// 加载编辑器行间距
export function loadEditorLineHeight(): number {
    try {
        const stored = localStorage.getItem(EDITOR_LINE_HEIGHT_KEY)
        if (stored) {
            const value = Number(stored)
            if (value === 1.4 || value === 1.6 || value === 1.8) {
                return value
            }
        }
    } catch (e) {
        console.error('加载编辑器行间距设置失败:', e)
    }
    return DEFAULT_EDITOR_LINE_HEIGHT
}

// 保存编辑器行间距
export function saveEditorLineHeight(height: number): void {
    const normalized = height === 1.4 || height === 1.8 ? height : 1.6
    try {
        localStorage.setItem(EDITOR_LINE_HEIGHT_KEY, normalized.toString())
        db.setSetting(EDITOR_LINE_HEIGHT_KEY, normalized).catch(console.error)
    } catch (e) {
        console.error('保存编辑器行间距设置失败:', e)
    }
}

// 加载快捷键配置
export function loadEditorCodeBlockHighlight(): boolean {
    try {
        const stored = localStorage.getItem(EDITOR_CODE_BLOCK_HIGHLIGHT_KEY)
        if (stored === 'true') return true
        if (stored === 'false') return false
    } catch (e) {
        console.error('加载代码块语法高亮设置失败:', e)
    }
    return DEFAULT_EDITOR_CODE_BLOCK_HIGHLIGHT
}

export function saveEditorCodeBlockHighlight(enabled: boolean): void {
    const normalized = !!enabled
    try {
        localStorage.setItem(EDITOR_CODE_BLOCK_HIGHLIGHT_KEY, normalized.toString())
        db.setSetting(EDITOR_CODE_BLOCK_HIGHLIGHT_KEY, normalized).catch(console.error)
    } catch (e) {
        console.error('保存代码块语法高亮设置失败:', e)
    }
}

export function loadEditorQuickSymbolInput(): boolean {
    try {
        const stored = localStorage.getItem(EDITOR_QUICK_SYMBOL_INPUT_KEY)
        if (stored === 'true') return true
        if (stored === 'false') return false
    } catch (e) {
        console.error('加载快捷符号输入设置失败:', e)
    }
    return DEFAULT_EDITOR_QUICK_SYMBOL_INPUT
}

export function saveEditorQuickSymbolInput(enabled: boolean): void {
    const normalized = !!enabled
    try {
        localStorage.setItem(EDITOR_QUICK_SYMBOL_INPUT_KEY, normalized.toString())
        db.setSetting(EDITOR_QUICK_SYMBOL_INPUT_KEY, normalized).catch(console.error)
    } catch (e) {
        console.error('保存快捷符号输入设置失败:', e)
    }
}

export function loadShortcuts(): ShortcutSettings {
    try {
        const stored = localStorage.getItem(SHORTCUTS_KEY)
        if (stored) {
            return { ...DEFAULT_SHORTCUTS, ...JSON.parse(stored) }
        }
    } catch (e) {
        console.error('加载快捷键配置失败:', e)
    }
    return { ...DEFAULT_SHORTCUTS }
}

// 保存快捷键配置
export function saveShortcuts(shortcuts: ShortcutSettings): void {
    try {
        localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts))
        db.setSetting(SHORTCUTS_KEY, shortcuts).catch(console.error)
    } catch (e) {
        console.error('保存快捷键配置失败:', e)
    }
}

// 加载状态栏配置
export function loadStatusBar(): StatusBarSettings {
    try {
        const stored = localStorage.getItem(STATUSBAR_KEY)
        if (stored) {
            return { ...DEFAULT_STATUSBAR, ...JSON.parse(stored) }
        }
    } catch (e) {
        console.error('加载状态栏配置失败:', e)
    }
    return { ...DEFAULT_STATUSBAR }
}

// 保存状态栏配置
export function saveStatusBar(settings: StatusBarSettings): void {
    try {
        localStorage.setItem(STATUSBAR_KEY, JSON.stringify(settings))
        db.setSetting(STATUSBAR_KEY, settings).catch(console.error)
    } catch (e) {
        console.error('保存状态栏配置失败:', e)
    }
}

// 解析快捷键字符串为按键组合
export function parseShortcut(shortcut: string): { ctrl: boolean; alt: boolean; shift: boolean; key: string } {
    const parts = shortcut.toLowerCase().split('+').map(p => p.trim())
    return {
        ctrl: parts.includes('ctrl'),
        alt: parts.includes('alt'),
        shift: parts.includes('shift'),
        key: parts.filter(p => !['ctrl', 'alt', 'shift'].includes(p))[0] || ''
    }
}

// 检查键盘事件是否匹配快捷键
export function matchShortcut(e: KeyboardEvent, shortcut: string): boolean {
    const parsed = parseShortcut(shortcut)
    return (
        e.ctrlKey === parsed.ctrl &&
        e.altKey === parsed.alt &&
        e.shiftKey === parsed.shift &&
        e.key.toLowerCase() === parsed.key
    )
}

// ===== 回收站相关 =====

// 加载已关闭的标签页
export function loadClosedTabs(): db.ClosedTab[] {
    try {
        const stored = localStorage.getItem('flashpad-closed-tabs')
        if (stored) {
            return JSON.parse(stored)
        }
    } catch (e) {
        console.error('加载回收站数据失败:', e)
    }
    return []
}

// 保存关闭的标签页到回收站
export function saveClosedTab(tab: db.Tab, index: number): void {
    try {
        const closedTabs = loadClosedTabs()
        const closedTab: db.ClosedTab = {
            ...tab,
            closedAt: Date.now(),
            index
        }
        closedTabs.unshift(closedTab)
        if (closedTabs.length > 20) {
            closedTabs.pop()
        }
        localStorage.setItem('flashpad-closed-tabs', JSON.stringify(closedTabs))
        db.addToClosedTabs(tab, index).catch(console.error)
    } catch (e) {
        console.error('保存到回收站失败:', e)
    }
}

// 弹出最近关闭的标签页
export function popClosedTab(): db.ClosedTab | null {
    try {
        const closedTabs = loadClosedTabs()
        if (closedTabs.length === 0) {
            return null
        }
        const [restoredTab, ...remaining] = closedTabs
        localStorage.setItem('flashpad-closed-tabs', JSON.stringify(remaining))
        db.popClosedTab().catch(console.error)
        return restoredTab
    } catch (e) {
        console.error('从回收站恢复失败:', e)
        return null
    }
}

// 从回收站移除指定标签页（永久删除/恢复前移除记录）
export function removeClosedTab(tab: db.ClosedTab): db.ClosedTab[] {
    try {
        const closedTabs = loadClosedTabs()
        const remaining = closedTabs.filter(t => !(t.id === tab.id && t.closedAt === tab.closedAt))
        localStorage.setItem('flashpad-closed-tabs', JSON.stringify(remaining))
        db.removeFromClosedTabs(tab.id, tab.closedAt).catch(console.error)
        return remaining
    } catch (e) {
        console.error('从回收站移除失败:', e)
        return loadClosedTabs()
    }
}

// 清空回收站
export function clearClosedTabs(): void {
    try {
        localStorage.setItem('flashpad-closed-tabs', JSON.stringify([]))
        db.clearClosedTabs().catch(console.error)
    } catch (e) {
        console.error('清空回收站失败:', e)
    }
}

// ===== 归档相关 =====

// 加载已归档的标签页
export function loadArchivedTabs(): db.ArchivedTab[] {
    try {
        const stored = localStorage.getItem('flashpad-archived-tabs')
        if (stored) {
            const parsed = JSON.parse(stored) as db.ArchivedTab[]
            const seen = new Set<string>()
            const deduped: db.ArchivedTab[] = []
            for (const tab of parsed) {
                if (!seen.has(tab.id)) {
                    seen.add(tab.id)
                    deduped.push(tab)
                }
            }
            return deduped
        }
    } catch (e) {
        console.error('加载归档数据失败:', e)
    }
    return []
}

// 保存标签页到归档
export function saveArchivedTab(tab: db.Tab): void {
    try {
        let archivedTabs = loadArchivedTabs()
        archivedTabs = archivedTabs.filter(t => t.id !== tab.id)
        const archivedTab: db.ArchivedTab = {
            ...tab,
            archivedAt: Date.now()
        }
        archivedTabs.unshift(archivedTab)
        localStorage.setItem('flashpad-archived-tabs', JSON.stringify(archivedTabs))
        db.addToArchivedTabs(tab).catch(console.error)
    } catch (e) {
        console.error('保存到归档失败:', e)
    }
}

// 从归档中移除指定标签页
export function removeArchivedTab(tab: db.ArchivedTab): db.ArchivedTab[] {
    try {
        const archivedTabs = loadArchivedTabs()
        const remaining = archivedTabs.filter(t => !(t.id === tab.id && t.archivedAt === tab.archivedAt))
        localStorage.setItem('flashpad-archived-tabs', JSON.stringify(remaining))
        db.removeFromArchivedTabs(tab.id).catch(console.error)
        return remaining
    } catch (e) {
        console.error('从归档移除失败:', e)
        return loadArchivedTabs()
    }
}

// 清空所有归档
export function clearArchivedTabs(): void {
    try {
        localStorage.setItem('flashpad-archived-tabs', JSON.stringify([]))
        db.clearArchivedTabs().catch(console.error)
    } catch (e) {
        console.error('清空归档失败:', e)
    }
}

// ===== Zen Mode =====

// 加载 Zen Mode 设置
export function loadZenMode(): ZenModeSettings {
    try {
        const migrationKey = 'flashpad-zen-mode-v2'
        if (!localStorage.getItem(migrationKey)) {
            localStorage.removeItem(ZEN_MODE_KEY)
            localStorage.setItem(migrationKey, 'true')
        }

        const stored = localStorage.getItem(ZEN_MODE_KEY)
        if (stored) {
            return { ...DEFAULT_ZEN_MODE, ...JSON.parse(stored) }
        }
    } catch (e) {
        console.error('加载 Zen Mode 设置失败:', e)
    }
    return { ...DEFAULT_ZEN_MODE }
}

// 保存 Zen Mode 设置
export function saveZenMode(settings: ZenModeSettings): void {
    try {
        localStorage.setItem(ZEN_MODE_KEY, JSON.stringify(settings))
        db.setSetting(ZEN_MODE_KEY, settings).catch(console.error)
    } catch (e) {
        console.error('保存 Zen Mode 设置失败:', e)
    }
}
