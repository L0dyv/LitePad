# 技术架构

## 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    Electron                          │
├─────────────────────────────────────────────────────┤
│  Main Process                                        │
│  ├── 全局快捷键注册 (globalShortcut)                 │
│  ├── 系统托盘 (Tray)                                 │
│  ├── 窗口管理 (BrowserWindow show/hide)             │
│  └── IPC 通信                                        │
├─────────────────────────────────────────────────────┤
│  Renderer Process (React)                            │
│  ├── 标签页管理组件                                  │
│  ├── CodeMirror 6 编辑器                             │
│  ├── 设置面板                                        │
│  └── 状态管理                                        │
├─────────────────────────────────────────────────────┤
│  Data Layer                                          │
│  ├── SQLite (better-sqlite3) 或 JSON 文件           │
│  └── 用户配置 (electron-store)                       │
└─────────────────────────────────────────────────────┘
```

## 性能优化策略

### 1. 窗口常驻

```javascript
// ❌ 慢：每次创建窗口
globalShortcut.register('Alt+X', () => {
  new BrowserWindow({...}); // 冷启动 ~500ms
});

// ✅ 快：hide/show 切换
globalShortcut.register('Alt+X', () => {
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});
```

### 2. 编辑器懒加载

- 非当前激活的标签页延迟渲染
- 大文本分片加载

### 3. 数据持久化

- 使用 debounce 防抖保存（300ms）
- 不阻塞 UI 线程

## 目录结构（规划）

```
FlashPadSelf/
├── docs/                    # 项目文档
├── src/
│   ├── main/               # Electron 主进程
│   │   ├── index.ts
│   │   ├── tray.ts
│   │   ├── shortcuts.ts
│   │   └── ipc.ts
│   ├── renderer/           # React 渲染进程
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── TabBar/
│   │   │   ├── Editor/
│   │   │   └── Settings/
│   │   ├── hooks/
│   │   ├── stores/
│   │   └── styles/
│   └── shared/             # 共享类型定义
│       └── types.ts
├── assets/                  # 图标等静态资源
├── package.json
├── electron-builder.json
└── vite.config.ts
```

## 关键依赖

| 包名 | 用途 |
|------|------|
| electron | 桌面应用框架 |
| @codemirror/view | 编辑器核心 |
| @codemirror/state | 编辑器状态管理 |
| better-sqlite3 | SQLite 数据库 |
| electron-store | 用户配置存储 |
| mathjs | 数学表达式计算 |
| vite | 构建工具 |
| electron-builder | 打包分发 |
