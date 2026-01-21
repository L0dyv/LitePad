/**
 * Tauri API bridge - replaces window.electronAPI
 * This module provides the same interface as the Electron preload script
 * but uses Tauri's invoke system
 */

import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-shell'

interface AppSettings {
    autoLaunch: boolean
    alwaysOnTop: boolean
}

// Backup settings interface
export interface BackupSettings {
    backupDirectory: string | null
    maxBackups: number
    autoBackupEnabled: boolean
    autoBackupInterval: number
}

// Backup info interface
export interface BackupInfo {
    filename: string
    createdAt: number
    size: number
}

// Type declaration for the API
export interface TauriAPI {
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
    // Backup APIs
    selectBackupDirectory: () => Promise<string | null>
    getBackupSettings: () => Promise<BackupSettings>
    setBackupSettings: (settings: BackupSettings) => Promise<void>
    performBackup: (data: string) => Promise<string>
    getBackupList: () => Promise<BackupInfo[]>
    restoreBackup: (filename: string) => Promise<string>
    deleteBackup: (filename: string) => Promise<void>
}

// Check if running in Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// Tauri API implementation
export const tauriAPI: TauriAPI | undefined = isTauri ? {
    getVersion: () => invoke<string>('get_version'),

    minimize: () => {
        invoke('minimize_window')
    },

    maximize: () => {
        invoke('maximize_window')
    },

    close: () => {
        invoke('close_window')
    },

    getSettings: () => invoke<AppSettings>('get_settings'),

    setAutoLaunch: (enabled: boolean) => invoke('set_auto_launch', { enabled }),

    setAlwaysOnTop: (enabled: boolean) => invoke('set_always_on_top', { enabled }),

    getSystemFonts: () => invoke<string[]>('get_system_fonts'),

    openExternalUrl: (url: string) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            open(url)
        }
    },

    saveImage: async (buffer: ArrayBuffer, ext: string) => {
        const uint8Array = new Uint8Array(buffer)
        return invoke<string>('save_image', {
            buffer: Array.from(uint8Array),
            ext
        })
    },

    // Backup APIs
    selectBackupDirectory: () => invoke<string | null>('select_backup_directory'),

    getBackupSettings: () => invoke<BackupSettings>('get_backup_settings'),

    setBackupSettings: (settings: BackupSettings) => invoke('set_backup_settings', { settings }),

    performBackup: (data: string) => invoke<string>('perform_backup', { data }),

    getBackupList: () => invoke<BackupInfo[]>('get_backup_list'),

    restoreBackup: (filename: string) => invoke<string>('restore_backup', { filename }),

    deleteBackup: (filename: string) => invoke('delete_backup', { filename })
} : undefined

// For backwards compatibility, also set on window object
if (isTauri && tauriAPI) {
    (window as any).electronAPI = tauriAPI
}

export default tauriAPI

