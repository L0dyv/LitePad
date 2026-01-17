import { useEffect, useRef } from 'react'
import { EditorState, RangeSetBuilder } from '@codemirror/state'
import { EditorView, keymap, highlightActiveLine, Decoration, ViewPlugin, MatchDecorator, DecorationSet, WidgetType, ViewUpdate } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { evaluate } from 'mathjs'

// URL 正则表达式
const urlRegex = /https?:\/\/[^\s<>"'()\[\]]+/g

// 链接装饰器样式
const linkMark = Decoration.mark({ class: 'cm-link-url' })

// 链接匹配装饰器
const linkDecorator = new MatchDecorator({
    regexp: urlRegex,
    decoration: linkMark
})

// 链接高亮插件
const linkPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet
    constructor(view: EditorView) {
        this.decorations = linkDecorator.createDeco(view)
    }
    update(update: { docChanged: boolean; viewportChanged: boolean; view: EditorView }) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = linkDecorator.createDeco(update.view)
        }
    }
}, {
    decorations: v => v.decorations
})

// Ctrl+Click 打开链接的事件处理
const linkClickHandler = EditorView.domEventHandlers({
    click: (event: MouseEvent, view: EditorView) => {
        if (!event.ctrlKey) return false

        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos === null) return false

        const line = view.state.doc.lineAt(pos)
        const lineText = line.text

        // 查找点击位置所在的 URL
        let match: RegExpExecArray | null
        const regex = new RegExp(urlRegex.source, 'g')
        while ((match = regex.exec(lineText)) !== null) {
            const urlStart = line.from + match.index
            const urlEnd = urlStart + match[0].length
            if (pos >= urlStart && pos <= urlEnd) {
                // 在默认浏览器中打开链接
                window.electronAPI?.openExternalUrl(match[0])
                event.preventDefault()
                return true
            }
        }
        return false
    }
})

// 图片正则表达式：匹配 ![alt](litepad://...) 或 ![alt](asset://...)
const imageRegex = /!\[([^\]]*)\]\(((?:litepad|asset):\/\/[^)]+)\)/g

// 图片预览 Widget
class ImageWidget extends WidgetType {
    constructor(readonly src: string, readonly alt: string) {
        super()
    }

    toDOM() {
        const container = document.createElement('div')
        container.className = 'cm-image-preview'
        const img = document.createElement('img')
        img.src = this.src
        img.alt = this.alt
        img.style.maxWidth = '300px'
        img.style.maxHeight = '200px'
        img.style.borderRadius = '4px'
        img.style.marginTop = '4px'
        img.style.marginBottom = '4px'
        img.onerror = () => {
            container.style.display = 'none'
        }
        container.appendChild(img)
        return container
    }

    eq(other: ImageWidget) {
        return this.src === other.src
    }
}

// 图片预览插件
const imagePreviewPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet

    constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view)
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view)
        }
    }

    buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>()
        const doc = view.state.doc

        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i)
            const regex = new RegExp(imageRegex.source, 'g')
            let match: RegExpExecArray | null

            while ((match = regex.exec(line.text)) !== null) {
                const alt = match[1]
                const src = match[2]
                const widget = Decoration.widget({
                    widget: new ImageWidget(src, alt),
                    side: 1
                })
                builder.add(line.to, line.to, widget)
            }
        }

        return builder.finish()
    }
}, {
    decorations: v => v.decorations
})

// 处理图片文件
const processImageFile = async (file: File, view: EditorView) => {
    if (!file.type.startsWith('image/')) return

    try {
        const buffer = await file.arrayBuffer()
        const ext = '.' + (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
        const url = await window.electronAPI?.saveImage(buffer, ext)

        if (url) {
            const pos = view.state.selection.main.head
            const imageMarkdown = `![${file.name}](${url})`
            view.dispatch({
                changes: { from: pos, insert: imageMarkdown + '\n' },
                selection: { anchor: pos + imageMarkdown.length + 1 }
            })
        }
    } catch (error) {
        console.error('图片保存失败:', error)
    }
}

// 图片拖放和粘贴事件处理
const imageHandler = EditorView.domEventHandlers({
    drop: (event: DragEvent, view: EditorView) => {
        const files = event.dataTransfer?.files
        if (!files || files.length === 0) return false

        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
        if (imageFiles.length === 0) return false

        event.preventDefault()
        imageFiles.forEach(file => processImageFile(file, view))
        return true
    },
    paste: (event: ClipboardEvent, view: EditorView) => {
        const items = event.clipboardData?.items
        if (!items) return false

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile()
                if (file) {
                    event.preventDefault()
                    processImageFile(file, view)
                    return true
                }
            }
        }
        return false
    }
})

