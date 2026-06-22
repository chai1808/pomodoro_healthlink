import { STORAGE_KEYS } from '../../lib/constants'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
const REDIRECT_URI =
  import.meta.env.VITE_GOOGLE_REDIRECT_URI ?? `${window.location.origin}/`
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = '/api/google/token'
const SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
]

export type OAuthCallbackResult =
  | { ok: true }
  | { ok: false; message: string }

const getAccessToken = (): string | null =>
  localStorage.getItem(STORAGE_KEYS.googleHealthAccessToken)

const getRefreshToken = (): string | null =>
  localStorage.getItem(STORAGE_KEYS.googleHealthRefreshToken)

const storeTokens = (accessToken: string, refreshToken?: string): void => {
  localStorage.setItem(STORAGE_KEYS.googleHealthAccessToken, accessToken)
  if (refreshToken) {
    localStorage.setItem(STORAGE_KEYS.googleHealthRefreshToken, refreshToken)
  }
}

export const isHealthConfigured = (): boolean => Boolean(CLIENT_ID)

export const isHealthConnected = (): boolean =>
  Boolean(getAccessToken() || getRefreshToken())

const base64Url = (buffer: ArrayBuffer | Uint8Array): string => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const createPkce = async (): Promise<{ verifier: string; challenge: string }> => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const verifier = base64Url(bytes)
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  )
  return { verifier, challenge: base64Url(digest) }
}

export const startHealthAuth = async (): Promise<void> => {
  if (!CLIENT_ID) return

  const { verifier, challenge } = await createPkce()
  sessionStorage.setItem(STORAGE_KEYS.pkceVerifier, verifier)
  sessionStorage.removeItem(STORAGE_KEYS.oauthProcessedCode)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
  })

  if (!getRefreshToken()) params.set('prompt', 'consent')

  window.location.href = `${AUTH_URL}?${params.toString()}`
}

export const disconnectHealth = (): void => {
  localStorage.removeItem(STORAGE_KEYS.googleHealthAccessToken)
  localStorage.removeItem(STORAGE_KEYS.googleHealthRefreshToken)
  sessionStorage.removeItem(STORAGE_KEYS.oauthProcessedCode)
}

const parseTokenError = async (response: Response): Promise<string> => {
  const text = await response.text()
  try {
    const data = JSON.parse(text) as { error?: string; error_description?: string }
    if (data.error_description) return data.error_description
    if (data.error) return data.error
  } catch {
    if (text) return text.slice(0, 120)
  }
  return `HTTP ${response.status}`
}

const exchangeToken = async (body: URLSearchParams): Promise<{ ok: true } | { ok: false; message: string }> => {
  let response: Response
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
  } catch {
    return { ok: false, message: 'トークン API に接続できませんでした' }
  }

  if (!response.ok) {
    const message = await parseTokenError(response)
    console.warn('[google-health] token failed:', message)
    return { ok: false, message }
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token?: string
  }
  storeTokens(data.access_token, data.refresh_token)
  return { ok: true }
}

export const handleOAuthCallback = async (): Promise<OAuthCallbackResult> => {
  const params = new URLSearchParams(window.location.search)
  const oauthError = params.get('error')
  if (oauthError) {
    const description = params.get('error_description') ?? oauthError
    window.history.replaceState({}, '', '/')
    return { ok: false, message: description }
  }

  const code = params.get('code')
  if (!code) return { ok: true }

  if (sessionStorage.getItem(STORAGE_KEYS.oauthProcessedCode) === code) {
    window.history.replaceState({}, '', '/')
    return isHealthConnected() ? { ok: true } : { ok: false, message: '認可コードの処理に失敗しました' }
  }

  const verifier = sessionStorage.getItem(STORAGE_KEYS.pkceVerifier)
  if (!verifier) {
    window.history.replaceState({}, '', '/')
    return { ok: false, message: '認可セッションが切れました。もう一度連携してください' }
  }

  sessionStorage.setItem(STORAGE_KEYS.oauthProcessedCode, code)

  const result = await exchangeToken(
    new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  )

  sessionStorage.removeItem(STORAGE_KEYS.pkceVerifier)
  window.history.replaceState({}, '', '/')

  if (!result.ok) {
    sessionStorage.removeItem(STORAGE_KEYS.oauthProcessedCode)
    return { ok: false, message: result.message }
  }

  return { ok: true }
}

const refreshAccessToken = async (): Promise<boolean> => {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  const result = await exchangeToken(
    new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  )

  return result.ok
}

export const resolveAccessToken = async (): Promise<string | null> => {
  const token = getAccessToken()
  if (token) return token
  if (!(await refreshAccessToken())) return null
  return getAccessToken()
}

export const healthFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const base = 'https://health.googleapis.com/v4'
  const token = await resolveAccessToken()
  if (!token) throw new Error('Google Health not authenticated')

  const request = (accessToken: string) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) },
    })

  let response = await request(token)

  if (response.status === 401 && (await refreshAccessToken())) {
    const retryToken = getAccessToken()
    if (retryToken) response = await request(retryToken)
  }

  if (!response.ok) throw new Error(`Google Health API error: ${response.status}`)
  return response.json() as Promise<T>
}
