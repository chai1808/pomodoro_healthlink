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

  return (data.dataPoints ?? [])
    .map(parseSleepRecord)
    .filter((record): record is SleepRecord => record !== null)
    .slice(0, 3)
}

const buildActivityData = (dailySteps: DailySteps[]): ActivityData => ({
  currentWeekSteps: dailySteps.slice(-7).map((day) => day.steps),
  last4WeeksSteps: dailySteps.map((day) => day.steps),
  dailySteps,
})

const parseRollupPoint = (point: HealthStepsRollupPoint): DailySteps | null => {
  const date =
    formatCivilDate(point.civilStartTime) || formatCivilDate(point.civilEndTime)
  if (!date) return null

  const steps = parseInt(point.steps?.countSum ?? '0', 10)
  if (Number.isNaN(steps) || steps < 0) return null

  return { date, steps }
}

const parseRollupSteps = (raw: HealthStepsRollupPoint[]): DailySteps[] => {
  const today = isoDate(new Date())

  return raw
    .map(parseRollupPoint)
    .filter((day): day is DailySteps => day !== null)
    .filter((day) => day.date <= today)
    .sort((left, right) => left.date.localeCompare(right.date))
}

const parseStepsListPoint = (
  item: HealthStepsPoint,
): { date: string; steps: number } | null => {
  const interval = item.steps?.interval
  if (!interval) return null

  const date =
    formatCivilDate(interval.civilStartTime) ||
    formatCivilDate(interval.civilEndTime) ||
    isoDateFromTimestamp(interval.startTime) ||
    isoDateFromTimestamp(interval.endTime)
  if (!date) return null

  const steps = parseInt(item.steps?.count ?? item.steps?.countSum ?? '0', 10)
  if (steps < 0 || Number.isNaN(steps)) return null

  return { date, steps }
}

const aggregateStepsByDate = (
  points: Array<{ date: string; steps: number }>,
): DailySteps[] => {
  const totals = new Map<string, number>()
  const today = isoDate(new Date())

  for (const point of points) {
    if (point.date > today) continue
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

  const data = await healthFetch<HealthStepsRollup>(
    '/users/me/dataTypes/steps/dataPoints:dailyRollUp',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    },
  )

  const raw = data.rollupDataPoints ?? []
  return { raw, activity: buildActivityData(parseRollupSteps(raw)) }
}

const fetchActivityViaList = async (): Promise<ActivityData> => {
  const { rangeStart, rangeEndExclusive } = buildActivityRange()

  const filter = encodeURIComponent(
    `steps.interval.civil_start_time >= "${isoDate(rangeStart)}" AND steps.interval.civil_start_time < "${isoDate(rangeEndExclusive)}"`,
  )

  const data = await healthFetch<{ dataPoints?: HealthStepsPoint[] }>(
    `/users/me/dataTypes/steps/dataPoints?pageSize=100&filter=${filter}`,
  )

  const points = (data.dataPoints ?? [])
    .map(parseStepsListPoint)
    .filter((point): point is { date: string; steps: number } => point !== null)

  return buildActivityData(aggregateStepsByDate(points))
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
    fetchSleepRecords().catch(() => [] as SleepRecord[]),
    fetchActivityData().catch(() => EMPTY_ACTIVITY),
  ])

  return { sleepRecords, activity }
}

export {
  disconnectHealth,
  handleOAuthCallback,
  isHealthConfigured,
  isHealthConnected,
  loadHealthConfig,
  startHealthAuth,
} from './auth'

export type { OAuthCallbackResult } from './types'
