import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from './locales/zh.json'
import en from './locales/en.json'

// 语言存储键
const LANGUAGE_KEY = 'flashpad-language'

// 获取保存的语言设置
function getSavedLanguage(): string {
    try {
        const saved = localStorage.getItem(LANGUAGE_KEY)
        if (saved && ['zh', 'en'].includes(saved)) {
            return saved
        }
    } catch (e) {
        console.error('Failed to load language setting:', e)
    }
    return 'zh' // 默认中文
}

// 保存语言设置
export function saveLanguage(lang: string): void {
    try {
        localStorage.setItem(LANGUAGE_KEY, lang)
    } catch (e) {
        console.error('Failed to save language setting:', e)
    }
}

// 切换语言
export function changeLanguage(lang: string): void {
    i18n.changeLanguage(lang)
    saveLanguage(lang)
}

// 获取当前语言
export function getCurrentLanguage(): string {
    return i18n.language || 'zh'
}

i18n
    .use(initReactI18next)
    .init({
        resources: {
            zh: { translation: zh },
            en: { translation: en }
        },
        lng: getSavedLanguage(),
        fallbackLng: 'zh',
        interpolation: {
            escapeValue: false
        }
    })

export default i18n
