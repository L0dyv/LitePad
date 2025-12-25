# 变更记录

本文档记录项目的重要变更和里程碑。

---

## [未发布]

### 2024-12-25

#### 🔄 项目更名

- **FlashPad Self → LitePad速记本**
  - 更新标题栏默认标题 (`TitleBar.tsx`)
  - 更新设置页面关于信息 (`Settings.tsx`)
  - 更新网页标题 (`index.html`)
  - 更新托盘图标提示 (`main.ts`)
  - 更新构建配置 (`electron-builder.json`)
    - `appId`: `com.flashpad.self` → `com.litepad.notebook`
    - `productName`: `FlashPad Self` → `LitePad速记本`
    - `shortcutName`: `FlashPad Self` → `LitePad速记本`

---

### 2024-12-24

#### 📝 规划阶段启动

- 创建项目文档结构
  - `docs/README.md` - 文档索引
  - `docs/overview.md` - 项目总览
  - `docs/features.md` - 功能需求
  - `docs/architecture.md` - 技术架构
  - `docs/current-phase.md` - 当前阶段进度
  - `docs/changelog.md` - 变更记录

- 确定技术栈
  - 框架：Electron
  - 前端：React
  - 编辑器：CodeMirror 6
  - 存储：SQLite / JSON（待定）

- 明确核心需求
  - 全局快捷键 toggle（Alt+X）
  - 多标签页管理
  - 自动保存
  - 计算功能

---

## 版本格式说明

遵循 [语义化版本](https://semver.org/lang/zh-CN/)：

- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能新增
- **修订号**：向下兼容的问题修正
