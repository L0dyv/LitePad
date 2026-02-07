import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Editor } from "./components/Editor";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { Settings } from "./components/Settings";
import { StatsOverlay } from "./components/StatsOverlay";
import { HelpPanel } from "./components/HelpPanel";
import { TabSearchModal, ModalTab } from "./components/TabSearchModal";
import {
  loadData,
  saveData,
  createTab,
  AppData,
  loadShortcuts,
  ShortcutSettings,
  matchShortcut,
  loadFont,
  loadEditorFont,
  loadEditorFontSize,
  loadEditorTabIndentText,
  loadEditorLineHeight,
  loadEditorCodeBlockHighlight,
  loadEditorQuickSymbolInput,
  saveClosedTab,
  popClosedTab,
  loadClosedTabs,
  removeClosedTab,
  clearClosedTabs,
  ClosedTab,
  ArchivedTab,
  loadArchivedTabs,
  saveArchivedTab,
  removeArchivedTab,
  clearArchivedTabs,
  ZenModeSettings,
  loadZenMode,
  saveZenMode,
  initStorage,
  refreshCache,
  reindexTabs,
} from "./utils/storage";
import { initSync, addSyncListener } from "./sync";
import { migrateOldImageUrls, updateVersionRecord } from "./utils/migration";
import { tauriAPI, BackupSettings } from "./lib/tauri-api";
import { collectBackupDataFromLocalStorage } from "./utils/backup";
import { ConflictResolver, Conflict } from "./components/ConflictResolver";
import "./styles/App.css";

