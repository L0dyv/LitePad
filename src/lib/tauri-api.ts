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
    }
} : undefined

// For backwards compatibility, also set on window object
if (isTauri && tauriAPI) {
    (window as any).electronAPI = tauriAPI
}

export default tauriAPI
