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
    }
}
