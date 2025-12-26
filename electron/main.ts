import { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { exec } from 'child_process'
import Store from 'electron-store'

// Portable 模式：设置用户数据目录到程序目录的 data 文件夹
const exePath = app.getPath('exe')
const portableDataPath = join(dirname(exePath), 'data')

// 确保 data 目录存在
if (!existsSync(portableDataPath)) {
    mkdirSync(portableDataPath, { recursive: true })
}

// 设置 Electron 用户数据目录（影响 localStorage 等）
app.setPath('userData', portableDataPath)

// 配置存储
interface StoreSchema {
    windowBounds: {
        x?: number
        y?: number
        width: number
        height: number
    }
    settings: {
        autoLaunch: boolean
        alwaysOnTop: boolean
    }
}

const store = new Store<StoreSchema>({
    cwd: portableDataPath, // Portable 模式：配置文件存储在程序目录
    defaults: {
        windowBounds: {
            width: 800,
            height: 600
        },
        settings: {
            autoLaunch: false,
            alwaysOnTop: false
        }
    }
})

// 保持对窗口和托盘的引用，防止被垃圾回收
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

// 单实例锁定：防止多开
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    // 如果无法获取锁，说明已有实例在运行，直接退出
    app.quit()
} else {
    // 当第二个实例尝试启动时，激活已有窗口
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            if (!mainWindow.isVisible()) mainWindow.show()
            mainWindow.focus()
        }
    })
}

function createWindow() {
    const bounds = store.get('windowBounds')

    mainWindow = new BrowserWindow({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        show: false,
        frame: false,
        backgroundColor: '#1e1e1e',
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    })

    // 开发模式加载 Vite 开发服务器
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
        mainWindow.loadFile(join(__dirname, '../dist/index.html'))
    }

    // 窗口准备好后显示
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show()
        mainWindow?.focus()
    })

    // 保存窗口位置和大小（移动或调整大小时）
    mainWindow.on('resized', saveWindowBounds)
    mainWindow.on('moved', saveWindowBounds)

    // 阻止窗口关闭，改为隐藏（托盘常驻）
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault()
            mainWindow?.hide()
        }
    })
}

function saveWindowBounds() {
    if (mainWindow) {
        store.set('windowBounds', mainWindow.getBounds())
    }
}

function createTray() {
    // 使用真实图标
    let iconPath = join(__dirname, '../dist/tray.png')

    // 开发环境下路径处理
    if (process.env.VITE_DEV_SERVER_URL) {
        iconPath = join(process.cwd(), 'public/tray.png')
    }

    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })

    tray = new Tray(icon)

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '显示/隐藏 (Alt+X)',
            click: () => toggleWindow()
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => {
                isQuitting = true
                app.quit()
            }
        }
    ])

    tray.setToolTip('LitePad速记本 - Alt+X 快速切换')
    tray.setContextMenu(contextMenu)

    // 点击托盘图标切换窗口
    tray.on('click', () => toggleWindow())
}

function toggleWindow() {
    if (!mainWindow) return

    if (mainWindow.isVisible()) {
        mainWindow.hide()
    } else {
        mainWindow.show()
        mainWindow.focus()
    }
}

function registerShortcuts() {
    // 注册全局快捷键 Alt+X
    const registered = globalShortcut.register('Alt+X', () => {
        toggleWindow()
    })

    if (!registered) {
        console.error('全局快捷键 Alt+X 注册失败')
    } else {
        console.log('全局快捷键 Alt+X 注册成功')
    }
}



app.whenReady().then(() => {
    createWindow()
    createTray()
    registerShortcuts()

    // 应用保存的设置
    const settings = store.get('settings')
    if (settings.alwaysOnTop && mainWindow) {
        mainWindow.setAlwaysOnTop(true)
    }

    // IPC 窗口控制
    ipcMain.on('window-minimize', () => mainWindow?.minimize())
    ipcMain.on('window-maximize', () => {
        if (mainWindow?.isMaximized()) {
            mainWindow.unmaximize()
        } else {
            mainWindow?.maximize()
        }
    })
    ipcMain.on('window-close', () => mainWindow?.hide())

    // IPC 设置相关
    ipcMain.handle('get-settings', () => {
        return store.get('settings')
    })

    ipcMain.on('set-auto-launch', (_event, enabled: boolean) => {
        app.setLoginItemSettings({
            openAtLogin: enabled,
            path: app.getPath('exe')
        })
        store.set('settings.autoLaunch', enabled)
    })

    ipcMain.on('set-always-on-top', (_event, enabled: boolean) => {
        mainWindow?.setAlwaysOnTop(enabled)
        store.set('settings.alwaysOnTop', enabled)
    })

    // 获取系统字体列表
    ipcMain.handle('get-system-fonts', () => {
        return new Promise<string[]>((resolve) => {
            // 使用 PowerShell 获取系统字体，chcp 65001 强制 UTF-8 输出避免中文乱码
            const cmd = `chcp 65001 >nul && powershell -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }"`
            exec(cmd, { encoding: 'utf8', maxBuffer: 1024 * 1024 }, (error, stdout) => {
                if (error) {
                    console.error('获取系统字体失败:', error)
                    // 返回默认字体列表
                    resolve(['SimSun', 'Microsoft YaHei', 'SimHei', 'KaiTi', 'FangSong', 'Consolas', 'Segoe UI'])
                    return
                }
                const fonts = stdout.trim().split('\n').map(f => f.trim()).filter(f => f.length > 0)
                resolve(fonts)
            })
        })
    })

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('will-quit', () => {
    // 注销所有快捷键
    globalShortcut.unregisterAll()
})
