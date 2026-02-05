import { useTranslation } from 'react-i18next'
import { FileText, HelpCircle, Type } from 'lucide-react'
import './StatsOverlay.css'

interface StatsOverlayProps {
    lineCount: number
    charCount: number
    onOpenHelp: () => void
    hidden?: boolean
}

export function StatsOverlay({ lineCount, charCount, onOpenHelp, hidden = false }: StatsOverlayProps) {
    const { t } = useTranslation()

    if (hidden) return null

    const lineText = t('statusBar.lines', { count: lineCount })
    const charText = t('statusBar.chars', { count: charCount })
    const helpTitle = t('settings.shortcutReference')

    return (
        <div className="stats-overlay">
            <button
                className="stats-help-button"
                type="button"
                onClick={onOpenHelp}
                title={helpTitle}
                aria-label={helpTitle}
            >
                <HelpCircle size={16} strokeWidth={2} />
            </button>
            <div className="stats-capsule" role="status" aria-label={`${lineText} | ${charText}`} title={`${lineText} | ${charText}`}>
                <div className="stats-item">
                    <FileText className="stats-icon" size={14} strokeWidth={2} />
                    <span className="stats-value">{lineCount}</span>
                </div>
                <span className="stats-divider" aria-hidden="true" />
                <div className="stats-item">
                    <Type className="stats-icon" size={14} strokeWidth={2} />
                    <span className="stats-value">{charCount}</span>
                </div>
            </div>
        </div>
    )
}
