import { contextBridge, ipcRenderer } from 'electron'

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('electronAPI', {
    getVersion: () => process.versions.electron,
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),

    // 设置相关
    getSettings: () => ipcRenderer.invoke('get-settings'),
    setAutoLaunch: (enabled: boolean) => ipcRenderer.send('set-auto-launch', enabled),
    setAlwaysOnTop: (enabled: boolean) => ipcRenderer.send('set-always-on-top', enabled),

    // 字体相关
    getSystemFonts: () => ipcRenderer.invoke('get-system-fonts'),

    // 外部链接
    openExternalUrl: (url: string) => ipcRenderer.send('open-external-url', url),

    // 图片保存
    saveImage: (buffer: ArrayBuffer, ext: string): Promise<string> =>
        ipcRenderer.invoke('save-image', buffer, ext)
})
