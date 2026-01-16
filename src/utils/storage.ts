import { v4 as uuidv4 } from 'uuid'

export interface Tab {
    id: string
    title: string
    content: string
    createdAt: number
    updatedAt: number
}

// 已关闭的标签页（用于回收站）
export interface ClosedTab extends Tab {
    closedAt: number
    index: number  // 原始位置索引
}

// 已归档的标签页
export interface ArchivedTab extends Tab {
    archivedAt: number
}

export interface AppData {
    tabs: Tab[]
    activeTabId: string
}

// 快捷键配置
export interface ShortcutSettings {
    newTab: string      // 新建标签页
    closeTab: string    // 关闭标签页
    reopenTab: string   // 恢复关闭的标签页
}

// 状态栏显示配置
export interface StatusBarSettings {
    showShortcuts: boolean  // 显示快捷键提示
    showLineCount: boolean  // 显示行数
    showCharCount: boolean  // 显示字符数
}

const STORAGE_KEY = 'flashpad-data'
const SHORTCUTS_KEY = 'flashpad-shortcuts'
const STATUSBAR_KEY = 'flashpad-statusbar'
const FONT_KEY = 'flashpad-font'
const EDITOR_FONT_KEY = 'flashpad-editor-font'
const CLOSED_TABS_KEY = 'flashpad-closed-tabs'
const ARCHIVED_TABS_KEY = 'flashpad-archived-tabs'
const MAX_CLOSED_TABS = 20  // 最多保留 20 个关闭的标签页

// 默认快捷键
export const DEFAULT_SHORTCUTS: ShortcutSettings = {
    newTab: 'Ctrl+T',
    closeTab: 'Ctrl+W',
    reopenTab: 'Ctrl+Shift+T'
}

// 默认状态栏设置
export const DEFAULT_STATUSBAR: StatusBarSettings = {
    showShortcuts: true,
    showLineCount: true,
    showCharCount: true
}

// 默认字体
export const DEFAULT_FONT = 'SimSun'

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
    } catch (e) {
        console.error('保存字体设置失败:', e)
    }
}

// 默认编辑器字体
export const DEFAULT_EDITOR_FONT = 'Consolas'

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
    } catch (e) {
        console.error('保存编辑器字体设置失败:', e)
    }
}

// 加载快捷键配置
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

// 从本地存储加载数据
export function loadData(): AppData {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
            return JSON.parse(stored)
        }
    } catch (e) {
        console.error('加载数据失败:', e)
    }

    // 默认数据：一个空白标签页
    // 注意：这里使用固定值，实际显示由 i18n 控制
    const defaultTab = createTab()
    return {
        tabs: [defaultTab],
        activeTabId: defaultTab.id
    }
}

// 保存数据到本地存储
export function saveData(data: AppData): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
        console.error('保存数据失败:', e)
    }
}

// 创建新标签页
// 注意：title 参数可由调用方传入翻译后的文本
export function createTab(title?: string): Tab {
    return {
        id: uuidv4(),
        title: title || 'New Page',
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
    }
}

// 加载已关闭的标签页（回收站）
export function loadClosedTabs(): ClosedTab[] {
    try {
        const stored = localStorage.getItem(CLOSED_TABS_KEY)
        if (stored) {
            return JSON.parse(stored)
        }
    } catch (e) {
        console.error('加载回收站数据失败:', e)
    }
    return []
}

// 保存关闭的标签页到回收站
export function saveClosedTab(tab: Tab, index: number): void {
    try {
        const closedTabs = loadClosedTabs()
        const closedTab: ClosedTab = {
            ...tab,
            closedAt: Date.now(),
            index
        }
        // 添加到队列头部（最近关闭的在前）
        closedTabs.unshift(closedTab)
        // 限制最大数量
        if (closedTabs.length > MAX_CLOSED_TABS) {
            closedTabs.pop()
        }
        localStorage.setItem(CLOSED_TABS_KEY, JSON.stringify(closedTabs))
    } catch (e) {
        console.error('保存到回收站失败:', e)
    }
}

// 弹出最近关闭的标签页（恢复时使用）
export function popClosedTab(): ClosedTab | null {
    try {
        const closedTabs = loadClosedTabs()
        if (closedTabs.length === 0) {
            return null
        }
        const [restoredTab, ...remaining] = closedTabs
        localStorage.setItem(CLOSED_TABS_KEY, JSON.stringify(remaining))
        return restoredTab
    } catch (e) {
        console.error('从回收站恢复失败:', e)
        return null
    }
}

// 加载已归档的标签页
export function loadArchivedTabs(): ArchivedTab[] {
    try {
        const stored = localStorage.getItem(ARCHIVED_TABS_KEY)
        if (stored) {
            return JSON.parse(stored)
        }
    } catch (e) {
        console.error('加载归档数据失败:', e)
    }
    return []
}

// 保存标签页到归档
export function saveArchivedTab(tab: Tab): void {
    try {
        const archivedTabs = loadArchivedTabs()
        const archivedTab: ArchivedTab = {
            ...tab,
            archivedAt: Date.now()
        }
        // 添加到队列头部（最近归档的在前）
        archivedTabs.unshift(archivedTab)
        localStorage.setItem(ARCHIVED_TABS_KEY, JSON.stringify(archivedTabs))
    } catch (e) {
        console.error('保存到归档失败:', e)
    }
}

// 从归档中移除指定标签页
export function removeArchivedTab(tab: ArchivedTab): ArchivedTab[] {
    try {
        const archivedTabs = loadArchivedTabs()
        const remaining = archivedTabs.filter(t => !(t.id === tab.id && t.archivedAt === tab.archivedAt))
        localStorage.setItem(ARCHIVED_TABS_KEY, JSON.stringify(remaining))
        return remaining
    } catch (e) {
        console.error('从归档移除失败:', e)
        return loadArchivedTabs()
    }
}

// 清空所有归档
export function clearArchivedTabs(): void {
    try {
        localStorage.setItem(ARCHIVED_TABS_KEY, JSON.stringify([]))
    } catch (e) {
        console.error('清空归档失败:', e)
    }
}
