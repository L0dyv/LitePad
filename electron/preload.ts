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
    setAlwaysOnTop: (enabled: boolean) => ipcRenderer.send('set-always-on-top', enabled)
})
