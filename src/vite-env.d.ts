/// <reference types="vite/client" />

interface AppSettings {
    autoLaunch: boolean
    alwaysOnTop: boolean
}

interface SaveImageResult {
    hash: string
    url: string
    size: number
    ext: string
}

interface MigrateImageResult {
    hash: string
    ext: string
    size: number
    newUrl: string
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
        // Image APIs (hash-based)
        saveImage: (buffer: ArrayBuffer, ext: string) => Promise<SaveImageResult>
        getImagePath: (hash: string, ext: string) => Promise<string>
        hasImage: (hash: string, ext: string) => Promise<boolean>
        saveDownloadedImage: (hash: string, ext: string, buffer: ArrayBuffer) => Promise<string>
        readImage: (hash: string, ext: string) => Promise<Uint8Array>
        // Migration APIs
        migrateOldImage: (oldPath: string) => Promise<MigrateImageResult>
        checkOldImagesExist: (paths: string[]) => Promise<boolean[]>
    }
    // Tauri internals (set by Tauri runtime)
    __TAURI_INTERNALS__?: unknown
}
