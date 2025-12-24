import './TitleBar.css'

interface TitleBarProps {
    title?: string
}

export function TitleBar({ title = 'FlashPad' }: TitleBarProps) {
    const handleMinimize = () => {
        window.electronAPI?.minimize()
    }

    const handleMaximize = () => {
        window.electronAPI?.maximize()
    }

    const handleClose = () => {
        window.electronAPI?.close()
    }

    return (
        <div className="title-bar">
            <div className="title-bar-drag">
                <span className="title-bar-title">{title}</span>
            </div>
            <div className="title-bar-controls">
                <button className="title-bar-btn minimize" onClick={handleMinimize}>
                    <svg width="10" height="1" viewBox="0 0 10 1">
                        <rect width="10" height="1" fill="currentColor" />
                    </svg>
                </button>
                <button className="title-bar-btn maximize" onClick={handleMaximize}>
                    <svg width="10" height="10" viewBox="0 0 10 10">
                        <rect x="0" y="0" width="10" height="10" stroke="currentColor" strokeWidth="1" fill="none" />
                    </svg>
                </button>
                <button className="title-bar-btn close" onClick={handleClose}>
                    <svg width="10" height="10" viewBox="0 0 10 10">
                        <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
                        <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                </button>
            </div>
        </div>
    )
}
