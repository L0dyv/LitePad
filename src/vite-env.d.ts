/// <reference types="vite/client" />

interface Window {
    electronAPI?: {
        getVersion: () => string
        minimize: () => void
        maximize: () => void
        close: () => void
    }
}
