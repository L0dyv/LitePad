import { useState } from 'react'
import './styles/App.css'

function App() {
    const [content, setContent] = useState('')

    return (
        <div className="app">
            <header className="app-header">
                <div className="tab-bar">
                    <div className="tab active">默认页</div>
                    <button className="tab-add">+</button>
                </div>
            </header>
            <main className="app-main">
                <textarea
                    className="editor"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="开始输入..."
                    autoFocus
                />
            </main>
            <footer className="app-footer">
                <span className="status">就绪</span>
                <span className="char-count">{content.length} 字符</span>
            </footer>
        </div>
    )
}

export default App
