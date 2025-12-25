import { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
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
    // 创建一个简单的图标（16x16 蓝色方块）
    const iconSize = 16
    const icon = nativeImage.createFromBuffer(
        createSimpleIcon(iconSize),
        { width: iconSize, height: iconSize }
    )

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

// 创建一个简单的纯色图标
function createSimpleIcon(size: number): Buffer {
    // 创建 RGBA 数据
    const data = Buffer.alloc(size * size * 4)

    // 填充蓝紫色 (#e94560 转换为 RGB)
    for (let i = 0; i < size * size; i++) {
        data[i * 4] = 233     // R
        data[i * 4 + 1] = 69  // G
        data[i * 4 + 2] = 96  // B
        data[i * 4 + 3] = 255 // A
    }

    return data
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
