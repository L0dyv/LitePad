/// <reference types="vite/client" />

interface AppSettings {
    autoLaunch: boolean
    alwaysOnTop: boolean
}

// Tauri API bridge (compatible with original electronAPI interface)
interface Window {
    electronAPI?: {
        getVersion: () => Promise<string>
        minimize: () => void
        maximize: () => void
        close: () => void
        getSettings: () => Promise<AppSettings>
        setAutoLaunch: (enabled: boolean) => Promise<void>
        setAlwaysOnTop: (enabled: boolean) => Promise<void>
        getSystemFonts: () => Promise<string[]>
        openExternalUrl: (url: string) => void
        saveImage: (buffer: ArrayBuffer, ext: string) => Promise<string>
    }
    // Tauri internals (set by Tauri runtime)
    __TAURI_INTERNALS__?: unknown
}
