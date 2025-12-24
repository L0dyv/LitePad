# 阶段 03：核心功能开发

> **状态**: ⚪ 待开始  
> **前置**: 阶段 02 完成

## 目标

实现编辑器、多标签页、数据持久化、计算功能等核心特性。

## 任务清单

### 3.1 编辑器集成

- [ ] 集成 CodeMirror 6
- [ ] 配置基础编辑功能
  - 语法高亮（可选）
  - 行号显示（可选）
- [ ] 确保编辑行为正常
  - Ctrl+Backspace 删除前一个单词
  - Ctrl+Z/Y 撤销/重做
  - 常规选择、复制、粘贴

### 3.2 多标签页管理

- [ ] 标签栏组件
- [ ] 新建/关闭/切换标签页
- [ ] 标签页重命名
- [ ] 标签页拖拽排序（可选）

### 3.3 数据持久化

- [ ] 确定存储方案（SQLite / JSON）
- [ ] 实现自动保存（debounce 300ms）
- [ ] 应用启动时恢复数据
- [ ] 另存为功能

### 3.4 计算功能

- [ ] 集成 math.js
- [ ] 检测 `表达式=` 模式
- [ ] Ctrl+Enter 触发计算
- [ ] 在 `=` 后插入结果

## 数据结构设计

```typescript
interface Tab {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface AppState {
  tabs: Tab[];
  activeTabId: string;
  settings: Settings;
}
```

## 验收标准

1. ✅ 可创建/切换/关闭多个标签页
2. ✅ 内容修改自动保存
3. ✅ 关闭应用后重新打开，数据恢复
4. ✅ 输入 `2+3*4=` 后 Ctrl+Enter，显示 `2+3*4=14`

## 备注

*开发过程中的笔记和发现记录在这里*
