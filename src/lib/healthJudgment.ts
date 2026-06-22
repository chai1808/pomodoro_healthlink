import {
  MIN_ACTIVITY_SCORE,
  MIN_HEALTHY_SLEEP_HOURS,
  MAX_DROP_THRESHOLD,
  PRESSURE_RANGE_THRESHOLD,
  POMODORO_CONFIGS,
} from './constants'
import type {
  ActivityData,
  HealthSnapshot,
  HealthStatus,
  PomodoroConfig,
  PomodoroMode,
  PressurePoint,
  SleepRecord,
  WeatherInfo,
} from '../types'

const SIX_HOURS_MS = 6 * 60 * 60 * 1000

const startOfDay = (date: Date = new Date()): Date => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

const filterPointsForDay = (
  points: PressurePoint[],
  dayOffset: number,
): PressurePoint[] => {
  const start = startOfDay()
  start.setDate(start.getDate() + dayOffset)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  return points
    .filter(
      (point) =>
        point.timestamp >= start.getTime() && point.timestamp < end.getTime(),
    )
    .sort((a, b) => a.timestamp - b.timestamp)
}

const filterPointsForDayRange = (
  points: PressurePoint[],
  startDayOffset: number,
  dayCount: number,
): PressurePoint[] => {
  const start = startOfDay()
  start.setDate(start.getDate() + startDayOffset)
  const end = new Date(start)
  end.setDate(end.getDate() + dayCount)

  return points
    .filter(
      (point) =>
        point.timestamp >= start.getTime() && point.timestamp < end.getTime(),
    )
    .sort((a, b) => a.timestamp - b.timestamp)
}

const calcMaxDropInWindow = (
  points: PressurePoint[],
  windowMs: number,
): number => {
  if (points.length < 2) return 0

  let maxDrop = 0
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const elapsed = points[j].timestamp - points[i].timestamp
      if (elapsed > windowMs) break
      const drop = points[i].pressure - points[j].pressure
      if (drop > maxDrop) maxDrop = drop
    }
  }

  return maxDrop
}

export const calcTodayPressureRange = (points: PressurePoint[]): number => {
  const dayPoints = filterPointsForDay(points, 0)
  if (dayPoints.length < 2) return 0

  const pressures = dayPoints.map((p) => p.pressure)
  return Math.max(...pressures) - Math.min(...pressures)
}

export const calcForecastMaxDrop = (
  points: PressurePoint[],
  futureDays = 2,
): number =>
  calcMaxDropInWindow(
    filterPointsForDayRange(points, 1, futureDays),
    SIX_HOURS_MS,
  )

export const calcForecastDayPressureDrops = (
  points: PressurePoint[],
  futureDays = 2,
): Array<{ dayOffset: number; maxDrop: number }> =>
  Array.from({ length: futureDays }, (_, index) => {
    const dayOffset = index + 1
    return {
      dayOffset,
      maxDrop: calcMaxDropInWindow(
        filterPointsForDay(points, dayOffset),
        SIX_HOURS_MS,
      ),
    }
  })

export const getTodayPressureRangeText = (
  pressureRange: number,
  jmaWarnings: string[] = [],
): string => {
  if (jmaWarnings.length > 0) {
    return `注意報（${jmaWarnings.join('・')}）`
  }

  const value = `${pressureRange.toFixed(1)} hPa`
  if (pressureRange > PRESSURE_RANGE_THRESHOLD) {
    return `変動幅あり（${value}）`
  }
  return `変動幅は小さい（${value}）`
}

export const getForecastMaxDropText = (
  maxDrop: number,
  forecastDayWarnings: Array<{ date: string; warnings: string[] }> = [],
): string => {
  const alerts = forecastDayWarnings.flatMap((day) =>
    day.warnings.map((warning) => `${day.date} ${warning}`),
  )

  if (alerts.length > 0) {
    return `注意あり（${alerts.join('・')}）`
  }

  const value = `${maxDrop.toFixed(1)} hPa`
  if (maxDrop >= MAX_DROP_THRESHOLD) {
    return `急降下あり（${value}）`
  }
  return `急降下なし（${value}）`
}

const calcAvgSleepHours = (records: SleepRecord[]): number | null => {
  const recent = records.slice(0, 3)
  if (recent.length === 0) return null

  const totalHours = recent.reduce(
    (sum, record) => sum + record.minutesAsleep / 60,
    0,
  )
  return totalHours / recent.length
}

const calcActivityScore = (activity: ActivityData): number | null => {
  const { currentWeekSteps, last4WeeksSteps } = activity

  if (currentWeekSteps.length === 0 || last4WeeksSteps.length === 0) {
    return null
  }

  const currentWeekAverage =
    currentWeekSteps.reduce((a, b) => a + b, 0) / currentWeekSteps.length

  const baselineAverage =
    last4WeeksSteps.reduce((a, b) => a + b, 0) / last4WeeksSteps.length

  if (baselineAverage === 0) return null

  return Math.round((currentWeekAverage / baselineAverage) * 100) / 100
}

const evaluateHealthStatus = (
  avgSleepHours: number | null,
  activityScore: number | null,
  isDemoData: boolean,
): HealthStatus => {
  if (!isDemoData && (avgSleepHours === null || activityScore === null)) {
    return 'data_unavailable'
  }

  const sleepHours = avgSleepHours ?? 0
  const score = activityScore ?? 0

  const isHealthy =
    sleepHours >= MIN_HEALTHY_SLEEP_HOURS && score >= MIN_ACTIVITY_SCORE

  if (isHealthy) return 'healthy'
  if (sleepHours < MIN_HEALTHY_SLEEP_HOURS) return 'sleep_day'
  return 'activity_day'
}

const selectPomodoroMode = (
  todayPressureRange: number,
  forecastMaxDrop: number,
  jmaTodayWarnings: string[] = [],
  jmaForecastWarnings: string[] = [],
): PomodoroMode => {
  const isStable =
    todayPressureRange <= PRESSURE_RANGE_THRESHOLD &&
    forecastMaxDrop < MAX_DROP_THRESHOLD &&
    jmaTodayWarnings.length === 0 &&
    jmaForecastWarnings.length === 0

  return isStable ? 'optimal' : 'reduced'
}

export const getPomodoroConfig = (mode: PomodoroMode): PomodoroConfig =>
  POMODORO_CONFIGS[mode]

export const buildHealthSnapshot = (
  sleepRecords: SleepRecord[],
  activity: ActivityData,
  weather: WeatherInfo,
  isDemoData = false,
): HealthSnapshot => {
  const avgSleepHours = calcAvgSleepHours(sleepRecords) ?? 0
  const activityScore = calcActivityScore(activity)
  const status = evaluateHealthStatus(
    calcAvgSleepHours(sleepRecords),
    activityScore,
    isDemoData,
  )
  const jmaForecastLabels = [
    ...new Set(
      (weather.jmaForecastDayWarnings ?? []).flatMap((day) => day.warnings),
    ),
  ]

  const pomodoroMode =
    status === 'healthy'
      ? selectPomodoroMode(
          weather.pressureRange,
          weather.maxDrop,
          weather.jmaTodayWarnings ?? [],
          jmaForecastLabels,
        )
      : 'reduced'

  return {
    avgSleepHours,
    status,
    pomodoroMode,
    sleepRecords,
    weather,
    activity,
    isDemoData,
  }
}