interface EditorProps {
    content: string
    onChange: (content: string) => void
    onActivity?: (type: 'typing') => void
    font?: string
    autoFocus?: boolean
}

export function Editor({ content, onChange, onActivity, font = 'Consolas', autoFocus = false }: EditorProps) {
    const editorRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const isExternalUpdate = useRef(false)

    useEffect(() => {
        if (!editorRef.current) return

        // 自定义主题
        const theme = EditorView.theme({
            '&': {
                height: '100%',
                fontSize: '14px',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)'
            },
            '.cm-content': {
                fontFamily: `'${font}', 'Monaco', monospace`,
                padding: '16px 20px',
                caretColor: 'var(--accent)'
            },
            '.cm-cursor': {
                borderLeftColor: 'var(--accent)'
            },
            '.cm-activeLine': {
                backgroundColor: 'rgba(255, 255, 255, 0.03)'
            },

            '.cm-selectionBackground': {
                backgroundColor: 'rgba(233, 69, 96, 0.3) !important'
            },
            '&.cm-focused .cm-selectionBackground': {
                backgroundColor: 'rgba(233, 69, 96, 0.3) !important'
            },
            '.cm-scroller': {
                overflow: 'auto'
            },
            // 链接样式
            '.cm-link-url': {
                textDecoration: 'underline',
                textDecorationColor: 'var(--accent)',
                cursor: 'pointer'
            }
        }, { dark: true })

        // 计算功能：Ctrl+Enter 执行表达式计算
        const calculateKeymap = keymap.of([{
            key: 'Ctrl-Enter',
            run: (view) => {
                const state = view.state
                const pos = state.selection.main.head
                const line = state.doc.lineAt(pos)
                const lineText = line.text

                // 查找最后一个 = 号
                const lastEqualIndex = lineText.lastIndexOf('=')
                if (lastEqualIndex === -1) return false

                // 获取等号前的表达式
                const expression = lineText.substring(0, lastEqualIndex).trim()
                if (!expression) return false

                try {
                    // 使用 mathjs 计算
                    const result = evaluate(expression)
                    const resultStr = result.toString()

                    // 检查等号后是否有空格，保留空格
                    const afterEqual = lineText.substring(lastEqualIndex + 1)
                    const leadingSpaces = afterEqual.match(/^(\s*)/)?.[1] || ''

                    // 计算插入位置（等号后 + 空格后）
                    const insertPos = line.from + lastEqualIndex + 1 + leadingSpaces.length

                    // 计算结果的最终位置
                    const newCursorPos = insertPos + resultStr.length

                    // 替换等号后的内容（保留空格）
                    view.dispatch({
                        changes: {
                            from: insertPos,
                            to: line.to,
                            insert: resultStr
                        },
                        // 将光标移到结果末尾
                        selection: { anchor: newCursorPos }
                    })
                    return true
                } catch {
                    // 计算失败，不做任何操作
                    return false
                }
            }
        }])

        const startState = EditorState.create({
            doc: content,
            extensions: [
                // 计算功能键盘映射放最前面，确保优先级
                calculateKeymap,
                markdown(),
                syntaxHighlighting(defaultHighlightStyle),

                highlightActiveLine(),
                history(),
                highlightSelectionMatches(),
                keymap.of([
                    ...defaultKeymap,
                    ...historyKeymap,
                    ...searchKeymap
                ]),
                theme,
                EditorView.updateListener.of((update) => {
                    if (update.docChanged && !isExternalUpdate.current) {
                        onChange(update.state.doc.toString())
                        onActivity?.('typing')
                    }
                }),
                EditorView.lineWrapping,
                // 链接识别和 Ctrl+Click 打开
                linkPlugin,
                linkClickHandler,
                // 图片拖放/粘贴和预览
                imageHandler,
                imagePreviewPlugin
            ]
        })

        const view = new EditorView({
            state: startState,
            parent: editorRef.current
        })

        viewRef.current = view

        if (autoFocus) {
            view.focus()
        }

        return () => {
            view.destroy()
        }
    }, [])

    // 外部内容更新时同步到编辑器
    useEffect(() => {
        if (viewRef.current && content !== viewRef.current.state.doc.toString()) {
            isExternalUpdate.current = true
            viewRef.current.dispatch({
                changes: {
                    from: 0,
                    to: viewRef.current.state.doc.length,
                    insert: content
                }
            })
            isExternalUpdate.current = false
        }
    }, [content])

    return <div ref={editorRef} className="editor-container" />
}
