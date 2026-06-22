import { STORAGE_KEYS } from '../../lib/constants'
import type { SleepRecord, ActivityData } from '../../types'
import { MOCK_SLEEP_RECORDS, MOCK_ACTIVITY } from './mock'

const FITBIT_CLIENT_ID = import.meta.env.VITE_FITBIT_CLIENT_ID ?? ''
const REDIRECT_URI =
  import.meta.env.VITE_FITBIT_REDIRECT_URI ?? `${window.location.origin}/`

const generateRandomString = (length: number): string => {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

const sha256 = async (plain: string): Promise<ArrayBuffer> => {
  const encoder = new TextEncoder()
  return crypto.subtle.digest('SHA-256', encoder.encode(plain))
}

const base64UrlEncode = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const getStoredToken = (): string | null =>
  localStorage.getItem(STORAGE_KEYS.fitbitToken)

export const storeToken = (token: string): void => {
  localStorage.setItem(STORAGE_KEYS.fitbitToken, token)
}

export const clearToken = (): void => {
  localStorage.removeItem(STORAGE_KEYS.fitbitToken)
}

export const isFitbitConfigured = (): boolean => Boolean(FITBIT_CLIENT_ID)

export const startFitbitAuth = async (): Promise<void> => {
  const verifier = generateRandomString(32)
  const challenge = base64UrlEncode(await sha256(verifier))
  sessionStorage.setItem(STORAGE_KEYS.pkceVerifier, verifier)

  const params = new URLSearchParams({
    client_id: FITBIT_CLIENT_ID,
    response_type: 'code',
    scope: 'activity sleep',
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  window.location.href = `https://www.fitbit.com/oauth2/authorize?${params}`
}

export const handleFitbitCallback = async (): Promise<boolean> => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (!code) return false

  const verifier = sessionStorage.getItem(STORAGE_KEYS.pkceVerifier)
  if (!verifier) return false

  const body = new URLSearchParams({
    client_id: FITBIT_CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  })

  const response = await fetch('https://api.fitbit.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) return false

  const data = (await response.json()) as { access_token: string }
  storeToken(data.access_token)
  sessionStorage.removeItem(STORAGE_KEYS.pkceVerifier)
  window.history.replaceState({}, '', window.location.pathname)
  return true
}

const fitbitFetch = async <T>(path: string): Promise<T> => {
  const token = getStoredToken()
  if (!token) throw new Error('Fitbit not authenticated')

  const response = await fetch(`https://api.fitbit.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) throw new Error(`Fitbit API error: ${response.status}`)
  return response.json() as Promise<T>
}

type FitbitSleepResponse = {
  sleep: Array<{
    dateOfSleep: string
    startTime: string
    endTime: string
    minutesAsleep: number
  }>
}

const formatTimeFromIso = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const parseSleepRecord = (
  item: FitbitSleepResponse['sleep'][0],
): SleepRecord => ({
  date: item.dateOfSleep,
  sleepStart: formatTimeFromIso(item.startTime),
  wakeTime: formatTimeFromIso(item.endTime),
  minutesAsleep: item.minutesAsleep,
})

export const fetchSleepRecords = async (): Promise<SleepRecord[]> => {
  const today = new Date()
  const records: SleepRecord[] = []

  for (let i = 1; i <= 3; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]

    const data = await fitbitFetch<FitbitSleepResponse>(
      `/1.2/user/-/sleep/date/${dateStr}.json`,
    )

    if (data.sleep?.[0]) {
      records.push(parseSleepRecord(data.sleep[0]))
    }
  }

  return records
}

type FitbitStepsResponse = {
  'activities-steps': Array<{ dateTime: string; value: string }>
}

export const fetchActivityData = async (): Promise<ActivityData> => {
  const [currentWeek, last4Weeks] = await Promise.all([
    fitbitFetch<FitbitStepsResponse>(
      '/1/user/-/activities/steps/date/today/7d.json',
    ),
    fitbitFetch<FitbitStepsResponse>(
      '/1/user/-/activities/steps/date/today/28d.json',
    ),
  ])

  return {
    currentWeekSteps: currentWeek['activities-steps'].map((s) =>
      parseInt(s.value, 10),
    ),
    last4WeeksSteps: last4Weeks['activities-steps'].map((s) =>
      parseInt(s.value, 10),
    ),
    dailySteps: currentWeek['activities-steps'].map((s) => ({
      date: s.dateTime,
      steps: parseInt(s.value, 10),
    })),
  }
}

export const fetchFitbitData = async (): Promise<{
  sleepRecords: SleepRecord[]
  activity: ActivityData
}> => {
  const token = getStoredToken()
  if (!token) {
    return { sleepRecords: MOCK_SLEEP_RECORDS, activity: MOCK_ACTIVITY }
  }

  const [sleepRecords, activity] = await Promise.all([
    fetchSleepRecords(),
    fetchActivityData(),
  ])

  return { sleepRecords, activity }
}
