import { STORAGE_KEYS } from '../../lib/constants'
import type { SleepRecord, ActivityData } from '../../types'
import { MOCK_SLEEP_RECORDS, MOCK_ACTIVITY } from './mock'

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ??
  import.meta.env.VITE_FITBIT_CLIENT_ID ??
  ''
const REDIRECT_URI =
  import.meta.env.VITE_GOOGLE_REDIRECT_URI ??
  import.meta.env.VITE_FITBIT_REDIRECT_URI ??
  `${window.location.origin}/`

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = import.meta.env.DEV
  ? '/api/google/token'
  : 'https://oauth2.googleapis.com/token'
const GOOGLE_HEALTH_BASE = 'https://health.googleapis.com/v4'

const HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
]

const getStoredAccessToken = (): string | null =>
  localStorage.getItem(STORAGE_KEYS.googleHealthAccessToken)

const getStoredRefreshToken = (): string | null =>
  localStorage.getItem(STORAGE_KEYS.googleHealthRefreshToken)

const storeTokens = (accessToken: string, refreshToken?: string): void => {
  localStorage.setItem(STORAGE_KEYS.googleHealthAccessToken, accessToken)
  if (refreshToken) {
    localStorage.setItem(STORAGE_KEYS.googleHealthRefreshToken, refreshToken)
  }
}

export const isFitbitConfigured = (): boolean => Boolean(GOOGLE_CLIENT_ID)

export const isFitbitAuthenticated = (): boolean =>
  Boolean(getStoredAccessToken() || getStoredRefreshToken())

const base64UrlEncode = (buffer: ArrayBuffer | Uint8Array): string => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const generateCodeVerifier = (): string => {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

const generateCodeChallenge = async (verifier: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  )
  return base64UrlEncode(digest)
}

export const startFitbitAuth = async (): Promise<void> => {
  if (!GOOGLE_CLIENT_ID) return

  const verifier = generateCodeVerifier()
  sessionStorage.setItem(STORAGE_KEYS.pkceVerifier, verifier)

  const challenge = await generateCodeChallenge(verifier)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: HEALTH_SCOPES.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
  })

  if (!getStoredRefreshToken()) {
    params.set('prompt', 'consent')
  }

  window.location.href = `${GOOGLE_AUTH_URL}?${params.toString()}`
}

export const disconnectFitbit = (): void => {
  localStorage.removeItem(STORAGE_KEYS.googleHealthAccessToken)
  localStorage.removeItem(STORAGE_KEYS.googleHealthRefreshToken)
  localStorage.removeItem(STORAGE_KEYS.fitbitToken)
}

const exchangeToken = async (body: URLSearchParams): Promise<boolean> => {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    if (import.meta.env.DEV) {
      const detail = await response.text()
      console.warn('[google-health] token exchange failed:', response.status, detail)
    }
    return false
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token?: string
  }

  storeTokens(data.access_token, data.refresh_token)
  return true
}

export const handleFitbitCallback = async (): Promise<boolean> => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (!code) return false

  const verifier = sessionStorage.getItem(STORAGE_KEYS.pkceVerifier)
  if (!verifier) return false

  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  })

  const success = await exchangeToken(body)
  if (!success) return false

  sessionStorage.removeItem(STORAGE_KEYS.pkceVerifier)
  window.history.replaceState({}, '', window.location.pathname)
  return true
}

const refreshAccessToken = async (): Promise<boolean> => {
  const refreshToken = getStoredRefreshToken()
  if (!refreshToken) return false

  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })

  return exchangeToken(body)
}

const getValidAccessToken = async (): Promise<string | null> => {
  const accessToken = getStoredAccessToken()
  if (accessToken) return accessToken

  const refreshed = await refreshAccessToken()
  if (!refreshed) return null

  return getStoredAccessToken()
}

