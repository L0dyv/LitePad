# 阶段 02：基础框架搭建

> **状态**: 🟡 进行中  
> **前置**: 阶段 01 完成

## 目标

搭建 Electron + React + Vite 项目基础框架，实现窗口、托盘、全局快捷键。

## 任务清单

### 2.1 项目初始化

- [ ] 使用 Vite + Electron 模板创建项目
- [ ] 配置 TypeScript
- [ ] 安装核心依赖

### 2.2 主进程开发

- [ ] 创建主窗口（BrowserWindow）
- [ ] 实现系统托盘（Tray）
  - 托盘图标
  - 右键菜单：显示/隐藏、退出
- [ ] 注册全局快捷键（Alt+X）
- [ ] 实现窗口 show/hide toggle
  - 验证响应速度 < 100ms

### 2.3 渲染进程基础

- [ ] React 基础框架
- [ ] 基础样式配置
- [ ] IPC 通信测试

## 技术方案

### 项目结构

```
src/
├── main/           # Electron 主进程
│   ├── index.ts    # 入口
│   ├── window.ts   # 窗口管理
│   ├── tray.ts     # 托盘
│   └── shortcuts.ts # 快捷键
├── renderer/       # React 渲染进程
│   ├── App.tsx
│   └── main.tsx
└── shared/         # 共享类型
    └── types.ts
```

### 关键代码示例

```typescript
// 快捷键 toggle 窗口
globalShortcut.register('Alt+X', () => {
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});
```

## 验收标准

1. ✅ 应用可正常启动
2. ✅ 托盘图标显示正常
3. ✅ Alt+X 可快速 toggle 窗口
4. ✅ 响应时间 < 100ms

## 依赖列表

```json
{
  "electron": "^28.0.0",
  "vite": "^5.0.0",
  "react": "^18.0.0",
  "react-dom": "^18.0.0",
  "typescript": "^5.0.0"
}
```

## 备注

*开发过程中的笔记和发现记录在这里*
