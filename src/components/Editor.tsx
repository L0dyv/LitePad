import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import { Extension, InputRule } from "@tiptap/core";
import { EditorContent, useEditor, type Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import CodeBlock from "@tiptap/extension-code-block";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { Markdown } from "@tiptap/markdown";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { evaluate } from "mathjs";
import { common, createLowlight } from "lowlight";
import { putAttachment, type Attachment } from "../db";
import { ContextMenu, type MenuItem } from "./ContextMenu";

const urlRegex = /https?:\/\/[^\s<>"'()\[\]]+/;
const lowlight = createLowlight(common);
const todayMacroRegex = /(?:^|\s)(@today)$/i;
const litepadImageUrlRegex = /^litepad:\/\/images\/([a-f0-9]{64})(\.[a-z0-9]+)$/i;
const litepadImageMarkdownWithTitleRegex =
  /!\[([^\]]*)\]\((litepad:\/\/images\/[a-f0-9]{64}\.[a-z0-9]+)\s+(?:"[^"]*"|'[^']*')\)/gi;
const litepadImageHtmlTagRegex =
  /<img\b[^>]*\bsrc=(["'])(litepad:\/\/images\/[a-f0-9]{64}\.[a-z0-9]+)\1[^>]*>/gi;
const imageMimeToExt: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
  "image/tiff": ".tif",
};

interface JumpTarget {
  query: string;
  occurrence: number;
  matchLength: number;
  snippet?: string;
  line?: number;
  column?: number;
  token: number;
}

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
  jumpTo?: JumpTarget | null;
  onJumpApplied?: (token: number) => void;
}

type FlashRange = { from: number; to: number };

const jumpFlashPluginKey = new PluginKey<FlashRange | null>("litepad-jump-flash");

const JumpFlashExtension = Extension.create({
  name: "litepadJumpFlash",
  addProseMirrorPlugins() {
    return [
      new Plugin<FlashRange | null>({
        key: jumpFlashPluginKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(jumpFlashPluginKey) as
              | FlashRange
              | null
              | undefined;
            let next = meta !== undefined ? meta : value;

            if (next && tr.docChanged) {
              const mappedFrom = tr.mapping.map(next.from);
              const mappedTo = tr.mapping.map(next.to);
              next = mappedTo > mappedFrom ? { from: mappedFrom, to: mappedTo } : null;
            }

            return next;
          },
        },
        props: {
          decorations(state) {
            const range = jumpFlashPluginKey.getState(state);
            if (!range || range.to <= range.from) return null;
            return DecorationSet.create(state.doc, [
              Decoration.inline(range.from, range.to, {
                class: "pm-flash-highlight",
              }),
            ]);
          },
        },
      }),
    ];
  },
});

function normalizeMarkdown(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, "\n").replace(/\n+$/g, "");
  const imageContractNormalized = normalized.replace(
    litepadImageHtmlTagRegex,
    (fullTag, _quote, src) => {
      const altMatch = fullTag.match(/\balt=(["'])(.*?)\1/i);
      const alt = altMatch?.[2] ?? "";
      return `![${alt}](${src})`;
    },
  );
  return imageContractNormalized.replace(
    litepadImageMarkdownWithTitleRegex,
    (_full, alt, src) => `![${alt}](${src})`,
  );
}

function extensionFromFilename(filename: string): string | null {
  const match = filename.toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match?.[1] ?? null;
}

function extensionFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const lastSegment = parsed.pathname.split("/").pop() ?? "";
    return extensionFromFilename(lastSegment);
  } catch {
    return null;
  }
}

function resolveImageExtension(mimeType: string, filename?: string, sourceUrl?: string): string {
  const lowerMime = mimeType.toLowerCase();
  const fromMime = imageMimeToExt[lowerMime];
  if (fromMime) return fromMime;

  if (filename) {
    const fromFilename = extensionFromFilename(filename);
    if (fromFilename) return fromFilename;
  }

  if (sourceUrl) {
    const fromUrl = extensionFromUrl(sourceUrl);
    if (fromUrl) return fromUrl;
  }

  return ".png";
}

function inferFilenameFromUrl(url: string, fallbackName: string): string {
  try {
    const parsed = new URL(url);
    const lastSegment = parsed.pathname.split("/").pop() ?? "";
    const decoded = decodeURIComponent(lastSegment).trim();
    if (decoded) return decoded;
  } catch {
    // Ignore invalid URL parsing and fallback.
  }
  return fallbackName;
}

