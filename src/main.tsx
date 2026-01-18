import React from 'react'
import ReactDOM from 'react-dom/client'
import './lib/tauri-api' // Initialize Tauri API bridge (sets window.electronAPI)
import './i18n/i18n'
import App from './App'
import './styles/index.css'

const rootEl = document.getElementById('root')
ReactDOM.createRoot(rootEl!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)
