import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  EditorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
  Transaction,
} from "@codemirror/state";
import {
  EditorView,
  keymap,
  highlightActiveLine,
  Decoration,
  ViewPlugin,
  MatchDecorator,
  DecorationSet,
  WidgetType,
  ViewUpdate,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  redo,
  undo,
} from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import {
  markdown,
  markdownLanguage,
  insertNewlineContinueMarkup,
} from "@codemirror/lang-markdown";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  indentUnit,
  LanguageDescription,
} from "@codemirror/language";
import { GFM } from "@lezer/markdown";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { evaluate } from "mathjs";
import { putAttachment, type Attachment } from "../db";
import { ContextMenu, type MenuItem } from "./ContextMenu";

// URL 正则表达式
const urlRegex = /https?:\/\/[^\s<>"'()\[\]]+/g;

const codeFenceLanguages: readonly LanguageDescription[] = [
  LanguageDescription.of({
    name: "JavaScript",
    alias: ["js", "javascript"],
    support: javascript(),
  }),
  LanguageDescription.of({
    name: "TypeScript",
    alias: ["ts", "typescript"],
    support: javascript({ typescript: true }),
  }),
  LanguageDescription.of({
    name: "JSX",
    alias: ["jsx"],
    support: javascript({ jsx: true }),
  }),
  LanguageDescription.of({
    name: "TSX",
    alias: ["tsx"],
    support: javascript({ typescript: true, jsx: true }),
  }),
  LanguageDescription.of({
    name: "HTML",
    alias: ["html", "htm"],
    support: html(),
  }),
  LanguageDescription.of({ name: "CSS", alias: ["css"], support: css() }),
];

// 链接装饰器样式
const linkMark = Decoration.mark({ class: "cm-link-url" });

type FlashHighlightRange = { from: number; to: number };

const setFlashHighlightEffect = StateEffect.define<FlashHighlightRange>();
const clearFlashHighlightEffect = StateEffect.define<null>();
const flashHighlightMark = Decoration.mark({ class: "cm-flash-highlight" });

const flashHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, transaction) {
    let mapped = decorations.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (effect.is(setFlashHighlightEffect)) {
        const { from, to } = effect.value;
        if (to > from) {
          mapped = Decoration.set([flashHighlightMark.range(from, to)]);
        }
      } else if (effect.is(clearFlashHighlightEffect)) {
        mapped = Decoration.none;
      }
    }

    return mapped;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// 链接匹配装饰器
const linkDecorator = new MatchDecorator({
  regexp: urlRegex,
  decoration: linkMark,
});

// 链接高亮插件
const linkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = linkDecorator.createDeco(view);
    }
    update(update: {
      docChanged: boolean;
      viewportChanged: boolean;
      view: EditorView;
    }) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = linkDecorator.createDeco(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// Ctrl+Click 打开链接的事件处理
const linkClickHandler = EditorView.domEventHandlers({
  click: (event: MouseEvent, view: EditorView) => {
    if (!event.ctrlKey) return false;

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;

    const line = view.state.doc.lineAt(pos);
    const lineText = line.text;

    // 查找点击位置所在的 URL
    let match: RegExpExecArray | null;
    const regex = new RegExp(urlRegex.source, "g");
    while ((match = regex.exec(lineText)) !== null) {
      const urlStart = line.from + match.index;
      const urlEnd = urlStart + match[0].length;
      if (pos >= urlStart && pos <= urlEnd) {
        // 在默认浏览器中打开链接
        window.electronAPI?.openExternalUrl(match[0]);
        event.preventDefault();
        return true;
      }
    }
    return false;
  },
});

// 图片正则表达式：匹配 ![alt](litepad://images/...) 或 ![alt](asset://...)（兼容旧格式）
const imageRegex =
  /!\[([^\]]*)\]\(((?:litepad:\/\/images\/|asset:\/\/)[^)]+)\)/g;

// 图片预览 Widget
class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }

  toDOM(_view: EditorView) {
    const container = document.createElement("div");
    container.className = "cm-image-preview";
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.style.maxWidth = "300px";
    img.style.maxHeight = "200px";
    img.style.borderRadius = "4px";
    img.style.marginTop = "4px";
    img.style.marginBottom = "4px";
    img.onerror = () => {
      container.style.display = "none";
    };
    container.appendChild(img);
    return container;
  }

  eq(other: ImageWidget) {
    return this.src === other.src;
  }
}