type PastedHtmlImage = {
  src: string;
  alt: string;
};

function extractHtmlImages(html: string): PastedHtmlImage[] {
  if (!html || !html.includes("<img")) return [];
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return Array.from(doc.querySelectorAll("img[src]"))
      .map((img) => ({
        src: (img.getAttribute("src") ?? "").trim(),
        alt: (img.getAttribute("alt") ?? "").trim(),
      }))
      .filter((img) => img.src.length > 0);
  } catch {
    return [];
  }
}

function parseDataUrlImage(src: string): { mimeType: string; bytes: Uint8Array } | null {
  const match = src.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;

  try {
    const decoded = atob(match[2]);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i += 1) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return {
      mimeType: match[1].toLowerCase(),
      bytes,
    };
  } catch {
    return null;
  }
}

function findDeleteBoundary(
  text: string,
  pos: number,
  direction: "backward" | "forward",
  wordSegmenter: Intl.Segmenter | null,
): number {
  if (direction === "backward") {
    if (pos <= 0) return 0;
    let cursor = pos;
    while (cursor > 0 && /\s/.test(text[cursor - 1])) cursor -= 1;
    if (cursor !== pos) return cursor;

    if (wordSegmenter) {
      const segments = Array.from(wordSegmenter.segment(text));
      let previousSegmentStart = 0;
      for (const segment of segments) {
        const start = segment.index;
        const end = start + segment.segment.length;
        if (end >= cursor) {
          if (start < cursor && segment.isWordLike) return start;
          return previousSegmentStart;
        }
        previousSegmentStart = start;
      }
    }

    cursor = pos;
    while (cursor > 0 && /[a-z0-9_]/i.test(text[cursor - 1])) cursor -= 1;
    if (cursor !== pos) return cursor;

    cursor = pos;
    while (cursor > 0 && !/\s/.test(text[cursor - 1])) cursor -= 1;
    return cursor;
  }

  if (pos >= text.length) return text.length;
  let cursor = pos;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  if (cursor !== pos) return cursor;

  if (wordSegmenter) {
    const segments = Array.from(wordSegmenter.segment(text));
    for (const segment of segments) {
      const start = segment.index;
      const end = start + segment.segment.length;

      if (start > cursor) return end;
      if (start <= cursor && end > cursor && segment.isWordLike) return end;
    }
  }

  cursor = pos;
  while (cursor < text.length && /[a-z0-9_]/i.test(text[cursor])) cursor += 1;
  if (cursor !== pos) return cursor;

  cursor = pos;
  while (cursor < text.length && !/\s/.test(text[cursor])) cursor += 1;
  return cursor;
}

function buildListIndentExtension(tabIndentText: string) {
  const outdentChars = tabIndentText === "\t" ? 1 : Math.max(1, tabIndentText.length);

  return Extension.create({
    name: "litepadListIndent",
    addKeyboardShortcuts() {
      return {
        Tab: () => {
          const editor = this.editor;
          if (
            editor.commands.sinkListItem("listItem") ||
            editor.commands.sinkListItem("taskItem")
          ) {
            return true;
          }
          editor.commands.insertContent(tabIndentText);
          return true;
        },
        "Shift-Tab": () => {
          const editor = this.editor;
          if (
            editor.commands.liftListItem("listItem") ||
            editor.commands.liftListItem("taskItem")
          ) {
            return true;
          }

          const { state, view } = editor;
          const { from, to, empty } = state.selection;
          if (!empty || from !== to) return true;

          const $from = state.selection.$from;
          const lineStart = $from.start();
          const beforeCursor = $from.parent.textBetween(0, $from.parentOffset, "", "");
          const leading = beforeCursor.match(/^[\t ]*/)?.[0] ?? "";
          if (leading.length === 0) return true;

          const removeLength = leading.endsWith("\t")
            ? 1
            : Math.min(outdentChars, leading.length);
          const deleteFrom = lineStart + leading.length - removeLength;
          view.dispatch(state.tr.delete(deleteFrom, deleteFrom + removeLength));
          return true;
        },
      };
    },
  });
}

