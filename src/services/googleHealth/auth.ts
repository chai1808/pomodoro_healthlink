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
}

const exchangeToken = async (body: URLSearchParams): Promise<boolean> => {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    console.warn('[google-health] token failed:', response.status, await response.text())
    return false
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token?: string
  }
  storeTokens(data.access_token, data.refresh_token)
  return true
}

export const handleOAuthCallback = async (): Promise<boolean> => {
  const params = new URLSearchParams(window.location.search)
  const oauthError = params.get('error')
  if (oauthError) {
    console.warn('[google-health] oauth error:', oauthError, params.get('error_description'))
    window.history.replaceState({}, '', '/')
    return false
  }

  const code = params.get('code')
  if (!code) return false

  const verifier = sessionStorage.getItem(STORAGE_KEYS.pkceVerifier)
  if (!verifier) {
    console.warn('[google-health] pkce verifier missing')
    window.history.replaceState({}, '', '/')
    return false
  }

  const success = await exchangeToken(
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
  return success
}

const refreshAccessToken = (): Promise<boolean> => {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return Promise.resolve(false)

  return exchangeToken(
    new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  )
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
