import type { SleepRecord, ActivityData } from '../../types'
import { healthFetch, isHealthConnected } from './auth'
import { MOCK_SLEEP_RECORDS, MOCK_ACTIVITY } from './mock'

type CivilDate = { year?: number; month?: number; day?: number }
type CivilTime = { hours?: number; minutes?: number }
type CivilDateTime = { date?: CivilDate; time?: CivilTime }

const formatDate = (civil?: CivilDateTime): string => {
  if (!civil?.date) return ''
  const { year = 0, month = 0, day = 0 } = civil.date
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const formatTime = (civil?: CivilDateTime, iso?: string): string => {
  if (civil) {
    const h = civil.time?.hours ?? 0
    const m = civil.time?.minutes ?? 0
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  if (!iso) return '--:--'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const toCivilDate = (date: Date): CivilDateTime => ({
  date: { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() },
})

const fetchSleepRecords = async (): Promise<SleepRecord[]> => {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 3)

  const filter = encodeURIComponent(
    `sleep.interval.civil_end_time >= "${start.toISOString().split('T')[0]}" AND sleep.interval.civil_end_time < "${end.toISOString().split('T')[0]}"`,
  )

  const data = await healthFetch<{ dataPoints?: Array<{ sleep?: {
    interval?: { startTime?: string; endTime?: string; civilStartTime?: CivilDateTime; civilEndTime?: CivilDateTime }
    summary?: { minutesAsleep?: string }
  } }> }>(`/users/me/dataTypes/sleep/dataPoints?pageSize=25&filter=${filter}`)

  return (data.dataPoints ?? [])
    .map((item): SleepRecord | null => {
      const interval = item.sleep?.interval
      if (!interval) return null
      const date = formatDate(interval.civilEndTime) || formatDate(interval.civilStartTime)
      if (!date) return null
      return {
        date,
        sleepStart: formatTime(interval.civilStartTime, interval.startTime),
        wakeTime: formatTime(interval.civilEndTime, interval.endTime),
        minutesAsleep: parseInt(item.sleep?.summary?.minutesAsleep ?? '0', 10),
      }
    })
    .filter((r): r is SleepRecord => r !== null)
    .slice(0, 3)
}

const fetchActivityData = async (): Promise<ActivityData> => {
  const end = new Date()
  end.setDate(end.getDate() + 1)
  const start = new Date()
  start.setDate(start.getDate() - 27)

  const data = await healthFetch<{ rollupDataPoints?: Array<{
    civilStartTime?: CivilDateTime
    steps?: { countSum?: string }
  }> }>('/users/me/dataTypes/steps/dataPoints:dailyRollUp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ range: { start: toCivilDate(start), end: toCivilDate(end) }, windowSizeDays: 1 }),
  })

  const dailySteps = (data.rollupDataPoints ?? []).map((p) => ({
    date: formatDate(p.civilStartTime),
    steps: parseInt(p.steps?.countSum ?? '0', 10),
  }))

  return {
    currentWeekSteps: dailySteps.slice(-7).map((d) => d.steps),
    last4WeeksSteps: dailySteps.map((d) => d.steps),
    dailySteps,
  }
}

export const fetchHealthData = async (): Promise<{
  sleepRecords: SleepRecord[]
  activity: ActivityData
}> => {
  if (!isHealthConnected()) {
    return { sleepRecords: MOCK_SLEEP_RECORDS, activity: MOCK_ACTIVITY }
  }

  const [sleepRecords, activity] = await Promise.all([
    fetchSleepRecords(),
    fetchActivityData(),
  ])

  return { sleepRecords, activity }
}

export {
  disconnectHealth,
  handleOAuthCallback,
  isHealthConfigured,
  isHealthConnected,
  startHealthAuth,
} from './auth'