const healthFetch = async <T>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const token = await getValidAccessToken()
  if (!token) throw new Error('Google Health not authenticated')

  const response = await fetch(`${GOOGLE_HEALTH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })

  if (response.status === 401) {
    const refreshed = await refreshAccessToken()
    if (!refreshed) throw new Error('Google Health not authenticated')

    const retryToken = getStoredAccessToken()
    if (!retryToken) throw new Error('Google Health not authenticated')

    const retry = await fetch(`${GOOGLE_HEALTH_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${retryToken}`,
        ...(init?.headers ?? {}),
      },
    })

    if (!retry.ok) {
      throw new Error(`Google Health API error: ${retry.status}`)
    }

    return retry.json() as Promise<T>
  }

  if (!response.ok) {
    throw new Error(`Google Health API error: ${response.status}`)
  }

  return response.json() as Promise<T>
}

type CivilDate = { year?: number; month?: number; day?: number }
type CivilTime = { hours?: number; minutes?: number; seconds?: number }
type CivilDateTime = { date?: CivilDate; time?: CivilTime }

const formatCivilDate = (civil?: CivilDateTime): string => {
  if (!civil?.date) return ''
  const { year = 0, month = 0, day = 0 } = civil.date
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const formatCivilTime = (civil?: CivilDateTime): string => {
  if (!civil) return '--:--'
  const hours = civil.time?.hours ?? 0
  const minutes = civil.time?.minutes ?? 0
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const formatTimeFromIso = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

type HealthSleepDataPoint = {
  sleep?: {
    interval?: {
      startTime?: string
      endTime?: string
      civilStartTime?: CivilDateTime
      civilEndTime?: CivilDateTime
    }
    summary?: {
      minutesAsleep?: string
    }
  }
}

type HealthSleepListResponse = {
  dataPoints?: HealthSleepDataPoint[]
}

const parseSleepRecord = (item: HealthSleepDataPoint): SleepRecord | null => {
  const interval = item.sleep?.interval
  if (!interval) return null

  const date =
    formatCivilDate(interval.civilEndTime) ||
    formatCivilDate(interval.civilStartTime)
  if (!date) return null

  const sleepStart =
    formatCivilTime(interval.civilStartTime) ||
    (interval.startTime ? formatTimeFromIso(interval.startTime) : '--:--')
  const wakeTime =
    formatCivilTime(interval.civilEndTime) ||
    (interval.endTime ? formatTimeFromIso(interval.endTime) : '--:--')
  const minutesAsleep = parseInt(item.sleep?.summary?.minutesAsleep ?? '0', 10)

  return { date, sleepStart, wakeTime, minutesAsleep }
}

const fetchSleepRecords = async (): Promise<SleepRecord[]> => {
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - 3)
  const startStr = start.toISOString().split('T')[0]
  const endStr = today.toISOString().split('T')[0]

  const filter = encodeURIComponent(
    `sleep.interval.civil_end_time >= "${startStr}" AND sleep.interval.civil_end_time < "${endStr}"`,
  )

  const data = await healthFetch<HealthSleepListResponse>(
    `/users/me/dataTypes/sleep/dataPoints?pageSize=25&filter=${filter}`,
  )

  return (data.dataPoints ?? [])
    .map(parseSleepRecord)
    .filter((record): record is SleepRecord => record !== null)
    .slice(0, 3)
}

type HealthDailyRollupResponse = {
  rollupDataPoints?: Array<{
    civilStartTime?: CivilDateTime
    steps?: { countSum?: string }
  }>
}

const toCivilDateTime = (date: Date): CivilDateTime => ({
  date: {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  },
})

const fetchDailySteps = async (
  days: number,
): Promise<Array<{ date: string; steps: number }>> => {
  const end = new Date()
  end.setDate(end.getDate() + 1)
  const start = new Date()
  start.setDate(start.getDate() - (days - 1))

  const data = await healthFetch<HealthDailyRollupResponse>(
    '/users/me/dataTypes/steps/dataPoints:dailyRollUp',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        range: {
          start: toCivilDateTime(start),
          end: toCivilDateTime(end),
        },
        windowSizeDays: 1,
      }),
    },
  )

  return (data.rollupDataPoints ?? []).map((point) => ({
    date: formatCivilDate(point.civilStartTime),
    steps: parseInt(point.steps?.countSum ?? '0', 10),
  }))
}

const fetchActivityData = async (): Promise<ActivityData> => {
  const dailySteps = await fetchDailySteps(28)
  const currentWeekSteps = dailySteps.slice(-7).map((day) => day.steps)
  const last4WeeksSteps = dailySteps.map((day) => day.steps)

  return { currentWeekSteps, last4WeeksSteps, dailySteps }
}

export const fetchFitbitData = async (): Promise<{
  sleepRecords: SleepRecord[]
  activity: ActivityData
}> => {
  if (!getStoredAccessToken() && !getStoredRefreshToken()) {
    return { sleepRecords: MOCK_SLEEP_RECORDS, activity: MOCK_ACTIVITY }
  }

  const [sleepRecords, activity] = await Promise.all([
    fetchSleepRecords(),
    fetchActivityData(),
  ])

  return { sleepRecords, activity }
}
