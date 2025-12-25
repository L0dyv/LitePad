import { v4 as uuidv4 } from 'uuid'

export interface Tab {
    id: string
    title: string
    content: string
    createdAt: number
    updatedAt: number
}

export interface AppData {
    tabs: Tab[]
    activeTabId: string
}

// 快捷键配置
export interface ShortcutSettings {
    newTab: string      // 新建标签页
    closeTab: string    // 关闭标签页
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

// 默认快捷键
export const DEFAULT_SHORTCUTS: ShortcutSettings = {
    newTab: 'Ctrl+T',
    closeTab: 'Ctrl+W'
}

// 默认状态栏设置
export const DEFAULT_STATUSBAR: StatusBarSettings = {
    showShortcuts: true,
    showLineCount: true,
    showCharCount: true
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
