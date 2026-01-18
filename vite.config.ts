import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    // Use relative paths for assets (required for Tauri embedded mode)
    base: './',
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src')
        }
    },
    // Tauri expects a fixed port, fail if not available
    server: {
        port: 5173,
        strictPort: true,
        watch: {
            // for hot reload in Tauri
            ignored: ['**/src-tauri/**']
        }
    },
    // Produce smaller build for Tauri
    build: {
        // Tauri uses Chromium on Windows and WebKit on macOS/Linux
        target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari14',
        // Don't minify for debug builds
        minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
        // Produce sourcemaps for debug builds
        sourcemap: !!process.env.TAURI_ENV_DEBUG
    },
    // Prevent vite from obscuring Rust errors
    clearScreen: false,
    // Environment variables
    envPrefix: ['VITE_', 'TAURI_ENV_']
})