// 图片预览插件
const imagePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const doc = view.state.doc;

      for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const regex = new RegExp(imageRegex.source, "g");
        let match: RegExpExecArray | null;

        while ((match = regex.exec(line.text)) !== null) {
          const alt = match[1];
          const src = match[2];
          const widget = Decoration.widget({
            widget: new ImageWidget(src, alt),
            side: 1,
          });
          builder.add(line.to, line.to, widget);
        }
      }

      return builder.finish();
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// 任务列表复选框：匹配 - [ ] / - [x]（GFM）
const taskListRegex = /^([\t ]*[-*+]\s+)\[([ xX])\]/;

class TaskCheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly togglePos: number,
  ) {
    super();
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-task-checkbox";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.checked;
    checkbox.tabIndex = -1;

    checkbox.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    checkbox.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const current = view.state.doc.sliceString(
        this.togglePos,
        this.togglePos + 1,
      );
      const isChecked = current.toLowerCase() === "x";
      view.dispatch({
        changes: {
          from: this.togglePos,
          to: this.togglePos + 1,
          insert: isChecked ? " " : "x",
        },
      });
    });

    wrapper.appendChild(checkbox);
    return wrapper;
  }

  eq(other: TaskCheckboxWidget) {
    return other.checked === this.checked && other.togglePos === this.togglePos;
  }

  ignoreEvent() {
    return true;
  }
}

const taskListPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const doc = view.state.doc;

      let inFence = false;
      for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const lineText = line.text;

        if (lineText.trimStart().startsWith("```")) {
          inFence = !inFence;
          continue;
        }
        if (inFence) continue;

        const match = taskListRegex.exec(lineText);
        if (!match) continue;

        const checked = match[2].toLowerCase() === "x";
        const bracketFrom = line.from + match[1].length;
        const bracketTo = bracketFrom + 3;
        builder.add(
          bracketFrom,
          bracketTo,
          Decoration.replace({
            widget: new TaskCheckboxWidget(checked, bracketFrom + 1),
          }),
        );
      }

      return builder.finish();
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

const tableSeparatorRegex = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

const tableBorderPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const doc = view.state.doc;

      const insideFence = new Array<boolean>(doc.lines + 1).fill(false);
      let inFence = false;
      for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
        const text = doc.line(lineNo).text;
        if (text.trimStart().startsWith("```")) {
          inFence = !inFence;
          continue;
        }
        insideFence[lineNo] = inFence;
      }

      const tableLines = new Map<number, "sep" | "row">();

      for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
        if (insideFence[lineNo]) continue;

        const lineText = doc.line(lineNo).text;
        if (!tableSeparatorRegex.test(lineText)) continue;

        tableLines.set(lineNo, "sep");

        const headerLineNo = lineNo - 1;
        if (headerLineNo >= 1 && !insideFence[headerLineNo]) {
          const headerText = doc.line(headerLineNo).text;
          if (headerText.includes("|")) {
            tableLines.set(headerLineNo, "row");
          }
        }

        for (
          let bodyLineNo = lineNo + 1;
          bodyLineNo <= doc.lines;
          bodyLineNo++
        ) {
          if (insideFence[bodyLineNo]) break;

          const bodyText = doc.line(bodyLineNo).text;
          if (bodyText.trim().length === 0) break;
          if (!bodyText.includes("|")) break;
          if (tableSeparatorRegex.test(bodyText)) break;

          tableLines.set(bodyLineNo, "row");
        }
      }

      const sortedLineNos = Array.from(tableLines.keys()).sort((a, b) => a - b);
      for (const lineNo of sortedLineNos) {
        const kind = tableLines.get(lineNo);
        if (!kind) continue;

        const line = doc.line(lineNo);
        builder.add(
          line.from,
          line.from,
          Decoration.line({
            class: kind === "sep" ? "cm-table-sep" : "cm-table-row",
          }),
        );

        const text = line.text;
        for (let i = 0; i < text.length; i++) {
          if (text[i] !== "|") continue;
          builder.add(
            line.from + i,
            line.from + i + 1,
            Decoration.mark({ class: "cm-table-pipe" }),
          );
        }
      }

      return builder.finish();
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// 处理图片文件
const processImageFile = async (file: File, view: EditorView) => {
  if (!file.type.startsWith("image/")) return;

  try {
    const buffer = await file.arrayBuffer();
    const ext = "." + (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
    const result = await window.electronAPI?.saveImage(buffer, ext);

    if (result) {
      // 保存附件元数据到 IndexedDB
      const attachment: Attachment = {
        hash: result.hash,
        filename: file.name,
        mimeType: file.type,
        size: result.size,
        ext: result.ext,
        localPath: "", // 由 Tauri 管理
        syncStatus: "pending",
        createdAt: Date.now(),
        syncedAt: null,
      };
      await putAttachment(attachment);

      // 插入 Markdown 图片引用
      const pos = view.state.selection.main.head;
      const imageMarkdown = `![${file.name}](${result.url})`;
      view.dispatch({
        changes: { from: pos, insert: imageMarkdown + "\n" },
        selection: { anchor: pos + imageMarkdown.length + 1 },
      });
    }
  } catch (error) {
    console.error("图片保存失败:", error);
  }
};

// 图片拖放和粘贴事件处理
const imageHandler = EditorView.domEventHandlers({
  drop: (event: DragEvent, view: EditorView) => {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return false;

    const imageFiles = Array.from(files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (imageFiles.length === 0) return false;

    event.preventDefault();
    imageFiles.forEach((file) => processImageFile(file, view));
    return true;
  },
  paste: (event: ClipboardEvent, view: EditorView) => {
    const items = event.clipboardData?.items;
    if (!items) return false;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          processImageFile(file, view);
          return true;
        }
      }
    }
    return false;
  },
});

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  onActivity?: (type: "typing") => void;
  font?: string;
  fontSize?: number;
  autoFocus?: boolean;
  tabIndentText?: string;
  enableCodeBlockHighlight?: boolean;
  enableQuickSymbolInput?: boolean;
  jumpTo?: { from: number; to: number; token: number } | null;
  onJumpApplied?: (token: number) => void;
}