function buildWordDeleteExtension() {
  const wordSegmenter =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? new Intl.Segmenter("zh-Hans", { granularity: "word" })
      : null;

  return Extension.create({
    name: "litepadWordDelete",
    addKeyboardShortcuts() {
      return {
        "Ctrl-Backspace": () => {
          const { state, view } = this.editor;
          const { from, to, empty, $from } = state.selection;
          if (!empty) {
            view.dispatch(state.tr.delete(from, to));
            return true;
          }

          const blockText = $from.parent.textBetween(0, $from.parent.content.size, "", "");
          const localPos = $from.parentOffset;
          const boundary = findDeleteBoundary(
            blockText,
            localPos,
            "backward",
            wordSegmenter,
          );
          if (boundary === localPos) return true;

          const absoluteFrom = $from.start() + boundary;
          const absoluteTo = $from.start() + localPos;
          view.dispatch(state.tr.delete(absoluteFrom, absoluteTo));
          return true;
        },
        "Ctrl-Delete": () => {
          const { state, view } = this.editor;
          const { from, to, empty, $from } = state.selection;
          if (!empty) {
            view.dispatch(state.tr.delete(from, to));
            return true;
          }

          const blockText = $from.parent.textBetween(0, $from.parent.content.size, "", "");
          const localPos = $from.parentOffset;
          const boundary = findDeleteBoundary(
            blockText,
            localPos,
            "forward",
            wordSegmenter,
          );
          if (boundary === localPos) return true;

          const absoluteFrom = $from.start() + localPos;
          const absoluteTo = $from.start() + boundary;
          view.dispatch(state.tr.delete(absoluteFrom, absoluteTo));
          return true;
        },
      };
    },
  });
}

const CalculateExtension = Extension.create({
  name: "litepadCalculate",
  addKeyboardShortcuts() {
    const runCalculate = () => {
      const { state, view } = this.editor;
      const { empty, $from } = state.selection;
      if (!empty) return false;

      const lineText = $from.parent.textBetween(0, $from.parent.content.size, "", "");
      const lastEqualIndex = lineText.lastIndexOf("=");
      if (lastEqualIndex === -1) return false;

      const expression = lineText.substring(0, lastEqualIndex).trim();
      if (!expression) return false;

      try {
        const result = evaluate(expression);
        const resultStr = result.toString();
        const afterEqual = lineText.substring(lastEqualIndex + 1);
        const leadingSpaces = afterEqual.match(/^(\s*)/)?.[1] ?? "";

        const lineStart = $from.start();
        const replaceFrom = lineStart + lastEqualIndex + 1 + leadingSpaces.length;
        const replaceTo = lineStart + lineText.length;
        const tr = state.tr.insertText(resultStr, replaceFrom, replaceTo);
        view.dispatch(tr);
        return true;
      } catch {
        return false;
      }
    };

    return {
      "Ctrl-Enter": runCalculate,
      "Mod-Enter": runCalculate,
    };
  },
});

function formatDateMacroValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const TodayMacroExtension = Extension.create({
  name: "litepadTodayMacro",
  addInputRules() {
    return [
      new InputRule({
        find: todayMacroRegex,
        handler: ({ state, range, match }) => {
          const token = match[1];
          if (!token) return null;

          const tokenOffset = match[0].lastIndexOf(token);
          const replaceFrom = range.from + Math.max(0, tokenOffset);
          const replaceTo = range.to;

          state.tr.insertText(formatDateMacroValue(), replaceFrom, replaceTo);
          return undefined;
        },
      }),
    ];
  },
});

type TextBlockRef = {
  text: string;
  startPos: number;
  startOffset: number;
  endOffset: number;
};

function collectTextBlocks(editor: TiptapEditor): TextBlockRef[] {
  const rawBlocks: Array<{ text: string; startPos: number }> = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    rawBlocks.push({
      text: node.textContent ?? "",
      startPos: pos + 1,
    });
    return false;
  });

  if (rawBlocks.length === 0) {
    return [{ text: "", startPos: 1, startOffset: 0, endOffset: 0 }];
  }

  let cursor = 0;
  return rawBlocks.map((block) => {
    const startOffset = cursor;
    const endOffset = startOffset + block.text.length;
    cursor = endOffset + 1;
    return {
      text: block.text,
      startPos: block.startPos,
      startOffset,
      endOffset,
    };
  });
}

function flattenBlockText(blocks: TextBlockRef[]): string {
  return blocks.map((block) => block.text).join("\n");
}

