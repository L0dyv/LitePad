import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, highlightActiveLine, lineNumbers, highlightActiveLineGutter } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { evaluate } from 'mathjs'

interface EditorProps {
    content: string
    onChange: (content: string) => void
    autoFocus?: boolean
}

export function Editor({ content, onChange, autoFocus = false }: EditorProps) {
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
                fontFamily: "'Consolas', 'Monaco', monospace",
                padding: '16px 20px',
                caretColor: 'var(--accent)'
            },
            '.cm-cursor': {
                borderLeftColor: 'var(--accent)'
            },
            '.cm-activeLine': {
                backgroundColor: 'rgba(255, 255, 255, 0.03)'
            },
            '.cm-activeLineGutter': {
                backgroundColor: 'rgba(255, 255, 255, 0.03)'
            },
            '.cm-gutters': {
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                border: 'none'
            },
            '.cm-lineNumbers .cm-gutterElement': {
                padding: '0 8px'
            },
            '.cm-selectionBackground': {
                backgroundColor: 'rgba(233, 69, 96, 0.3) !important'
            },
            '&.cm-focused .cm-selectionBackground': {
                backgroundColor: 'rgba(233, 69, 96, 0.3) !important'
            },
            '.cm-scroller': {
                overflow: 'auto'
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

                    // 在等号后插入结果
                    const insertPos = line.from + lastEqualIndex + 1

                    // 替换等号后的内容
                    view.dispatch({
                        changes: {
                            from: insertPos,
                            to: line.to,
                            insert: result.toString()
                        }
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
                lineNumbers(),
                highlightActiveLineGutter(),
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
                    }
                }),
                EditorView.lineWrapping
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
