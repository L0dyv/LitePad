import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { login, register } from '../sync/auth'
import './AuthModal.css'

interface AuthModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

type AuthMode = 'login' | 'register'

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
    const { t } = useTranslation()
    const [mode, setMode] = useState<AuthMode>('login')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        // 验证
        if (!email || !password) {
            setError(t('sync.emailPasswordRequired'))
            return
        }

        if (mode === 'register') {
            if (password !== confirmPassword) {
                setError(t('sync.passwordMismatch'))
                return
            }
            if (password.length < 6) {
                setError(t('sync.passwordTooShort'))
                return
            }
        }

        setLoading(true)

        try {
            if (mode === 'login') {
                await login(email, password)
            } else {
                await register(email, password)
            }
            onSuccess()
            onClose()
            // 重置表单
            setEmail('')
            setPassword('')
            setConfirmPassword('')
        } catch (err: any) {
            setError(err.message || t('sync.authFailed'))
        } finally {
            setLoading(false)
        }
    }

    const switchMode = () => {
        setMode(mode === 'login' ? 'register' : 'login')
        setError(null)
    }

    if (!isOpen) return null

    return (
        <div className="auth-overlay" onClick={onClose}>
            <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
                <div className="auth-header">
                    <h2>{mode === 'login' ? t('sync.login') : t('sync.register')}</h2>
                    <button className="auth-close" onClick={onClose}>×</button>
                </div>

                <form className="auth-form" onSubmit={handleSubmit}>
                    {error && (
                        <div className="auth-error">{error}</div>
                    )}

                    <div className="auth-field">
                        <label htmlFor="email">{t('sync.email')}</label>
                        <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder={t('sync.emailPlaceholder')}
                            disabled={loading}
                            autoFocus
                        />
                    </div>

                    <div className="auth-field">
                        <label htmlFor="password">{t('sync.password')}</label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={t('sync.passwordPlaceholder')}
                            disabled={loading}
                        />
                    </div>

                    {mode === 'register' && (
                        <div className="auth-field">
                            <label htmlFor="confirmPassword">{t('sync.confirmPassword')}</label>
                            <input
                                type="password"
                                id="confirmPassword"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder={t('sync.confirmPasswordPlaceholder')}
                                disabled={loading}
                            />
                        </div>
                    )}

                    <button
                        type="submit"
                        className="auth-submit"
                        disabled={loading}
                    >
                        {loading
                            ? t('sync.processing')
                            : mode === 'login'
                                ? t('sync.login')
                                : t('sync.register')
                        }
                    </button>
                </form>

                <div className="auth-switch">
                    <span>
                        {mode === 'login'
                            ? t('sync.noAccount')
                            : t('sync.hasAccount')
                        }
                    </span>
                    <button type="button" onClick={switchMode}>
                        {mode === 'login' ? t('sync.register') : t('sync.login')}
                    </button>
                </div>
            </div>
        </div>
    )
}