function findNthOccurrence(text: string, query: string, occurrence: number): number {
  if (occurrence <= 0 || query.length === 0) return -1;
  let startIndex = 0;
  let matchedIndex = -1;
  for (let i = 0; i < occurrence; i += 1) {
    matchedIndex = text.indexOf(query, startIndex);
    if (matchedIndex === -1) return -1;
    startIndex = matchedIndex + query.length;
  }
  return matchedIndex;
}

function textOffsetToPos(blocks: TextBlockRef[], offset: number): number {
  const safeOffset = Math.max(0, offset);
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (safeOffset < block.endOffset) {
      return block.startPos + (safeOffset - block.startOffset);
    }
    if (safeOffset === block.endOffset) {
      if (i < blocks.length - 1) return blocks[i + 1].startPos;
      return block.startPos + block.text.length;
    }
  }

  const last = blocks[blocks.length - 1];
  return last.startPos + last.text.length;
}

function resolveJumpRange(editor: TiptapEditor, jumpTo: JumpTarget): FlashRange | null {
  const query = jumpTo.query.trim();
  if (!query) return null;

  const blocks = collectTextBlocks(editor);
  const plainText = flattenBlockText(blocks);
  const plainLower = plainText.toLowerCase();
  const queryLower = query.toLowerCase();
  const matchLength = Math.max(1, jumpTo.matchLength || query.length);

  let fromOffset = findNthOccurrence(plainLower, queryLower, jumpTo.occurrence);
  if (fromOffset === -1 && jumpTo.snippet) {
    const snippet = jumpTo.snippet.replace(/\.\.\./g, "").trim().toLowerCase();
    if (snippet) {
      const snippetIndex = plainLower.indexOf(snippet);
      if (snippetIndex !== -1) {
        const queryInSnippet = snippet.indexOf(queryLower);
        if (queryInSnippet !== -1) {
          fromOffset = snippetIndex + queryInSnippet;
        }
      }
    }
  }
  if (fromOffset === -1) {
    fromOffset = plainLower.indexOf(queryLower);
  }
  if (fromOffset === -1) return null;

  const toOffset = fromOffset + matchLength;
  const from = textOffsetToPos(blocks, fromOffset);
  const to = textOffsetToPos(blocks, toOffset);
  if (to <= from) return null;
  return { from, to };
}

async function processImageFile(file: File, editor: TiptapEditor): Promise<void> {
  const mimeType = file.type || "image/png";
  if (!mimeType.startsWith("image/")) return;

  try {
    await persistAndInsertImage({
      editor,
      buffer: await file.arrayBuffer(),
      mimeType,
      filename: file.name || "image",
      sourceUrl: "",
      alt: file.name || "image",
    });
  } catch (error) {
    console.error("图片保存失败:", error);
  }
}

type PersistedImageInput = {
  editor: TiptapEditor;
  buffer: ArrayBuffer;
  mimeType: string;
  filename: string;
  sourceUrl: string;
  alt: string;
};

async function persistAndInsertImage(input: PersistedImageInput): Promise<boolean> {
  const ext = resolveImageExtension(input.mimeType, input.filename, input.sourceUrl);
  const result = await window.electronAPI?.saveImage(input.buffer, ext);
  if (!result) return false;

  const attachment: Attachment = {
    hash: result.hash,
    filename: input.filename,
    mimeType: input.mimeType,
    size: result.size,
    ext: result.ext,
    localPath: "",
    syncStatus: "pending",
    createdAt: Date.now(),
    syncedAt: null,
  };
  await putAttachment(attachment);

  input.editor
    .chain()
    .focus()
    .setImage({
      src: result.url,
      alt: input.alt || input.filename || "image",
    })
    .run();
  input.editor.commands.insertContent("\n");
  return true;
}

