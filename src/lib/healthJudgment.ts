import {
  MIN_ACTIVITY_SCORE,
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
): number => {
  let maxDrop = 0
  for (let dayOffset = 1; dayOffset <= futureDays; dayOffset++) {
    maxDrop = Math.max(
      maxDrop,
      calcMaxDropInWindow(filterPointsForDay(points, dayOffset), SIX_HOURS_MS),
    )
  }
  return maxDrop
}

export const getTodayPressureRangeText = (
  pressureRange: number,
  jmaWarnings: string[] = [],
): string => {
  if (jmaWarnings.length > 0) {
    return `注意報（${jmaWarnings.join('・')}）`
  }

  const value = `${pressureRange.toFixed(1)} hPa`
  if (pressureRange >= PRESSURE_RANGE_THRESHOLD) {
    return `変動幅 ${value}（4.0 hPa 以上）`
  }
  return `変動幅 ${value}（4.0 hPa 未満）`
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

const SLEEP_BASELINE_DAYS = 7

const calcTodaySleepRatio = (records: SleepRecord[]): number | null => {
  const sleepByDate = new Map<string, number>()

  for (const record of records) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) continue
    sleepByDate.set(record.date, record.minutesAsleep / 60)
  }

  const today = startOfDay()
  const todayKey = isoDate(today)
  const todayHours = sleepByDate.get(todayKey) ?? 0

  const hasSleepHistory = [...sleepByDate.values()].some((hours) => hours > 0)
  if (!hasSleepHistory) return null

  const past7Days: number[] = []
  for (let offset = 1; offset <= SLEEP_BASELINE_DAYS; offset += 1) {
    const key = isoDate(addDays(today, -offset))
    past7Days.push(sleepByDate.get(key) ?? 0)
  }

  if (past7Days.length < SLEEP_BASELINE_DAYS) return null

  const average =
    past7Days.reduce((sum, hours) => sum + hours, 0) / past7Days.length

  if (average === 0) return null

  return Math.round((todayHours / average) * 100) / 100
}

const calcDisplayAvgSleepHours = (records: SleepRecord[]): number => {
  const today = isoDate(startOfDay())
  const recent = records
    .filter(
      (record) =>
        /^\d{4}-\d{2}-\d{2}$/.test(record.date) &&
        record.date <= today &&
        record.minutesAsleep > 0,
    )
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 8)

  if (recent.length === 0) return 0

  return (
    recent.reduce((sum, record) => sum + record.minutesAsleep / 60, 0) /
    recent.length
  )
}

const isoDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const calcYesterdayStepRatio = (activity: ActivityData): number | null => {
  const stepByDate = new Map<string, number>()

  for (const day of activity.dailySteps) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) continue
    stepByDate.set(day.date, day.steps)
  }

  const today = startOfDay()
  const yesterdayKey = isoDate(addDays(today, -1))
  const yesterdaySteps = stepByDate.get(yesterdayKey) ?? 0

  const hasStepHistory = [...stepByDate.values()].some((steps) => steps > 0)
  if (!hasStepHistory) return null

  const past7Days: Array<{ date: string; steps: number }> = []
  for (let offset = 2; offset <= 8; offset += 1) {
    const key = isoDate(addDays(today, -offset))
    past7Days.push({ date: key, steps: stepByDate.get(key) ?? 0 })
  }

  if (past7Days.length < 7) return null

  const sortedBySteps = [...past7Days].sort((left, right) => left.steps - right.steps)
  const trimmedDays = sortedBySteps.slice(1, -1)

  const trimmedAverage =
    trimmedDays.reduce((sum, day) => sum + day.steps, 0) / trimmedDays.length

  if (trimmedAverage === 0) return null

  return Math.round((yesterdaySteps / trimmedAverage) * 100) / 100
}

const evaluateHealthStatus = (
  sleepRatio: number | null,
  stepRatio: number | null,
): HealthStatus => {
  if (sleepRatio === null || stepRatio === null) {
    return 'data_unavailable'
  }

  if (sleepRatio >= MIN_ACTIVITY_SCORE && stepRatio >= MIN_ACTIVITY_SCORE) {
    return 'healthy'
  }

  if (sleepRatio < MIN_ACTIVITY_SCORE) {
    return 'sleep_day'
  }

  return 'activity_day'
}

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

const selectPomodoroMode = (todayPressureRange: number): PomodoroMode =>
  todayPressureRange < PRESSURE_RANGE_THRESHOLD ? 'optimal' : 'reduced'

export const getPomodoroConfig = (mode: PomodoroMode): PomodoroConfig =>
  POMODORO_CONFIGS[mode]

export const buildHealthSnapshot = (
  sleepRecords: SleepRecord[],
  activity: ActivityData,
  weather: WeatherInfo,
): HealthSnapshot => {
  const sleepRatio = calcTodaySleepRatio(sleepRecords)
  const stepRatio = calcYesterdayStepRatio(activity)
  const status = evaluateHealthStatus(sleepRatio, stepRatio)

  const pomodoroMode =
    status === 'healthy'
      ? selectPomodoroMode(weather.pressureRange)
      : 'reduced'

  return {
    avgSleepHours: calcDisplayAvgSleepHours(sleepRecords),
    status,
    pomodoroMode,
    sleepRecords,
    weather,
    activity,
  }
}
