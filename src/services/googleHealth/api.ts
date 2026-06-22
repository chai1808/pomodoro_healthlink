import type { ActivityData, DailySteps, SleepRecord } from '../../types'
import { healthFetch, isHealthConnected } from './auth'
import {
  formatCivilDate,
  formatCivilTime,
  isoDate,
  isoDateFromTimestamp,
  toCivilDateTimeStart,
} from './format'
import type {
  HealthSleepPoint,
  HealthStepsPoint,
  HealthStepsRollup,
  HealthStepsRollupPoint,
} from './types'

const EMPTY_ACTIVITY: ActivityData = {
  currentWeekSteps: [],
  last4WeeksSteps: [],
  dailySteps: [],
}

const ACTIVITY_RANGE_DAYS = 27

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

const parseRollupPoint = (point: HealthStepsRollupPoint): DailySteps | null => {
  const date =
    formatCivilDate(point.civilEndTime) || formatCivilDate(point.civilStartTime)
  if (!date) return null

  const steps = parseInt(point.steps?.countSum ?? '0', 10)
  if (Number.isNaN(steps) || steps < 0) return null

  return { date, steps }
}

const parseRollupSteps = (raw: HealthStepsRollupPoint[]): DailySteps[] =>
  raw
    .map(parseRollupPoint)
    .filter((day): day is DailySteps => day !== null)
    .sort((left, right) => left.date.localeCompare(right.date))

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
  if (steps < 0 || Number.isNaN(steps)) return null

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

const buildActivityRange = () => {
  const rangeStart = new Date()
  rangeStart.setDate(rangeStart.getDate() - ACTIVITY_RANGE_DAYS)
  const rangeEndExclusive = new Date()
  rangeEndExclusive.setDate(rangeEndExclusive.getDate() + 1)

  return {
    rangeStart,
    rangeEndExclusive,
    requestBody: {
      range: {
        start: toCivilDateTimeStart(rangeStart),
        end: toCivilDateTimeStart(rangeEndExclusive),
      },
      windowSizeDays: 1,
    },
  }
}

const fetchActivityViaDailyRollUp = async (): Promise<{
  raw: HealthStepsRollupPoint[]
  activity: ActivityData
}> => {
  const { requestBody } = buildActivityRange()

  console.log('[google-health] steps dailyRollUp range:', requestBody.range)

  const data = await healthFetch<HealthStepsRollup>(
    '/users/me/dataTypes/steps/dataPoints:dailyRollUp',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    },
  )

  const raw = data.rollupDataPoints ?? []
  console.log('[google-health] steps dailyRollUp response:', raw)

  const dailySteps = parseRollupSteps(raw)
  console.log('[google-health] steps parsed:', dailySteps)

  if (raw.length > 0 && dailySteps.length === 0) {
    console.warn('[google-health] steps dailyRollUp raw data exists but parse failed')
  }

  return { raw, activity: buildActivityData(dailySteps) }
}

const fetchActivityViaList = async (): Promise<ActivityData> => {
  const { rangeStart, rangeEndExclusive } = buildActivityRange()

  const filter = encodeURIComponent(
    `steps.interval.civil_start_time >= "${isoDate(rangeStart)}" AND steps.interval.civil_start_time < "${isoDate(rangeEndExclusive)}"`,
  )

  const data = await healthFetch<{ dataPoints?: HealthStepsPoint[] }>(
    `/users/me/dataTypes/steps/dataPoints?pageSize=100&filter=${filter}`,
  )

  console.log('[google-health] steps list response:', data.dataPoints ?? [])

  const points = (data.dataPoints ?? [])
    .map(parseStepsListPoint)
    .filter((point): point is { date: string; steps: number } => point !== null)

  const dailySteps = aggregateStepsByDate(points)
  console.log('[google-health] steps list parsed:', dailySteps)

  return buildActivityData(dailySteps)
}

const fetchActivityData = async (): Promise<ActivityData> => {
  const { raw, activity } = await fetchActivityViaDailyRollUp()
  if (activity.dailySteps.length > 0) return activity

  if (raw.length > 0) return EMPTY_ACTIVITY

  const listed = await fetchActivityViaList()
  return listed.dailySteps.length > 0 ? listed : EMPTY_ACTIVITY
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
