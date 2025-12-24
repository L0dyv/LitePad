import { contextBridge, ipcRenderer } from 'electron'

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('electronAPI', {
    // 后续添加 IPC 通信方法
    getVersion: () => process.versions.electron
})