export function Editor({
  content,
  onChange,
  onActivity,
  font = "Consolas",
  fontSize = 14,
  autoFocus = false,
  tabIndentText = "    ",
  enableCodeBlockHighlight = false,
  enableQuickSymbolInput = true,
  jumpTo = null,
  onJumpApplied,
}: EditorProps) {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isExternalUpdate = useRef(false);
  const isAutoRenumbering = useRef(false);
  const isImeComposingRef = useRef(false);
  const lastCompositionEndAtRef = useRef(0);
  const flashTimeoutRef = useRef<number | null>(null);
  const flashTokenRef = useRef(0);
  const [editorContextMenu, setEditorContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
  });

  const closeEditorContextMenu = useCallback(() => {
    setEditorContextMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleEditorContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      setEditorContextMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [],
  );

  const focusEditor = useCallback(() => {
    const view = viewRef.current;
    if (!view) return null;
    view.focus();
    return view;
  }, []);

  const copySelection = useCallback(async () => {
    const view = focusEditor();
    if (!view) return;
    const { from, to, empty } = view.state.selection.main;
    if (empty) return;
    const selected = view.state.sliceDoc(from, to);
    try {
      await navigator.clipboard.writeText(selected);
    } catch {
      document.execCommand("copy");
    }
  }, [focusEditor]);

  const cutSelection = useCallback(async () => {
    const view = focusEditor();
    if (!view) return;
    const { from, to, empty } = view.state.selection.main;
    if (empty) return;
    const selected = view.state.sliceDoc(from, to);
    try {
      await navigator.clipboard.writeText(selected);
      view.dispatch({
        changes: { from, to, insert: "" },
        selection: { anchor: from },
      });
    } catch {
      document.execCommand("cut");
    }
  }, [focusEditor]);

  const pasteSelection = useCallback(async () => {
    const view = focusEditor();
    if (!view) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      });
    } catch {
      document.execCommand("paste");
    }
  }, [focusEditor]);

  const selectAll = useCallback(() => {
    const view = focusEditor();
    if (!view) return;
    view.dispatch({
      selection: { anchor: 0, head: view.state.doc.length },
    });
  }, [focusEditor]);

  const editorContextMenuItems = useMemo<MenuItem[]>(
    () => [
      {
        label: t("editorMenu.undo"),
        onClick: () => {
          const view = focusEditor();
          if (!view) return;
          undo(view);
        },
      },
      {
        label: t("editorMenu.redo"),
        onClick: () => {
          const view = focusEditor();
          if (!view) return;
          redo(view);
        },
      },
      { separator: true },
      { label: t("editorMenu.cut"), onClick: () => void cutSelection() },
      { label: t("editorMenu.copy"), onClick: () => void copySelection() },
      { label: t("editorMenu.paste"), onClick: () => void pasteSelection() },
      { separator: true },
      { label: t("editorMenu.selectAll"), onClick: selectAll },
    ],
    [copySelection, cutSelection, focusEditor, pasteSelection, selectAll, t],
  );

  useEffect(() => {
    if (!editorRef.current) return;

    const indentText = tabIndentText;
    const tabSize = 4;

    // 自定义主题
    const theme = EditorView.theme(
      {
        "&": {
          height: "100%",
          fontSize: `${fontSize}px`,
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-primary)",
        },
        ".cm-content": {
          fontFamily: `'${font}', 'Monaco', monospace`,
          padding: "16px 20px",
          caretColor: "var(--accent)",
          lineHeight: "var(--editor-line-height, 1.6)",
        },
        ".cm-cursor": {
          borderLeftColor: "var(--accent)",
        },
        ".cm-activeLine": {
          backgroundColor: "rgba(255, 255, 255, 0.03)",
        },

        ".cm-selectionBackground": {
          backgroundColor: "rgba(233, 69, 96, 0.3) !important",
        },
        "&.cm-focused .cm-selectionBackground": {
          backgroundColor: "rgba(233, 69, 96, 0.3) !important",
        },
        ".cm-scroller": {
          overflow: "auto",
        },
        // 链接样式
        ".cm-link-url": {
          textDecoration: "underline",
          textDecorationColor: "var(--accent)",
          cursor: "pointer",
        },
        ".cm-task-checkbox": {
          display: "inline-flex",
          alignItems: "center",
          verticalAlign: "text-bottom",
        },
        ".cm-task-checkbox input": {
          width: "14px",
          height: "14px",
          margin: "0",
          accentColor: "var(--accent)",
          cursor: "pointer",
        },
        ".cm-table-row": {
          backgroundColor: "rgba(255, 255, 255, 0.012)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
        },
        ".cm-table-sep": {
          backgroundColor: "rgba(255, 255, 255, 0.016)",
          borderBottom: "1px solid var(--border)",
        },
        ".cm-table-pipe": {
          color: "var(--text-secondary)",
          opacity: "0.8",
        },
        ".cm-panel.cm-search": {
          padding: "6px 10px 8px",
          backgroundColor: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
        },
        ".cm-panel.cm-search input": {
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          borderRadius: "6px",
          padding: "4px 8px",
          outline: "none",
        },
        ".cm-panel.cm-search button": {
          backgroundColor: "var(--bg-tertiary)",
          color: "var(--text-secondary)",
          border: "1px solid var(--border)",
          borderRadius: "6px",
          padding: "4px 8px",
          cursor: "pointer",
        },
        ".cm-panel.cm-search button:hover": {
          backgroundColor: "var(--bg-hover)",
          color: "var(--text-primary)",
        },
        ".cm-panel.cm-search label": {
          color: "var(--text-secondary)",
        },
        ".cm-panel.cm-search [name=close]": {
          color: "var(--text-muted)",
        },
        ".cm-searchMatch": {
          backgroundColor: "rgba(59, 130, 246, 0.18)",
          borderRadius: "2px",
        },
        ".cm-searchMatch-selected": {
          backgroundColor: "rgba(59, 130, 246, 0.35)",
        },
        ".cm-flash-highlight": {
          backgroundColor: "rgba(59, 130, 246, 0.35)",
          borderRadius: "2px",
        },
      },
      { dark: true },
    );

    const isFenceLine = (text: string) => text.trimStart().startsWith("```");

    const buildInsideCodeBlockMap = (doc: EditorState["doc"]) => {
      const inside = new Array<boolean>(doc.lines + 1).fill(false);
      let inFence = false;
      for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
        const lineText = doc.line(lineNo).text;
        const fence = isFenceLine(lineText);
        if (fence) {
          inFence = !inFence;
          continue;
        }
        inside[lineNo] = inFence;
      }
      return inside;
    };

    const getSelectedLineRange = (
      doc: EditorState["doc"],
      from: number,
      to: number,
    ) => {
      const start = doc.lineAt(from);
      const end = doc.lineAt(to);
      let endLineNo = end.number;
      if (to === end.from && end.number > start.number) {
        endLineNo -= 1;
      }
      return { startLineNo: start.number, endLineNo };
    };

    const getLineType = (lineText: string) => {
      const ws = lineText.match(/^[\t ]*/)?.[0] ?? "";
      const rest = lineText.slice(ws.length);
      if (rest.startsWith(">")) return "quote" as const;
      if (/^(\d+)\.\s+/.test(rest)) return "olist" as const;
      if (/^[-*+]\s+\[[ xX]\]\s+/.test(rest)) return "task" as const;
      if (/^[-*+]\s+/.test(rest)) return "ulist" as const;
      return "text" as const;
    };

    const getOutdentChange = (lineText: string, lineFrom: number) => {
      if (lineText.startsWith("\t")) {
        return { from: lineFrom, to: lineFrom + 1, insert: "" };
      }
      const leadingSpaces = lineText.match(/^ +/)?.[0].length ?? 0;
      if (leadingSpaces === 0) return null;
      const removeCount =
        indentText === "\t"
          ? Math.min(leadingSpaces, tabSize)
          : Math.min(leadingSpaces, indentText.length);
      if (removeCount <= 0) return null;
      return { from: lineFrom, to: lineFrom + removeCount, insert: "" };
    };

    const getLeadingWhitespace = (lineText: string) =>
      lineText.match(/^[\t ]*/)?.[0] ?? "";

    const getIndentColumns = (ws: string) => {
      let columns = 0;
      for (const ch of ws) {
        if (ch === "\t") columns += tabSize;
        else if (ch === " ") columns += 1;
      }
      return columns;
    };

    const getLineIndentDeltaColumns = (
      lineText: string,
      lineNo: number,
      direction: "indent" | "outdent",
      affectedLines: Set<number>,
    ) => {
      if (!affectedLines.has(lineNo)) return 0;

      const lineType = getLineType(lineText);
      if (lineType === "quote") return 0;

      if (direction === "indent") {
        return indentText === "\t" ? tabSize : Math.max(1, indentText.length);
      }

      if (lineText.startsWith("\t")) return -tabSize;

      const leadingSpaces = lineText.match(/^ +/)?.[0].length ?? 0;
      if (leadingSpaces === 0) return 0;
      const removeCount =
        indentText === "\t"
          ? Math.min(leadingSpaces, tabSize)
          : Math.min(leadingSpaces, indentText.length);
      return -removeCount;
    };

    const getOrderedListRenumberChanges = (doc: EditorState["doc"]) => {
      const changes: Array<{ from: number; to: number; insert: string }> = [];
      const orderedStack: Array<{ indentColumns: number; nextNumber: number }> =
        [];
      let inFence = false;

      const unwindForNonOrderedLine = (indentCols: number) => {
        while (
          orderedStack.length > 0 &&
          indentCols <= orderedStack[orderedStack.length - 1].indentColumns
        ) {
          orderedStack.pop();
        }
      };

      for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
        const line = doc.line(lineNo);
        const lineText = line.text;
        const indentCols = getIndentColumns(getLeadingWhitespace(lineText));

        const fence = isFenceLine(lineText);
        if (fence) {
          unwindForNonOrderedLine(indentCols);
          inFence = !inFence;
          continue;
        }
        if (inFence) continue;

        const match = lineText.match(/^([\t ]*)(\d+)\.\s+/);
        if (!match) {
          unwindForNonOrderedLine(indentCols);
          continue;
        }

        while (
          orderedStack.length > 0 &&
          indentCols < orderedStack[orderedStack.length - 1].indentColumns
        ) {
          orderedStack.pop();
        }
        if (
          orderedStack.length === 0 ||
          indentCols > orderedStack[orderedStack.length - 1].indentColumns
        ) {
          orderedStack.push({ indentColumns: indentCols, nextNumber: 1 });
        }

        const desiredNumber = orderedStack[orderedStack.length - 1].nextNumber;
        orderedStack[orderedStack.length - 1].nextNumber += 1;

        const currentNumber = Number(match[2]);
        if (currentNumber === desiredNumber) continue;

        const numberFrom = line.from + match[1].length;
        const numberTo = numberFrom + match[2].length;
        changes.push({
          from: numberFrom,
          to: numberTo,
          insert: String(desiredNumber),
        });
      }

      return changes;
    };

    const handleCodeFenceEnter = (view: EditorView) => {
      if (!enableQuickSymbolInput) return false;

      const { state } = view;
      const range = state.selection.main;
      if (!range.empty) return false;

      const line = state.doc.lineAt(range.from);
      if (range.from !== line.to) return false;

      const trimmed = line.text.trim();
      if (!trimmed.startsWith("```")) return false;
      if (!/^```[^`]*$/.test(trimmed)) return false;

      const ws = getLeadingWhitespace(line.text);
      const insert = "\n" + ws + "\n" + ws + "```";
      const cursorPos = range.from + 1 + ws.length;

      view.dispatch({
        changes: { from: range.from, insert },
        selection: { anchor: cursorPos },
        userEvent: "input",
      });

      return true;
    };

    const normalizeQuickSymbolMarker = (marker: string): string => {
      if (/^＃+$/.test(marker)) {
        return "#".repeat(marker.length);
      }
      if (marker === "－" || marker === "—" || marker === "–" || marker === "*")
        return "-";
      if (marker === "＞") return ">";
      if (marker === "1。") return "1.";
      return marker;
    };

    const handleQuickSymbolSpace = (view: EditorView) => {
      if (!enableQuickSymbolInput) return false;
      if (view.composing) return false;
      if (isImeComposingRef.current) return false;
      if (Date.now() - lastCompositionEndAtRef.current < 120) return false;

      const { state } = view;
      const range = state.selection.main;
      if (!range.empty) return false;

      const pos = range.from;
      const line = state.doc.lineAt(pos);
      const prefix = state.doc.sliceString(line.from, pos);

      const match = prefix.match(
        /^([\t ]*)(#{1,3}|＃{1,3}|>|＞|1\.|1。)$/,
      );
      if (!match) return false;

      const indent = match[1];
      const marker = normalizeQuickSymbolMarker(match[2]);

      const indentCols = getIndentColumns(indent);
      if ((marker.startsWith("#") || marker === ">") && indentCols > 3)
        return false;

      const insideFence = buildInsideCodeBlockMap(state.doc);
      if (insideFence[line.number]) return false;

      const replaceFrom = line.from + indent.length;
      const insert = `${marker} `;

      view.dispatch({
        changes: { from: replaceFrom, to: pos, insert },
        selection: { anchor: replaceFrom + insert.length },
        userEvent: "input",
      });

      return true;
    };

    const quickSymbolKeymap = keymap.of([
      { key: "Enter", run: handleCodeFenceEnter },
      { key: "Space", run: handleQuickSymbolSpace },
    ]);

    const imeCompositionGuard = EditorView.domEventHandlers({
      compositionstart: () => {
        isImeComposingRef.current = true;
        return false;
      },
      compositionend: () => {
        isImeComposingRef.current = false;
        lastCompositionEndAtRef.current = Date.now();
        return false;
      },
    });

    const markdownExtension = markdown({
      base: markdownLanguage,
      extensions: [GFM],
      ...(enableCodeBlockHighlight
        ? { codeLanguages: codeFenceLanguages }
        : {}),
    });

    const continueMarkupKeymap = keymap.of([
      { key: "Enter", run: insertNewlineContinueMarkup },
    ]);

    const handleTabIndent = (direction: "indent" | "outdent") => {
      const view = viewRef.current;
      if (!view) return false;

      const { state } = view;
      const { doc } = state;
      const insideCodeBlock = buildInsideCodeBlockMap(doc);

      const affectedLines = new Set<number>();
      const cursorInsertions: number[] = [];

      for (const range of state.selection.ranges) {
        if (range.from !== range.to) {
          const lineRange = getSelectedLineRange(doc, range.from, range.to);
          for (
            let lineNo = lineRange.startLineNo;
            lineNo <= lineRange.endLineNo;
            lineNo++
          ) {
            affectedLines.add(lineNo);
          }
          continue;
        }

        const pos = range.from;
        const line = doc.lineAt(pos);
        const lineNo = line.number;

        if (direction === "outdent") {
          affectedLines.add(lineNo);
          continue;
        }

        // indent
        const lineText = line.text;
        const lineType = getLineType(lineText);

        // 代码块：光标处插入
        if (insideCodeBlock[lineNo]) {
          cursorInsertions.push(pos);
          continue;
        }

        // 列表/引用：整行缩进
        if (
          lineType === "quote" ||
          lineType === "olist" ||
          lineType === "ulist" ||
          lineType === "task"
        ) {
          affectedLines.add(lineNo);
          continue;
        }

        // 普通文本：行首缩进整行，行中插入
        if (pos === line.from) {
          affectedLines.add(lineNo);
        } else {
          cursorInsertions.push(pos);
        }
      }

      const changes: Array<{ from: number; to?: number; insert: string }> = [];

      for (const lineNo of affectedLines) {
        const line = doc.line(lineNo);
        const lineText = line.text;
        const ws = getLeadingWhitespace(lineText);
        const wsPos = line.from + ws.length;

        // fenced code block lines are treated like normal text for line-wise indent/outdent
        const lineType = getLineType(lineText);

        if (direction === "indent") {
          if (lineType === "quote") {
            changes.push({ from: wsPos, insert: ">" });
          } else {
            changes.push({ from: line.from, insert: indentText });
          }
          continue;
        }

        // outdent
        if (lineType === "quote") {
          const afterWs = lineText.slice(ws.length);
          if (!afterWs.startsWith(">")) continue;

          const quoteCount = afterWs.match(/^>+/)?.[0].length ?? 1;
          const removeLength = quoteCount <= 1 && afterWs[1] === " " ? 2 : 1;
          changes.push({ from: wsPos, to: wsPos + removeLength, insert: "" });
          continue;
        }

        const outdent = getOutdentChange(lineText, line.from);
        if (outdent) {
          changes.push(outdent);
        }
      }

      for (const pos of cursorInsertions) {
        const lineNo = doc.lineAt(pos).number;
        if (affectedLines.has(lineNo)) continue;

        // 如果光标所在行也在 fenced code block 中，直接插入
        changes.push({ from: pos, insert: indentText });
      }

      const shouldRenumberOrderedLists = Array.from(affectedLines).some(
        (lineNo) =>
          !insideCodeBlock[lineNo] &&
          getLineType(doc.line(lineNo).text) === "olist",
      );
      if (shouldRenumberOrderedLists) {
        const orderedStack: Array<{
          indentColumns: number;
          nextNumber: number;
        }> = [];
        let inFence = false;

        const unwindForNonOrderedLine = (indentCols: number) => {
          while (
            orderedStack.length > 0 &&
            indentCols <= orderedStack[orderedStack.length - 1].indentColumns
          ) {
            orderedStack.pop();
          }
        };

        for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
          const line = doc.line(lineNo);
          const lineText = line.text;
          const ws = getLeadingWhitespace(lineText);
          const indentCols = Math.max(
            0,
            getIndentColumns(ws) +
              getLineIndentDeltaColumns(
                lineText,
                lineNo,
                direction,
                affectedLines,
              ),
          );

          const fence = isFenceLine(lineText);
          if (fence) {
            unwindForNonOrderedLine(indentCols);
            inFence = !inFence;
            continue;
          }
          if (inFence) continue;

          const match = lineText.match(/^([\t ]*)(\d+)\.\s+/);
          if (!match) {
            unwindForNonOrderedLine(indentCols);
            continue;
          }

          while (
            orderedStack.length > 0 &&
            indentCols < orderedStack[orderedStack.length - 1].indentColumns
          ) {
            orderedStack.pop();
          }
          if (
            orderedStack.length === 0 ||
            indentCols > orderedStack[orderedStack.length - 1].indentColumns
          ) {
            orderedStack.push({ indentColumns: indentCols, nextNumber: 1 });
          }

          const desiredNumber =
            orderedStack[orderedStack.length - 1].nextNumber;
          orderedStack[orderedStack.length - 1].nextNumber += 1;

          const currentNumber = Number(match[2]);
          if (currentNumber === desiredNumber) continue;

          const numberFrom = line.from + match[1].length;
          const numberTo = numberFrom + match[2].length;
          changes.push({
            from: numberFrom,
            to: numberTo,
            insert: String(desiredNumber),
          });
        }
      }

      if (changes.length === 0) return true;

      changes.sort((a, b) => {
        if (a.from !== b.from) return a.from - b.from;
        const aTo = a.to ?? a.from;
        const bTo = b.to ?? b.from;
        return aTo - bTo;
      });
      view.dispatch({ changes });
      return true;
    };

    // 计算功能：Ctrl+Enter 执行表达式计算
    const calculateKeymap = keymap.of([
      {
        key: "Ctrl-Enter",
        run: (view) => {
          const state = view.state;
          const pos = state.selection.main.head;
          const line = state.doc.lineAt(pos);
          const lineText = line.text;

          // 查找最后一个 = 号
          const lastEqualIndex = lineText.lastIndexOf("=");
          if (lastEqualIndex === -1) return false;

          // 获取等号前的表达式
          const expression = lineText.substring(0, lastEqualIndex).trim();
          if (!expression) return false;

          try {
            // 使用 mathjs 计算
            const result = evaluate(expression);
            const resultStr = result.toString();

            // 检查等号后是否有空格，保留空格
            const afterEqual = lineText.substring(lastEqualIndex + 1);
            const leadingSpaces = afterEqual.match(/^(\s*)/)?.[1] || "";

            // 计算插入位置（等号后 + 空格后）
            const insertPos =
              line.from + lastEqualIndex + 1 + leadingSpaces.length;

            // 计算结果的最终位置
            const newCursorPos = insertPos + resultStr.length;

            // 替换等号后的内容（保留空格）
            view.dispatch({
              changes: {
                from: insertPos,
                to: line.to,
                insert: resultStr,
              },
              // 将光标移到结果末尾
              selection: { anchor: newCursorPos },
            });
            return true;
          } catch {
            // 计算失败，不做任何操作
            return false;
          }
        },
      },
    ]);

    const tabIndentKeymap = keymap.of([
      { key: "Tab", run: () => handleTabIndent("indent") },
      { key: "Shift-Tab", run: () => handleTabIndent("outdent") },
    ]);

    const startState = EditorState.create({
      doc: content,
      extensions: [
        // 计算功能键盘映射放最前面，确保优先级
        calculateKeymap,
        tabIndentKeymap,
        ...(enableQuickSymbolInput ? [quickSymbolKeymap] : []),
        continueMarkupKeymap,
        imeCompositionGuard,
        EditorState.tabSize.of(tabSize),
        indentUnit.of(indentText),
        markdownExtension,
        syntaxHighlighting(defaultHighlightStyle),

        highlightActiveLine(),
        history(),
        highlightSelectionMatches(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        flashHighlightField,
        theme,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || isExternalUpdate.current) return;

          const hasInsertedNewline = (tx: Transaction) => {
            let found = false;
            tx.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
              if (found) return;
              if (inserted.length > 0 && inserted.toString().includes("\n"))
                found = true;
            });
            return found;
          };

          const hasRemovedNewline = (tx: Transaction) => {
            let found = false;
            const oldDoc = tx.startState.doc;
            tx.changes.iterChanges((fromA, toA) => {
              if (found) return;
              if (fromA === toA) return;
              if (oldDoc.sliceString(fromA, toA).includes("\n")) found = true;
            });
            return found;
          };

          if (!isAutoRenumbering.current) {
            const shouldTriggerRenumber = update.transactions.some((tx) => {
              const isRelevantInput =
                tx.isUserEvent("input") &&
                !tx.isUserEvent("input.paste") &&
                !tx.isUserEvent("input.drop");
              const isRelevantDelete = tx.isUserEvent("delete");
              return (
                (isRelevantInput && hasInsertedNewline(tx)) ||
                (isRelevantDelete && hasRemovedNewline(tx))
              );
            });

            if (shouldTriggerRenumber) {
              const cursorLineText = update.state.doc.lineAt(
                update.state.selection.main.head,
              ).text;
              if (/^[\t ]*\d+\.\s+/.test(cursorLineText)) {
                const renumberChanges = getOrderedListRenumberChanges(
                  update.state.doc,
                );
                if (renumberChanges.length > 0) {
                  renumberChanges.sort((a, b) => {
                    if (a.from !== b.from) return a.from - b.from;
                    return a.to - b.to;
                  });

                  isAutoRenumbering.current = true;
                  update.view.dispatch({
                    changes: renumberChanges,
                    annotations: Transaction.addToHistory.of(false),
                  });
                  isAutoRenumbering.current = false;
                  return;
                }
              }
            }
          }

          onChange(update.state.doc.toString());
          onActivity?.("typing");
        }),
        EditorView.lineWrapping,
        // 链接识别和 Ctrl+Click 打开
        linkPlugin,
        linkClickHandler,
        // 图片拖放/粘贴和预览
        imageHandler,
        imagePreviewPlugin,
        tableBorderPlugin,
        taskListPlugin,
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: editorRef.current,
    });

    viewRef.current = view;

    if (autoFocus) {
      view.focus();
    }

    return () => {
      view.destroy();
    };
  }, []);

  // 外部内容更新时同步到编辑器
  useEffect(() => {
    if (viewRef.current && content !== viewRef.current.state.doc.toString()) {
      isExternalUpdate.current = true;
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: content,
        },
      });
      isExternalUpdate.current = false;
    }
  }, [content]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current !== null) {
        window.clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!jumpTo) return;

    const view = viewRef.current;
    if (!view) return;

    const docLen = view.state.doc.length;
    const from = Math.max(0, Math.min(jumpTo.from, docLen));
    const to = Math.max(from, Math.min(jumpTo.to, docLen));

    flashTokenRef.current = jumpTo.token;
    if (flashTimeoutRef.current !== null) {
      window.clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = null;
    }

    view.dispatch({
      selection: { anchor: from },
      effects: [
        EditorView.scrollIntoView(from, { y: "center" }),
        setFlashHighlightEffect.of({ from, to }),
      ],
    });

    view.focus();

    flashTimeoutRef.current = window.setTimeout(() => {
      if (flashTokenRef.current !== jumpTo.token) return;
      const v = viewRef.current;
      if (!v) return;
      v.dispatch({ effects: clearFlashHighlightEffect.of(null) });
    }, 1000);

    onJumpApplied?.(jumpTo.token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo?.token]);

  return (
    <>
      <div
        ref={editorRef}
        className="editor-container"
        onContextMenu={handleEditorContextMenu}
      />
      {editorContextMenu.visible && (
        <ContextMenu
          x={editorContextMenu.x}
          y={editorContextMenu.y}
          items={editorContextMenuItems}
          onClose={closeEditorContextMenu}
        />
      )}
    </>
  );
}
