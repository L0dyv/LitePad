/// <reference types="vite/client" />

interface AppSettings {
    autoLaunch: boolean
    alwaysOnTop: boolean
}

interface Window {
    electronAPI?: {
        getVersion: () => string
        minimize: () => void
        maximize: () => void
        close: () => void
        getSettings: () => Promise<AppSettings>
        setAutoLaunch: (enabled: boolean) => void
        setAlwaysOnTop: (enabled: boolean) => void
        getSystemFonts: () => Promise<string[]>
        openExternalUrl: (url: string) => void
        saveImage: (buffer: ArrayBuffer, ext: string) => Promise<string>
    }
}