function App() {
  const { t } = useTranslation();
  const [data, setData] = useState<AppData>(() => loadData());
  const [shortcuts, setShortcuts] = useState<ShortcutSettings>(() =>
    loadShortcuts(),
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [editorJump, setEditorJump] = useState<{
    tabId: string;
    from: number;
    to: number;
    token: number;
  } | null>(null);
  const [searchModalTab, setSearchModalTab] = useState<ModalTab>("active");
  const [currentFont, setCurrentFont] = useState(() => loadFont());
  const [editorFont, setEditorFont] = useState(() => loadEditorFont());
  const [editorFontSize, setEditorFontSize] = useState(() =>
    loadEditorFontSize(),
  );
  const [editorTabIndentText, setEditorTabIndentText] = useState(() =>
    loadEditorTabIndentText(),
  );
  const [editorLineHeight, setEditorLineHeight] = useState(() =>
    loadEditorLineHeight(),
  );
  const [editorCodeBlockHighlight, setEditorCodeBlockHighlight] = useState(() =>
    loadEditorCodeBlockHighlight(),
  );
  const [editorQuickSymbolInput, setEditorQuickSymbolInput] = useState(() =>
    loadEditorQuickSymbolInput(),
  );
  const [closedTabs, setClosedTabs] = useState<ClosedTab[]>(() =>
    loadClosedTabs(),
  );
  const [archivedTabs, setArchivedTabs] = useState<ArchivedTab[]>(() =>
    loadArchivedTabs(),
  );
  const [zenModeSettings, setZenModeSettings] = useState<ZenModeSettings>(() =>
    loadZenMode(),
  );
  const [renameRequestToken, setRenameRequestToken] = useState(0);
  const sidebarWasHiddenRef = useRef(false);
  const [isImmersive, setIsImmersive] = useState(false);
  const [_dbInitialized, setDbInitialized] = useState(false);
  const [syncConflicts, setSyncConflicts] = useState<Conflict[]>([]);
  const [syncConflictsServerTime, setSyncConflictsServerTime] = useState<
    number | null
  >(null);
  const [backupSettings, setBackupSettings] = useState<BackupSettings | null>(
    null,
  );
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveImmediatelyRef = useRef(false);
  const autoBackupTimerRef = useRef<number | null>(null);
  const autoBackupRunningRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number; t: number } | null>(
    null,
  );
  const pointerAccumRef = useRef(0);
  const appRootRef = useRef<HTMLDivElement>(null);
  const jumpTokenRef = useRef(0);

  const requestEditorJump = useCallback(
    (tabId: string, from: number, to: number) => {
      jumpTokenRef.current += 1;
      setEditorJump({ tabId, from, to, token: jumpTokenRef.current });
    },
    [],
  );

  const handleJumpApplied = useCallback((token: number) => {
    setEditorJump((prev) => (prev && prev.token === token ? null : prev));
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const isTauri =
      typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (isTauri) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const current = await win.isFullscreen();
        await win.setFullscreen(!current);
        return;
      } catch (err) {
        console.warn("Toggle fullscreen via Tauri failed:", err);
      }
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.warn("Toggle fullscreen via browser API failed:", err);
    }
  }, []);

  // 初始化数据库（从 localStorage 迁移到 IndexedDB）
  useEffect(() => {
    initStorage()
      .then(async () => {
        // 从 IndexedDB 刷新数据
        let newData = await refreshCache();
        setData(newData);
        setClosedTabs(loadClosedTabs());
        setArchivedTabs(loadArchivedTabs());

        // 执行旧图片 URL 迁移（仅对 < 2.0.0 版本用户）
        try {
          const migrationResult = await migrateOldImageUrls();
          if (migrationResult.migrated > 0) {
            // 迁移后重新加载数据
            newData = await refreshCache();
            setData(newData);
          }
        } catch (error) {
          console.error("图片迁移失败:", error);
        }

        // 更新版本记录（用于判断后续升级是否需要迁移）
        let currentVersion: string | null = null;
        try {
          currentVersion = (await window.electronAPI?.getVersion?.()) ?? null;
        } catch (error) {
          console.warn("Failed to get app version:", error);
        }
        updateVersionRecord(currentVersion ?? "2.0.0");

        setDbInitialized(true);

        // 初始化同步
        initSync().catch(console.error);
      })
      .catch(console.error);
  }, []);

  // 监听同步事件
  useEffect(() => {
    const unsubscribe = addSyncListener((event) => {
      if (event.type === "conflict") {
        const data = event.data as any;
        const conflicts = data?.conflicts;
        if (Array.isArray(conflicts)) {
          setSyncConflicts(conflicts);
          setSyncConflictsServerTime(
            typeof data?.serverTime === "number" ? data.serverTime : null,
          );
        }
      } else if (event.type === "remote-changes") {
        // 远程数据有变化，刷新本地数据
        refreshCache()
          .then((newData) => {
            setData(newData);
          })
          .catch(console.error);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!tauriAPI) return;
    tauriAPI.getBackupSettings().then(setBackupSettings).catch(console.error);
  }, []);

  useEffect(() => {
    if (autoBackupTimerRef.current !== null) {
      window.clearInterval(autoBackupTimerRef.current);
      autoBackupTimerRef.current = null;
    }

    if (!tauriAPI || !backupSettings?.autoBackupEnabled) return;

    const intervalMinutes = Math.max(1, Number(backupSettings.autoBackupInterval) || 0);
    const intervalMs = intervalMinutes * 60 * 1000;

    const runAutoBackup = async () => {
      if (!tauriAPI || autoBackupRunningRef.current) return;
      autoBackupRunningRef.current = true;
      try {
        const data = collectBackupDataFromLocalStorage();
        await tauriAPI.performBackup(JSON.stringify(data));
      } catch (error) {
        console.error("自动备份失败:", error);
      } finally {
        autoBackupRunningRef.current = false;
      }
    };

    void runAutoBackup();

    autoBackupTimerRef.current = window.setInterval(() => {
      void runAutoBackup();
    }, intervalMs);

    return () => {
      if (autoBackupTimerRef.current !== null) {
        window.clearInterval(autoBackupTimerRef.current);
        autoBackupTimerRef.current = null;
      }
    };
  }, [backupSettings?.autoBackupEnabled, backupSettings?.autoBackupInterval]);

  // 应用字体设置
  useEffect(() => {
    document.body.style.fontFamily = `'${currentFont}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  }, [currentFont]);

  useEffect(() => {
    const root = appRootRef.current;
    if (!root) return;
    root.style.setProperty("--editor-line-height", String(editorLineHeight));
  }, [editorLineHeight]);

  useEffect(() => {
    if (!zenModeSettings.enabled && isImmersive) {
      setIsImmersive(false);
    }
  }, [zenModeSettings.enabled, isImmersive]);

  // 当前激活的标签页
  const activeTab =
    data.tabs.find((t) => t.id === data.activeTabId) || data.tabs[0];
  const sidebarBaseVisible = zenModeSettings.sidebarVisible;
  const hideTopLevelChrome = zenModeSettings.enabled && isImmersive;

  // 防抖保存
  const debounceSave = useCallback((newData: AppData) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveData(newData);
    }, 300);
  }, []);

  // 数据变化时保存
  useEffect(() => {
    if (saveImmediatelyRef.current) {
      saveImmediatelyRef.current = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      saveData(data);
      return;
    }

    debounceSave(data);
  }, [data, debounceSave]);

  // 切换标签页
  const handleTabClick = (id: string) => {
    setData((prev) => ({ ...prev, activeTabId: id }));
  };

  // 关闭标签页
  const handleTabClose = useCallback((id: string) => {
    setData((prev) => {
      // 找到要关闭的标签页和其位置
      const tabIndex = prev.tabs.findIndex((t) => t.id === id);
      const tabToClose = prev.tabs[tabIndex];
      if (!tabToClose || tabToClose.pinned) {
        return prev;
      }
      if (tabToClose) {
        saveClosedTab(tabToClose, tabIndex);
        // 刷新回收站列表
        setClosedTabs(loadClosedTabs());
      }
      const newTabs = reindexTabs(prev.tabs.filter((t) => t.id !== id));
      const newActiveId =
        prev.activeTabId === id
          ? newTabs[newTabs.length - 1]?.id || ""
          : prev.activeTabId;
      return { tabs: newTabs, activeTabId: newActiveId };
    });
  }, []);

  // 添加标签页
  const handleTabAdd = useCallback(() => {
    const baseName = t("tabBar.newPage");
    // 生成唯一名称
    let newName = baseName;
    let counter = 1;
    setData((prev) => {
      const existingNames = new Set(prev.tabs.map((tab) => tab.title));
      while (existingNames.has(newName)) {
        newName = `${baseName} ${counter}`;
        counter++;
      }
      const newTab = {
        ...createTab(newName),
        order: prev.tabs.length,
        pinned: false,
      };
      return {
        tabs: [...prev.tabs, newTab],
        activeTabId: newTab.id,
      };
    });
  }, [t]);

  // 恢复关闭的标签页（快捷键）
  const handleReopenTab = useCallback(() => {
    const closedTab = popClosedTab();
    if (closedTab) {
      // 移除 closedAt 和 index 属性，恢复为普通 Tab
      const { closedAt, index, ...tab } = closedTab;
      setData((prev) => {
        const newTabs = [...prev.tabs];
        // 恢复到原位置，如果位置超出范围则放到末尾
        const pinnedCount = newTabs.filter((t) => !!t.pinned).length;
        const insertIndex = Math.min(
          Math.max(index, pinnedCount),
          newTabs.length,
        );
        newTabs.splice(insertIndex, 0, tab);
        return {
          tabs: reindexTabs(newTabs),
          activeTabId: tab.id,
        };
      });
      // 刷新回收站列表
      setClosedTabs(loadClosedTabs());
    }
  }, []);

  // 从回收站恢复指定标签页
  const handleRestoreFromTrash = useCallback(
    (tab: ClosedTab, jumpTo?: { from: number; to: number }) => {
      // 从回收站中移除该标签页
      const remaining = removeClosedTab(tab);
      setClosedTabs(remaining);
      // 恢复标签页到原位置
      const { closedAt, index, ...restoredTab } = tab;
      setData((prev) => {
        const newTabs = [...prev.tabs];
        const pinnedCount = newTabs.filter((t) => !!t.pinned).length;
        const insertIndex = Math.min(
          Math.max(index, pinnedCount),
          newTabs.length,
        );
        newTabs.splice(insertIndex, 0, restoredTab);
        return {
          tabs: reindexTabs(newTabs),
          activeTabId: restoredTab.id,
        };
      });
      if (jumpTo) {
        requestEditorJump(restoredTab.id, jumpTo.from, jumpTo.to);
      }
    },
    [requestEditorJump],
  );

  // 清空回收站
  const handleClearTrash = useCallback(() => {
    clearClosedTabs();
    setClosedTabs([]);
  }, []);

  // 从回收站删除单个标签页
  const handleDeleteFromTrash = useCallback((tab: ClosedTab) => {
    const remaining = removeClosedTab(tab);
    setClosedTabs(remaining);
  }, []);

  // 归档标签页
  const handleArchiveTab = useCallback((id: string) => {
    setData((prev) => {
      const tabToArchive = prev.tabs.find((t) => t.id === id);
      if (tabToArchive) {
        saveArchivedTab(tabToArchive);
        setArchivedTabs(loadArchivedTabs());
      }
      const newTabs = reindexTabs(prev.tabs.filter((t) => t.id !== id));
      // 如果归档的是当前激活的标签页，切换到最后一个
      const newActiveId =
        prev.activeTabId === id
          ? newTabs[newTabs.length - 1]?.id || ""
          : prev.activeTabId;
      return { tabs: newTabs, activeTabId: newActiveId };
    });
  }, []);

  // 从归档恢复标签页
  const handleRestoreFromArchive = useCallback(
    (tab: ArchivedTab, jumpTo?: { from: number; to: number }) => {
      const remaining = removeArchivedTab(tab);
      setArchivedTabs(remaining);
      // 恢复标签页
      const { archivedAt, ...restoredTab } = tab;
      setData((prev) => {
        const newTabs = [...prev.tabs];
        const pinnedCount = newTabs.filter((t) => !!t.pinned).length;
        const wantsPinned = !!restoredTab.pinned;
        const rawIndex =
          typeof restoredTab.order === "number"
            ? restoredTab.order
            : newTabs.length;
        const insertIndex = wantsPinned
          ? 0
          : Math.min(Math.max(rawIndex, pinnedCount), newTabs.length);
        newTabs.splice(insertIndex, 0, restoredTab);
        return {
          tabs: reindexTabs(newTabs),
          activeTabId: restoredTab.id,
        };
      });
      if (jumpTo) {
        requestEditorJump(restoredTab.id, jumpTo.from, jumpTo.to);
      }
    },
    [requestEditorJump],
  );

  // 从归档删除标签页
  const handleDeleteFromArchive = useCallback((tab: ArchivedTab) => {
    const remaining = removeArchivedTab(tab);
    setArchivedTabs(remaining);
  }, []);

  // 清空归档
  const handleClearArchive = useCallback(() => {
    clearArchivedTabs();
    setArchivedTabs([]);
  }, []);

  // 切换到下一个标签页
  const handleNextTab = useCallback(() => {
    setData((prev) => {
      const currentIndex = prev.tabs.findIndex(
        (t) => t.id === prev.activeTabId,
      );
      const nextIndex = (currentIndex + 1) % prev.tabs.length;
      return { ...prev, activeTabId: prev.tabs[nextIndex].id };
    });
  }, []);

  // 切换到上一个标签页
  const handlePrevTab = useCallback(() => {
    setData((prev) => {
      const currentIndex = prev.tabs.findIndex(
        (t) => t.id === prev.activeTabId,
      );
      const prevIndex =
        (currentIndex - 1 + prev.tabs.length) % prev.tabs.length;
      return { ...prev, activeTabId: prev.tabs[prevIndex].id };
    });
  }, []);

  // 切换到指定索引的标签页
  const handleSwitchToTab = useCallback((index: number) => {
    setData((prev) => {
      if (index >= 0 && index < prev.tabs.length) {
        return { ...prev, activeTabId: prev.tabs[index].id };
      }
      return prev;
    });
  }, []);

  // 刷新快捷键配置
  const refreshShortcuts = useCallback(() => {
    setShortcuts(loadShortcuts());
  }, []);

  // 处理语言切换，更新默认命名的标签页
  const handleLanguageChange = useCallback(
    (lang: string) => {
      // 使用 i18n 的 lng 选项获取不同语言的默认名称
      // 需要处理 newPage（新建页）和 defaultPage（默认页）两种情况
      const zhNewPage = t("tabBar.newPage", { lng: "zh" });
      const enNewPage = t("tabBar.newPage", { lng: "en" });
      const zhDefaultPage = t("tabBar.defaultPage", { lng: "zh" });
      const enDefaultPage = t("tabBar.defaultPage", { lng: "en" });
      // 还需要包含硬编码的初始值 'New Page'（storage.ts 中的默认值）
      const defaultNames = [
        zhNewPage,
        enNewPage,
        zhDefaultPage,
        enDefaultPage,
        "New Page",
      ];

      // 获取新语言的默认名称（使用 newPage 作为新标签的名称）
      const newDefaultName = t("tabBar.newPage", { lng: lang });

      setData((prev) => ({
        ...prev,
        tabs: prev.tabs.map((tab) =>
          defaultNames.includes(tab.title)
            ? { ...tab, title: newDefaultName }
            : tab,
        ),
      }));
    },
    [t],
  );

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 自定义快捷键：新建标签页
      if (!e.ctrlKey && !e.altKey && !e.shiftKey && e.key === "F11") {
        e.preventDefault();
        if (e.repeat) return;
        void toggleFullscreen();
        return;
      }

      if (matchShortcut(e, shortcuts.newTab)) {
        e.preventDefault();
        handleTabAdd();
        return;
      }

      // 固定快捷键：Ctrl+N 新建标签页
      if (
        e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === "n"
      ) {
        e.preventDefault();
        handleTabAdd();
        return;
      }

      // 自定义快捷键：关闭标签页
      if (matchShortcut(e, shortcuts.closeTab)) {
        e.preventDefault();
        if (data.tabs.length > 1) {
          handleTabClose(data.activeTabId);
        }
        return;
      }

      // 自定义快捷键：恢复关闭的标签页
      if (matchShortcut(e, shortcuts.reopenTab)) {
        e.preventDefault();
        handleReopenTab();
        return;
      }

      // 固定快捷键：Ctrl+, 打开设置
      if (e.ctrlKey && e.key === ",") {
        e.preventDefault();
        setShowSettings((prev) => !prev);
        return;
      }

      // 固定快捷键：Ctrl+Tab 切换到下一个标签页
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          handlePrevTab();
        } else {
          handleNextTab();
        }
        return;
      }

      // 固定快捷键：Ctrl+1~9 切换到指定标签页
      if (e.ctrlKey && !e.altKey && !e.shiftKey) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9) {
          e.preventDefault();
          handleSwitchToTab(num - 1);
          return;
        }
      }

      // 自定义快捷键：搜索标签页
      if (matchShortcut(e, shortcuts.searchTabs)) {
        e.preventDefault();
        setShowSearch(true);
        return;
      }

      // 自定义快捷键：归档当前标签页
      if (matchShortcut(e, shortcuts.archiveTab)) {
        e.preventDefault();
        if (data.activeTabId) {
          handleArchiveTab(data.activeTabId);
        }
        return;
      }

      // 固定快捷键：Ctrl+\ 切换侧边栏
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key === "\\") {
        e.preventDefault();
        setZenModeSettings((prev) => {
          const newSettings = { ...prev, sidebarVisible: !prev.sidebarVisible };
          saveZenMode(newSettings);
          return newSettings;
        });
        return;
      }

      // 固定快捷键：F2 重命名当前标签页（侧边栏隐藏时自动显示）
      if (!e.ctrlKey && !e.altKey && !e.shiftKey && e.key === "F2") {
        e.preventDefault();
        if (!data.activeTabId) return;
        if (isImmersive && zenModeSettings.enabled) {
          setIsImmersive(false);
        }
        setZenModeSettings((prev) => {
          if (prev.sidebarVisible) {
            sidebarWasHiddenRef.current = false;
            return prev;
          }
          sidebarWasHiddenRef.current = true;
          const newSettings = { ...prev, sidebarVisible: true };
          saveZenMode(newSettings);
          return newSettings;
        });
        setRenameRequestToken((prev) => prev + 1);
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    data.tabs.length,
    data.activeTabId,
    shortcuts,
    handleTabAdd,
    handleTabClose,
    handleReopenTab,
    handleNextTab,
    handlePrevTab,
    handleSwitchToTab,
    handleArchiveTab,
    isImmersive,
    zenModeSettings.enabled,
    toggleFullscreen,
  ]);

  // 重命名标签页
  const handleTabRename = (id: string, newTitle: string) => {
    setData((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              title: newTitle,
              updatedAt: Date.now(),
              localVersion: (t.localVersion ?? 1) + 1,
            }
          : t,
      ),
    }));
  };

  // F2 重命名完成后的回调：重置 token 并恢复侧边栏状态
  const handleRenameComplete = useCallback(() => {
    setRenameRequestToken(0); // 重置 token，防止侧边栏重新挂载时再次进入重命名
    if (sidebarWasHiddenRef.current) {
      sidebarWasHiddenRef.current = false;
      setZenModeSettings((prev) => {
        const newSettings = { ...prev, sidebarVisible: false };
        saveZenMode(newSettings);
        return newSettings;
      });
    }
  }, []);

  // 固定/取消固定标签页
  const handleTabPinToggle = useCallback((id: string) => {
    setData((prev) => {
      if (prev.tabs.length <= 1) return prev;
      const tabIndex = prev.tabs.findIndex((t) => t.id === id);
      if (tabIndex === -1) return prev;

      const tab = prev.tabs[tabIndex];
      const currentPinnedCount = prev.tabs.filter((t) => !!t.pinned).length;
      const remaining = prev.tabs.filter((t) => t.id !== id);

      let newTabs: typeof prev.tabs;
      if (!tab.pinned) {
        const currentUnpinnedOrder =
          typeof tab.unpinnedOrder === "number"
            ? tab.unpinnedOrder
            : Math.max(0, tabIndex - currentPinnedCount);
        newTabs = [
          { ...tab, pinned: true, unpinnedOrder: currentUnpinnedOrder },
          ...remaining,
        ];
      } else {
        const pinnedCount = remaining.filter((t) => !!t.pinned).length;
        const unpinnedTabs = remaining.slice(pinnedCount);
        const rawRestoreIndex =
          typeof tab.unpinnedOrder === "number"
            ? tab.unpinnedOrder
            : unpinnedTabs.length;
        const restoreIndex = Math.max(
          0,
          Math.min(rawRestoreIndex, unpinnedTabs.length),
        );
        newTabs = [
          ...remaining.slice(0, pinnedCount),
          ...unpinnedTabs.slice(0, restoreIndex),
          { ...tab, pinned: false, unpinnedOrder: restoreIndex },
          ...unpinnedTabs.slice(restoreIndex),
        ];
      }

      const now = Date.now();
      const touched = reindexTabs(newTabs).map((t) => ({
        ...t,
        updatedAt: now,
        localVersion: (t.localVersion ?? 1) + 1,
      }));

      saveImmediatelyRef.current = true;
      return { ...prev, tabs: touched };
    });
  }, []);

  // 标签页拖拽重新排序
  const handleTabReorder = useCallback((fromIndex: number, toIndex: number) => {
    setData((prev) => {
      if (fromIndex === toIndex) return prev;
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.tabs.length ||
        toIndex >= prev.tabs.length
      ) {
        return prev;
      }

      const pinnedCount = prev.tabs.filter((t) => !!t.pinned).length;
      const fromPinned = !!prev.tabs[fromIndex]?.pinned;
      const valid = fromPinned ? toIndex < pinnedCount : toIndex >= pinnedCount;
      if (!valid) return prev;

      const newTabs = [...prev.tabs];
      const [movedTab] = newTabs.splice(fromIndex, 1);
      const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      const finalToIndex = Math.max(
        0,
        Math.min(adjustedToIndex, newTabs.length),
      );
      newTabs.splice(finalToIndex, 0, movedTab);

      const now = Date.now();
      const touched = reindexTabs(newTabs).map((t) => ({
        ...t,
        updatedAt: now,
        localVersion: (t.localVersion ?? 1) + 1,
      }));

      saveImmediatelyRef.current = true;
      return { ...prev, tabs: touched };
    });
  }, []);

  // 更新标签页内容
  const handleContentChange = (content: string) => {
    setData((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) =>
        t.id === prev.activeTabId
          ? {
              ...t,
              content,
              updatedAt: Date.now(),
              localVersion: (t.localVersion ?? 1) + 1,
            }
          : t,
      ),
    }));
  };

  // 沉浸模式处理：编辑器活动回调
  const handleEditorActivity = useCallback(
    (type: "typing") => {
      if (!zenModeSettings.enabled) return;

      if (type === "typing") {
        setIsImmersive(true);
      }
    },
    [zenModeSettings.enabled],
  );

  // 指针水平移动退出沉浸模式（需要明确的水平移动意图）
  useEffect(() => {
    if (!isImmersive) return;

    const POINTER_STEP_MIN = 4;
    const POINTER_INTENT_THRESHOLD = 90;
    const POINTER_RESET_MS = 250;

    const handlePointerMove = (e: PointerEvent | MouseEvent) => {
      const prev = lastPointerRef.current;
      const now = Date.now();
      if (!prev) {
        lastPointerRef.current = { x: e.clientX, y: e.clientY, t: now };
        pointerAccumRef.current = 0;
        return;
      }

      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      const dt = now - prev.t;
      lastPointerRef.current = { x: e.clientX, y: e.clientY, t: now };

      if (dt > POINTER_RESET_MS) {
        pointerAccumRef.current = 0;
      }

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx <= absDy || absDx < POINTER_STEP_MIN) {
        if (absDy > absDx && pointerAccumRef.current > 0) {
          pointerAccumRef.current = 0;
        }
        return;
      }

      pointerAccumRef.current += absDx;
      if (pointerAccumRef.current >= POINTER_INTENT_THRESHOLD) {
        pointerAccumRef.current = 0;
        setIsImmersive(false);
      }
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    window.addEventListener("mousemove", handlePointerMove, { passive: true });
    return () => {
      lastPointerRef.current = null;
      pointerAccumRef.current = 0;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("mousemove", handlePointerMove);
    };
  }, [isImmersive]);

  // 字符统计
  const charCount = activeTab?.content.length || 0;
  const lineCount = activeTab?.content.split("\n").length || 1;
  const activeJump =
    editorJump && activeTab && editorJump.tabId === activeTab.id
      ? { from: editorJump.from, to: editorJump.to, token: editorJump.token }
      : null;

  const appClassName = [
    "app",
    sidebarBaseVisible ? "sidebar-visible" : "",
    hideTopLevelChrome ? "immersive-ui-hidden" : "",
    isImmersive ? "immersive" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={appRootRef} className={appClassName}>
      {sidebarBaseVisible && (
        <Sidebar
          tabs={data.tabs}
          activeTabId={data.activeTabId}
          onTabClick={handleTabClick}
          onTabClose={handleTabClose}
          onTabAdd={handleTabAdd}
          onTabRename={handleTabRename}
          onTabPinToggle={handleTabPinToggle}
          onTabReorder={handleTabReorder}
          onTabArchive={handleArchiveTab}
          renameRequestToken={renameRequestToken}
          onRenameComplete={handleRenameComplete}
          onOpenModal={(tab) => {
            setSearchModalTab(tab);
            setShowSearch(true);
          }}
        />
      )}
      <TitleBar
        onOpenSettings={() => setShowSettings(true)}
        onToggleSidebar={() => {
          setZenModeSettings((prev) => {
            const newSettings = {
              ...prev,
              sidebarVisible: !prev.sidebarVisible,
            };
            saveZenMode(newSettings);
            return newSettings;
          });
        }}
        sidebarVisible={sidebarBaseVisible}
        onOpenSearch={() => {
          setSearchModalTab("active");
          setShowSearch(true);
        }}
      />
      <div className="app-body">
        <main className="app-main">
          {activeTab && (
            <Editor
              key={`${activeTab.id}-${editorFont}-${editorFontSize}-${editorTabIndentText === "\t" ? "tab" : editorTabIndentText.length}-cbh${editorCodeBlockHighlight ? 1 : 0}-qsi${editorQuickSymbolInput ? 1 : 0}`}
              content={activeTab.content}
              onChange={handleContentChange}
              onActivity={handleEditorActivity}
              font={editorFont}
              fontSize={editorFontSize}
              tabIndentText={editorTabIndentText}
              enableCodeBlockHighlight={editorCodeBlockHighlight}
              enableQuickSymbolInput={editorQuickSymbolInput}
              jumpTo={activeJump}
              onJumpApplied={handleJumpApplied}
              autoFocus
            />
          )}
        </main>
      </div>
      <StatsOverlay
        lineCount={lineCount}
        charCount={charCount}
        hidden={zenModeSettings.enabled && zenModeSettings.hideStatsCapsule}
        onOpenHelp={() => setShowHelp(true)}
      />
      <Settings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onOpenHelp={() => setShowHelp(true)}
        onShortcutsChange={refreshShortcuts}
        onFontChange={setCurrentFont}
        onEditorFontChange={setEditorFont}
        onEditorFontSizeChange={setEditorFontSize}
        onEditorTabIndentTextChange={setEditorTabIndentText}
        onEditorLineHeightChange={setEditorLineHeight}
        onEditorCodeBlockHighlightChange={setEditorCodeBlockHighlight}
        onEditorQuickSymbolInputChange={setEditorQuickSymbolInput}
        onLanguageChange={handleLanguageChange}
        zenModeEnabled={zenModeSettings.enabled}
        zenHideStatsCapsule={zenModeSettings.hideStatsCapsule}
        onZenModeChange={(enabled) => {
          setZenModeSettings((prev) => {
            const newSettings = { ...prev, enabled };
            saveZenMode(newSettings);
            return newSettings;
          });
        }}
        onZenHideStatsCapsuleChange={(hidden) => {
          setZenModeSettings((prev) => {
            const newSettings = { ...prev, hideStatsCapsule: hidden };
            saveZenMode(newSettings);
            return newSettings;
          });
        }}
        onBackupSettingsChange={setBackupSettings}
      />
      <TabSearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        defaultTab={searchModalTab}
        tabs={data.tabs}
        archivedTabs={archivedTabs}
        closedTabs={closedTabs}
        onSelectTab={(tab, jumpTo) => {
          setData((prev) => ({ ...prev, activeTabId: tab.id }));
          if (jumpTo) {
            requestEditorJump(tab.id, jumpTo.from, jumpTo.to);
          }
          setShowSearch(false);
        }}
        onRestoreArchived={handleRestoreFromArchive}
        onRestoreClosed={handleRestoreFromTrash}
        onDeleteArchived={handleDeleteFromArchive}
        onDeleteClosed={handleDeleteFromTrash}
        onClearArchive={handleClearArchive}
        onClearTrash={handleClearTrash}
      />
      <HelpPanel
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        shortcuts={shortcuts}
      />
      {syncConflicts.length > 0 && (
        <ConflictResolver
          conflicts={syncConflicts}
          serverTime={syncConflictsServerTime ?? undefined}
          onResolved={() => {
            refreshCache()
              .then((newData) => {
                setData(newData);
              })
              .catch(console.error);
          }}
          onClose={() => {
            setSyncConflicts([]);
            setSyncConflictsServerTime(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
