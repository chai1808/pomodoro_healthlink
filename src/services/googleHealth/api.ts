import type { ActivityData, SleepRecord } from '../../types'
import { healthFetch, isHealthConnected } from './auth'
import { formatCivilDate, formatCivilTime, isoDate, toCivilDate } from './format'
import { MOCK_ACTIVITY, MOCK_SLEEP_RECORDS } from './mock'
import type { HealthSleepPoint, HealthStepsRollup } from './types'

const parseSleepRecord = (item: HealthSleepPoint): SleepRecord | null => {
  const interval = item.sleep?.interval
  if (!interval) return null

  const date = formatCivilDate(interval.civilEndTime) || formatCivilDate(interval.civilStartTime)
  if (!date) return null

  return {
    date,
    sleepStart: formatCivilTime(interval.civilStartTime, interval.startTime),
    wakeTime: formatCivilTime(interval.civilEndTime, interval.endTime),
    minutesAsleep: parseInt(item.sleep?.summary?.minutesAsleep ?? '0', 10),
  }
}

const fetchSleepRecords = async (): Promise<SleepRecord[]> => {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 3)

  const filter = encodeURIComponent(
    `sleep.interval.civil_end_time >= "${isoDate(start)}" AND sleep.interval.civil_end_time < "${isoDate(end)}"`,
  )

  const data = await healthFetch<{ dataPoints?: HealthSleepPoint[] }>(
    `/users/me/dataTypes/sleep/dataPoints?pageSize=25&filter=${filter}`,
  )

  return (data.dataPoints ?? [])
    .map(parseSleepRecord)
    .filter((record): record is SleepRecord => record !== null)
    .slice(0, 3)
}

const fetchActivityData = async (): Promise<ActivityData> => {
  const end = new Date()
  end.setDate(end.getDate() + 1)
  const start = new Date()
  start.setDate(start.getDate() - 27)

  const data = await healthFetch<HealthStepsRollup>(
    '/users/me/dataTypes/steps/dataPoints:dailyRollUp',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        range: { start: toCivilDate(start), end: toCivilDate(end) },
        windowSizeDays: 1,
      }),
    },
  )

  const dailySteps = (data.rollupDataPoints ?? []).map((point) => ({
    date: formatCivilDate(point.civilStartTime),
    steps: parseInt(point.steps?.countSum ?? '0', 10),
  }))

  return {
    currentWeekSteps: dailySteps.slice(-7).map((day) => day.steps),
    last4WeeksSteps: dailySteps.map((day) => day.steps),
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

export type { OAuthCallbackResult } from './types'
