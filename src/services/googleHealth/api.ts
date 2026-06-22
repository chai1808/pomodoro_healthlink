import type { ActivityData, DailySteps, SleepRecord } from '../../types'
import { healthFetch, isHealthConnected } from './auth'
import {
  formatCivilDate,
  formatCivilTime,
  isoDate,
  isoDateFromTimestamp,
  toCivilDateTimeEnd,
  toCivilDateTimeStart,
} from './format'
import type { HealthSleepPoint, HealthStepsPoint, HealthStepsRollup } from './types'

const EMPTY_ACTIVITY: ActivityData = {
  currentWeekSteps: [],
  last4WeeksSteps: [],
  dailySteps: [],
}

const parseSleepRecord = (item: HealthSleepPoint): SleepRecord | null => {
  const interval = item.sleep?.interval
  if (!interval) return null

  const date =
    formatCivilDate(interval.civilEndTime) ||
    formatCivilDate(interval.civilStartTime) ||
    isoDateFromTimestamp(interval.endTime) ||
    isoDateFromTimestamp(interval.startTime)
  if (!date) return null

  const minutesAsleep = parseInt(item.sleep?.summary?.minutesAsleep ?? '0', 10)
  if (minutesAsleep <= 0) return null

  return {
    date,
    sleepStart: formatCivilTime(interval.civilStartTime, interval.startTime),
    wakeTime: formatCivilTime(interval.civilEndTime, interval.endTime),
    minutesAsleep,
  }
}

const fetchSleepRecords = async (): Promise<SleepRecord[]> => {
  const end = new Date()
  end.setDate(end.getDate() + 1)
  const start = new Date()
  start.setDate(start.getDate() - 7)

  const filter = encodeURIComponent(
    `sleep.interval.civil_end_time >= "${isoDate(start)}" AND sleep.interval.civil_end_time < "${isoDate(end)}"`,
  )

  const data = await healthFetch<{ dataPoints?: HealthSleepPoint[] }>(
    `/users/me/dataTypes/sleep/dataPoints:reconcile?pageSize=25&filter=${filter}`,
  )

  const raw = data.dataPoints ?? []
  console.log('[google-health] sleep response:', raw)

  const records = raw
    .map(parseSleepRecord)
    .filter((record): record is SleepRecord => record !== null)
    .slice(0, 3)

  console.log('[google-health] sleep parsed:', records)

  return records
}

const buildActivityData = (dailySteps: DailySteps[]): ActivityData => ({
  currentWeekSteps: dailySteps.slice(-7).map((day) => day.steps),
  last4WeeksSteps: dailySteps.map((day) => day.steps),
  dailySteps,
})

const parseRollupSteps = (data: HealthStepsRollup): DailySteps[] =>
  (data.rollupDataPoints ?? [])
    .map((point) => ({
      date:
        formatCivilDate(point.civilStartTime) ||
        formatCivilDate(point.civilEndTime) ||
        '',
      steps: parseInt(point.steps?.countSum ?? '0', 10),
    }))
    .filter((day) => day.date)

const parseStepsListPoint = (
  item: HealthStepsPoint,
): { date: string; steps: number } | null => {
  const interval = item.steps?.interval
  if (!interval) return null

  const date =
    formatCivilDate(interval.civilEndTime) ||
    formatCivilDate(interval.civilStartTime) ||
    isoDateFromTimestamp(interval.endTime) ||
    isoDateFromTimestamp(interval.startTime)
  if (!date) return null

  const steps = parseInt(item.steps?.count ?? item.steps?.countSum ?? '0', 10)
  if (steps < 0) return null

  return { date, steps }
}

const aggregateStepsByDate = (
  points: Array<{ date: string; steps: number }>,
): DailySteps[] => {
  const totals = new Map<string, number>()

  for (const point of points) {
    totals.set(point.date, (totals.get(point.date) ?? 0) + point.steps)
  }

  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, steps]) => ({ date, steps }))
}

const fetchActivityViaDailyRollUp = async (
  start: Date,
  end: Date,
): Promise<ActivityData> => {
  const data = await healthFetch<HealthStepsRollup>(
    '/users/me/dataTypes/steps/dataPoints:dailyRollUp',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        range: {
          start: toCivilDateTimeStart(start),
          end: toCivilDateTimeEnd(end),
        },
        windowSizeDays: 1,
      }),
    },
  )

  console.log('[google-health] steps dailyRollUp response:', data.rollupDataPoints ?? [])

  return buildActivityData(parseRollupSteps(data))
}

const fetchActivityViaList = async (start: Date, end: Date): Promise<ActivityData> => {
  const rangeEnd = new Date(end)
  rangeEnd.setDate(rangeEnd.getDate() + 1)

  const filter = encodeURIComponent(
    `steps.interval.civil_start_time >= "${isoDate(start)}" AND steps.interval.civil_start_time < "${isoDate(rangeEnd)}"`,
  )

  const data = await healthFetch<{ dataPoints?: HealthStepsPoint[] }>(
    `/users/me/dataTypes/steps/dataPoints?pageSize=100&filter=${filter}`,
  )

  console.log('[google-health] steps list response:', data.dataPoints ?? [])

  const points = (data.dataPoints ?? [])
    .map(parseStepsListPoint)
    .filter((point): point is { date: string; steps: number } => point !== null)

  const dailySteps = aggregateStepsByDate(points)
  console.log('[google-health] steps parsed:', dailySteps)

  return buildActivityData(dailySteps)
}

const fetchActivityData = async (): Promise<ActivityData> => {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 27)

  const rollup = await fetchActivityViaDailyRollUp(start, end)
  if (rollup.dailySteps.length > 0) return rollup

  const listed = await fetchActivityViaList(start, end)
  if (listed.dailySteps.length > 0) return listed

  return EMPTY_ACTIVITY
}

export const fetchHealthData = async (): Promise<{
  sleepRecords: SleepRecord[]
  activity: ActivityData
}> => {
  if (!isHealthConnected()) {
    return { sleepRecords: [], activity: EMPTY_ACTIVITY }
  }

  const [sleepRecords, activity] = await Promise.all([
    fetchSleepRecords().catch((err) => {
      console.warn('[google-health] sleep fetch failed:', err)
      return [] as SleepRecord[]
    }),
    fetchActivityData().catch((err) => {
      console.warn('[google-health] activity fetch failed:', err)
      return EMPTY_ACTIVITY
    }),
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
