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

const STORAGE_KEY = 'flashpad-data'

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
    const defaultTab = createTab('默认页')
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
export function createTab(title: string = '新建页'): Tab {
    return {
        id: uuidv4(),
        title,
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
    }
}
