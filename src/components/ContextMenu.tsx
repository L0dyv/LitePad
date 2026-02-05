import { useEffect, useRef } from "react";
import "./ContextMenu.css";

export interface MenuItem {
  label?: string;
  onClick?: () => void;
  checked?: boolean;
  separator?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // 调整位置防止超出窗口
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const adjustedX = x + rect.width > window.innerWidth ? x - rect.width : x;
      const adjustedY =
        y + rect.height > window.innerHeight ? y - rect.height : y;
      menuRef.current.style.left = `${Math.max(0, adjustedX)}px`;
      menuRef.current.style.top = `${Math.max(0, adjustedY)}px`;
    }
  }, [x, y]);

  return (
    <div ref={menuRef} className="context-menu" style={{ left: x, top: y }}>
      {items.map((item, index) =>
        item.separator ? (
          <div key={index} className="context-menu-separator" />
        ) : (
          <button
            key={index}
            className="context-menu-item"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled || !item.onClick) return;
              item.onClick();
              onClose();
            }}
          >
            {item.checked !== undefined && (
              <span className="context-menu-check">
                {item.checked ? "✓" : ""}
              </span>
            )}
            <span>{item.label ?? ""}</span>
          </button>
        ),
      )}
    </div>
  );
}
