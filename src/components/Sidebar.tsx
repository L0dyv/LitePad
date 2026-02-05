import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Archive, MapPin, Plus, Trash2 } from "lucide-react";
import { Tab } from "../utils/storage";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { ModalTab } from "./TabSearchModal";
import "./Sidebar.css";

const SIDEBAR_WIDTH_KEY = "flashpad-sidebar-width";
const DEFAULT_WIDTH = 200;
const MIN_WIDTH = 150;
const MAX_WIDTH = 400;

interface SidebarProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabAdd: () => void;
  onTabRename: (id: string, newTitle: string) => void;
  onTabPinToggle: (id: string) => void;
  onTabReorder?: (fromIndex: number, toIndex: number) => void;
  onTabArchive: (id: string) => void;
  onOpenModal: (tab: ModalTab) => void;
  renameRequestToken?: number;
  onRenameComplete?: () => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  tabId: string | null;
}

// 加载保存的宽度
function loadSidebarWidth(): number {
  try {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (saved) {
      const width = parseInt(saved, 10);
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) {
        return width;
      }
    }
  } catch (e) {
    console.error("加载侧边栏宽度失败:", e);
  }
  return DEFAULT_WIDTH;
}

// 保存宽度
function saveSidebarWidth(width: number): void {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, width.toString());
  } catch (e) {
    console.error("保存侧边栏宽度失败:", e);
  }
}

export function Sidebar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabAdd,
  onTabRename,
  onTabPinToggle,
  onTabReorder,
  onTabArchive,
  onOpenModal,
  renameRequestToken,
  onRenameComplete,
}: SidebarProps) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    tabId: null,
  });
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [width, setWidth] = useState(() => loadSidebarWidth());
  const [isResizing, setIsResizing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const isF2RenameRef = useRef(false);

  // 当进入编辑模式时，聚焦输入框
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // App 侧请求：进入当前标签页重命名（F2）
  useEffect(() => {
    if (!renameRequestToken) return;
    if (!activeTabId) return;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    isF2RenameRef.current = true;
    setEditingId(tab.id);
    setEditValue(tab.title);
  }, [renameRequestToken]);

  // 拖拽调整宽度
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      saveSidebarWidth(width);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, width]);

  useEffect(() => {
    const appRoot = sidebarRef.current?.closest(".app") as HTMLElement | null;
    if (!appRoot) return;
    appRoot.style.setProperty("--sidebar-width", `${width}px`);
  }, [width]);

  const handleDoubleClick = (tab: Tab) => {
    setEditingId(tab.id);
    setEditValue(tab.title);
  };

  const handleRenameConfirm = (id: string) => {
    if (editValue.trim()) {
      onTabRename(id, editValue.trim());
    }
    setEditingId(null);
    setEditValue("");
    if (isF2RenameRef.current) {
      isF2RenameRef.current = false;
      onRenameComplete?.();
    }
  };

  const handleRenameCancel = () => {
    setEditingId(null);
    setEditValue("");
    if (isF2RenameRef.current) {
      isF2RenameRef.current = false;
      onRenameComplete?.();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleRenameConfirm(id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleRenameCancel();
    }
  };

  const handleClose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (tabs.length > 1) {
      onTabClose(id);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      tabId,
    });
  };

  const closeContextMenu = () => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  // 拖拽排序相关处理
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (editingId) {
      e.preventDefault();
      return;
    }
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const isValidDropTarget = (fromIndex: number, toIndex: number) => {
    const pinnedCount = tabs.filter((t) => !!t.pinned).length;
    const fromPinned = !!tabs[fromIndex]?.pinned;
    return fromPinned ? toIndex < pinnedCount : toIndex >= pinnedCount;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (draggedIndex === null || draggedIndex === index) return;
    if (!isValidDropTarget(draggedIndex, index)) {
      setDragOverIndex(null);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== toIndex && onTabReorder) {
      if (isValidDropTarget(draggedIndex, toIndex)) {
        onTabReorder(draggedIndex, toIndex);
      }
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const getContextMenuItems = (): MenuItem[] => {
    const tabId = contextMenu.tabId;
    const tab = tabs.find((t) => t.id === tabId);

    if (!tab) return [];

    const items: MenuItem[] = [
      {
        label: t("tabBar.rename"),
        onClick: () => {
          setEditingId(tab.id);
          setEditValue(tab.title);
        },
      },
      ...(tabs.length > 1
        ? [
            {
              label: tab.pinned ? t("tabBar.unpin") : t("tabBar.pin"),
              onClick: () => onTabPinToggle(tab.id),
            },
          ]
        : []),
      {
        label: t("tabBar.archive"),
        onClick: () => {
          onTabArchive(tab.id);
        },
      },
    ];

    if (tabs.length > 1 && !tab.pinned) {
      items.push({
        label: t("tabBar.close"),
        onClick: () => onTabClose(tab.id),
      });
    }

    return items;
  };

  return (
    <>
      <aside
        className={`sidebar ${isResizing ? "resizing" : ""}`}
        ref={sidebarRef}
        style={{
          width: `${width}px`,
          minWidth: `${width}px`,
          maxWidth: `${width}px`,
        }}
      >
        <div className="sidebar-tabs">
          {tabs.map((tab, index) => (
            <div
              key={tab.id}
              className={`sidebar-tab ${tab.pinned ? "pinned" : ""} ${tab.id === activeTabId ? "active" : ""}${draggedIndex === index ? " dragging" : ""}${dragOverIndex === index ? " drag-over" : ""}`}
              draggable={editingId !== tab.id}
              onClick={() => editingId !== tab.id && onTabClick(tab.id)}
              onDoubleClick={() => handleDoubleClick(tab)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            >
              <div
                className={`sidebar-tab-label ${editingId === tab.id ? "editing" : ""}`}
              >
                <span
                  className={`sidebar-tab-pin ${tab.pinned ? "visible" : ""}`}
                  aria-label={tab.pinned ? t("tabBar.pin") : undefined}
                >
                  {tab.pinned && <MapPin size={12} strokeWidth={2} />}
                </span>
                {editingId === tab.id ? (
                  <input
                    ref={inputRef}
                    className="sidebar-rename-input"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, tab.id)}
                    onBlur={() => handleRenameConfirm(tab.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="sidebar-tab-title">{tab.title}</span>
                )}
              </div>
              {tabs.length > 1 && editingId !== tab.id && !tab.pinned && (
                <button
                  className="sidebar-tab-close"
                  onClick={(e) => handleClose(e, tab.id)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <button
            className="sidebar-btn"
            onClick={onTabAdd}
            title={t("settings.newTab")}
          >
            <Plus size={14} strokeWidth={2} />
          </button>
          <button
            className="sidebar-btn"
            onClick={() => onOpenModal("archived")}
            title={t("archive.title")}
          >
            <Archive size={14} strokeWidth={2} />
          </button>
          <button
            className="sidebar-btn"
            onClick={() => onOpenModal("closed")}
            title={t("trash.title")}
          >
            <Trash2 size={14} strokeWidth={2} />
          </button>
        </div>
        <div
          className="sidebar-resize-handle"
          onMouseDown={handleResizeMouseDown}
        />
      </aside>
      {contextMenu.visible && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={closeContextMenu}
        />
      )}
    </>
  );
}
