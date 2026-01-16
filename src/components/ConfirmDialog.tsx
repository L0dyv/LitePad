import { useTranslation } from 'react-i18next'
import './ConfirmDialog.css'

interface ConfirmDialogProps {
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
    onCancel: () => void
}

export function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel }: ConfirmDialogProps) {
    const { t } = useTranslation()

    if (!isOpen) return null

    return (
        <div className="confirm-dialog-overlay" onClick={onCancel}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="confirm-dialog-title">{title}</div>
                <div className="confirm-dialog-message">{message}</div>
                <div className="confirm-dialog-actions">
                    <button className="confirm-dialog-cancel" onClick={onCancel}>
                        {t('dialog.cancel')}
                    </button>
                    <button className="confirm-dialog-confirm" onClick={onConfirm}>
                        {t('dialog.confirm')}
                    </button>
                </div>
            </div>
        </div>
    )
}