async function processHtmlImageSource(
  image: PastedHtmlImage,
  index: number,
  editor: TiptapEditor,
): Promise<void> {
  const alt = image.alt || `image-${index + 1}`;
  const src = image.src;

  if (litepadImageUrlRegex.test(src)) {
    editor.chain().focus().setImage({ src, alt }).run();
    editor.commands.insertContent("\n");
    return;
  }

  if (src.startsWith("data:image/")) {
    const parsed = parseDataUrlImage(src);
    if (!parsed) return;
    const ext = resolveImageExtension(parsed.mimeType, `pasted-image-${index + 1}`);
    const saved = await persistAndInsertImage({
      editor,
      buffer: parsed.bytes.buffer,
      mimeType: parsed.mimeType,
      filename: `pasted-image-${index + 1}${ext}`,
      sourceUrl: "",
      alt,
    });
    if (saved) return;
  }

  if (/^https?:\/\//i.test(src)) {
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const blobMime = blob.type || "image/png";
      if (!blobMime.startsWith("image/")) throw new Error("Non-image response");

      const filename = inferFilenameFromUrl(src, `pasted-image-${index + 1}`);
      const saved = await persistAndInsertImage({
        editor,
        buffer: await blob.arrayBuffer(),
        mimeType: blobMime,
        filename,
        sourceUrl: src,
        alt,
      });
      if (saved) return;
    } catch (error) {
      console.warn("外链图片下载失败，保留原始链接:", error);
    }
  }

  editor.chain().focus().setImage({ src, alt }).run();
  editor.commands.insertContent("\n");
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
  const [editorContextMenu, setEditorContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
  });
  const editorRef = useRef<TiptapEditor | null>(null);
  const isExternalUpdateRef = useRef(false);
  const isImeComposingRef = useRef(false);
  const flashTimeoutRef = useRef<number | null>(null);
  const flashTokenRef = useRef(0);
  const lastEmittedMarkdownRef = useRef(normalizeMarkdown(content));
  const onChangeRef = useRef(onChange);
  const onActivityRef = useRef(onActivity);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onActivityRef.current = onActivity;
  }, [onActivity]);

  const listIndentExtension = useMemo(
    () => buildListIndentExtension(tabIndentText),
    [tabIndentText],
  );
  const wordDeleteExtension = useMemo(() => buildWordDeleteExtension(), []);
  const codeBlockExtension = useMemo(
    () =>
      enableCodeBlockHighlight
        ? CodeBlockLowlight.configure({
            lowlight,
            defaultLanguage: null,
            HTMLAttributes: {
              class: "code-block-highlight hljs",
            },
          })
        : CodeBlock.configure({
            HTMLAttributes: {
              class: "code-block-plain",
            },
          }),
    [enableCodeBlockHighlight],
  );

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        codeBlock: false,
        link: false,
      }),
      codeBlockExtension,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
      Image,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown.configure({
        html: false,
      }),
      CalculateExtension,
      TodayMacroExtension,
      listIndentExtension,
      wordDeleteExtension,
      JumpFlashExtension,
    ],
    [codeBlockExtension, listIndentExtension, wordDeleteExtension],
  );

  const editor = useEditor({
    extensions,
    content,
    contentType: "markdown",
    autofocus: autoFocus,
    immediatelyRender: false,
    // Markdown quick-symbol behavior follows TipTap input rules as the baseline contract.
    enableInputRules: enableQuickSymbolInput,
    editorProps: {
      attributes: {
        class: "litepad-prosemirror",
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement | null;
        if (!target) return false;
        const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
        if (!anchor) return false;
        if (!(event.ctrlKey || event.metaKey)) return false;

        const href = anchor.getAttribute("href");
        if (!href || !urlRegex.test(href)) return false;
        window.electronAPI?.openExternalUrl(href);
        event.preventDefault();
        return true;
      },
      handleDOMEvents: {
        compositionstart: () => {
          isImeComposingRef.current = true;
          return false;
        },
        compositionend: () => {
          isImeComposingRef.current = false;
          queueMicrotask(() => {
            const current = editorRef.current;
            if (!current || isExternalUpdateRef.current) return;
            const markdown = normalizeMarkdown(current.getMarkdown());
            if (markdown === lastEmittedMarkdownRef.current) return;
            lastEmittedMarkdownRef.current = markdown;
            onChangeRef.current(markdown);
            onActivityRef.current?.("typing");
          });
          return false;
        },
        drop: (_view, event) => {
          const current = editorRef.current;
          if (!current) return false;

          const files = event.dataTransfer?.files;
          if (!files || files.length === 0) return false;
          const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
          if (imageFiles.length === 0) return false;

          event.preventDefault();
          imageFiles.forEach((file) => {
            void processImageFile(file, current);
          });
          return true;
        },
        paste: (_view, event) => {
          const current = editorRef.current;
          if (!current) return false;

          const items = event.clipboardData?.items;
          if (items) {
            for (const item of items) {
              if (!item.type.startsWith("image/")) continue;
              const file = item.getAsFile();
              if (!file) continue;
              event.preventDefault();
              void processImageFile(file, current);
              return true;
            }
          }

          const html = event.clipboardData?.getData("text/html") ?? "";
          const htmlImages = extractHtmlImages(html);
          if (htmlImages.length > 0) {
            event.preventDefault();
            htmlImages.forEach((image, index) => {
              void processHtmlImageSource(image, index, current);
            });
            return true;
          }

          return false;
        },
      },
    },
    onUpdate: ({ editor: current }) => {
      if (isExternalUpdateRef.current || isImeComposingRef.current) return;
      const markdown = normalizeMarkdown(current.getMarkdown());
      if (markdown === lastEmittedMarkdownRef.current) return;
      lastEmittedMarkdownRef.current = markdown;
      onChangeRef.current(markdown);
      onActivityRef.current?.("typing");
    },
  });

  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const normalizedIncoming = normalizeMarkdown(content);
    if (normalizedIncoming === lastEmittedMarkdownRef.current) return;
    if (editor.isFocused || isImeComposingRef.current) return;

    isExternalUpdateRef.current = true;
    editor.commands.setContent(content, { contentType: "markdown" });
    isExternalUpdateRef.current = false;
    lastEmittedMarkdownRef.current = normalizedIncoming;
  }, [content, editor]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current !== null) {
        window.clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!editor || !jumpTo) return;

    const range = resolveJumpRange(editor, jumpTo);
    flashTokenRef.current = jumpTo.token;

    if (flashTimeoutRef.current !== null) {
      window.clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = null;
    }

    if (!range) {
      onJumpApplied?.(jumpTo.token);
      return;
    }

    editor.chain().focus().setTextSelection(range).run();
    editor.view.dispatch(editor.state.tr.setMeta(jumpFlashPluginKey, range));

    flashTimeoutRef.current = window.setTimeout(() => {
      if (flashTokenRef.current !== jumpTo.token) return;
      const current = editorRef.current;
      if (!current) return;
      current.view.dispatch(current.state.tr.setMeta(jumpFlashPluginKey, null));
    }, 1000);

    onJumpApplied?.(jumpTo.token);
  }, [editor, jumpTo?.token, onJumpApplied]);

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
    const current = editorRef.current;
    if (!current) return null;
    current.commands.focus();
    return current;
  }, []);

  const copySelection = useCallback(async () => {
    const current = focusEditor();
    if (!current) return;
    const { from, to, empty } = current.state.selection;
    if (empty) return;
    const selected = current.state.doc.textBetween(from, to, "\n", "\n");
    try {
      await navigator.clipboard.writeText(selected);
    } catch {
      document.execCommand("copy");
    }
  }, [focusEditor]);

  const cutSelection = useCallback(async () => {
    const current = focusEditor();
    if (!current) return;
    const { from, to, empty } = current.state.selection;
    if (empty) return;
    const selected = current.state.doc.textBetween(from, to, "\n", "\n");
    try {
      await navigator.clipboard.writeText(selected);
      current.view.dispatch(current.state.tr.delete(from, to));
    } catch {
      document.execCommand("cut");
    }
  }, [focusEditor]);

  const pasteSelection = useCallback(async () => {
    const current = focusEditor();
    if (!current) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      current.commands.insertContent(text);
    } catch {
      document.execCommand("paste");
    }
  }, [focusEditor]);

  const selectAll = useCallback(() => {
    const current = focusEditor();
    if (!current) return;
    current
      .chain()
      .focus()
      .setTextSelection({
        from: 1,
        to: Math.max(1, current.state.doc.content.size),
      })
      .run();
  }, [focusEditor]);

  const editorContextMenuItems = useMemo<MenuItem[]>(
    () => [
      {
        label: t("editorMenu.undo"),
        onClick: () => {
          focusEditor()?.commands.undo();
        },
      },
      {
        label: t("editorMenu.redo"),
        onClick: () => {
          focusEditor()?.commands.redo();
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

  const editorStyle = useMemo(
    () =>
      ({
        "--editor-font": `'${font}', 'Monaco', monospace`,
        "--editor-font-size": `${fontSize}px`,
      }) as CSSProperties,
    [font, fontSize],
  );

  return (
    <>
      <div
        className="editor-container tiptap-editor-shell"
        style={editorStyle}
        onContextMenu={handleEditorContextMenu}
      >
        <EditorContent editor={editor} className="tiptap-editor-content" />
      </div>
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
