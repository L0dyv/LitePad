import { getConfig, setUser } from './config'

// Token 存储 key
const ACCESS_TOKEN_KEY = 'litepad-access-token'
const REFRESH_TOKEN_KEY = 'litepad-refresh-token'
const USER_INFO_KEY = 'litepad-user-info'

export interface UserInfo {
    id: string
    email: string
}

export interface AuthResult {
    user: UserInfo
    accessToken: string
    refreshToken: string
}

// 获取存储的 token
export function getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY)
}

// 保存 token
export function saveTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

// 清除 token
export function clearTokens(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(USER_INFO_KEY)
}

// 获取用户信息
export function getUserInfo(): UserInfo | null {
    const stored = localStorage.getItem(USER_INFO_KEY)
    if (stored) {
        try {
            return JSON.parse(stored)
        } catch {
            return null
        }
    }
    return null
}

// 保存用户信息
export function saveUserInfo(user: UserInfo): void {
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(user))
}

// 注册
export async function register(email: string, password: string): Promise<AuthResult> {
    const config = await getConfig()
    const response = await fetch(`${config.serverUrl}/auth/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '注册失败')
    }

    const result = await response.json() as AuthResult

    // 保存认证信息
    saveTokens(result.accessToken, result.refreshToken)
    saveUserInfo(result.user)
    await setUser(result.user.id)

    return result
}

// 登录
export async function login(email: string, password: string): Promise<AuthResult> {
    const config = await getConfig()
    const response = await fetch(`${config.serverUrl}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '登录失败')
    }

    const result = await response.json() as AuthResult

    // 保存认证信息
    saveTokens(result.accessToken, result.refreshToken)
    saveUserInfo(result.user)
    await setUser(result.user.id)

    return result
}

// 刷新 token
export async function refreshAccessToken(): Promise<string | null> {
    const refreshToken = getRefreshToken()
    const userInfo = getUserInfo()

    if (!refreshToken || !userInfo) {
        return null
    }

    const config = await getConfig()
    try {
        const response = await fetch(`${config.serverUrl}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                refreshToken,
                userId: userInfo.id
            })
        })

        if (!response.ok) {
            // Refresh token 无效，清除认证
            clearTokens()
            await setUser(null)
            return null
        }

        const { accessToken } = await response.json()
        localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
        return accessToken
    } catch {
        return null
    }
}

// 登出
export async function logout(): Promise<void> {
    const config = await getConfig()
    const accessToken = getAccessToken()

    if (accessToken) {
        try {
            await fetch(`${config.serverUrl}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            })
        } catch {
            // 忽略登出错误
        }
    }

    clearTokens()
    await setUser(null)
}

// 检查是否已登录
export function isLoggedIn(): boolean {
    return !!getAccessToken() && !!getUserInfo()
}

// 带认证的 fetch
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    let accessToken = getAccessToken()

    // 第一次尝试
    let response = await fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${accessToken}`
        }
    })

    // 如果 401，尝试刷新 token
    if (response.status === 401) {
        accessToken = await refreshAccessToken()
        if (!accessToken) {
            throw new Error('认证已过期，请重新登录')
        }

        // 用新 token 重试
        response = await fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${accessToken}`
            }
        })
    }

    return response
}
