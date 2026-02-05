import { useTranslation } from 'react-i18next'
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
    const helpTitle = t('help.title')

    return (
        <div className="stats-overlay">
            <button
                className="stats-help-button"
                type="button"
                onClick={onOpenHelp}
                title={helpTitle}
                aria-label={helpTitle}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 1 1 5.82 1c0 2-3 2-3 4"></path>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
            </button>
            <div className="stats-capsule" role="status" aria-label={`${lineText} | ${charText}`} title={`${lineText} | ${charText}`}>
                <div className="stats-item">
                    <svg className="stats-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                    <span className="stats-value">{lineCount}</span>
                </div>
                <span className="stats-divider" aria-hidden="true" />
                <div className="stats-item">
                    <svg className="stats-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="4 7 4 4 20 4 20 7"></polyline>
                        <line x1="9" y1="20" x2="15" y2="20"></line>
                        <line x1="12" y1="4" x2="12" y2="20"></line>
                    </svg>
                    <span className="stats-value">{charCount}</span>
                </div>
            </div>
        </div>
    )
}

