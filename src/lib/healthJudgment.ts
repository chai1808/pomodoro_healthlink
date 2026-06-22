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

const calcAvgSleepHours = (records: SleepRecord[]): number | null => {
  const recent = records.slice(0, 3)
  if (recent.length === 0) return null

  const totalHours = recent.reduce(
    (sum, record) => sum + record.minutesAsleep / 60,
    0,
  )
  return totalHours / recent.length
}

const isoDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const calcYesterdayStepRatio = (activity: ActivityData): number | null => {
  const sorted = activity.dailySteps
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date))
    .sort((left, right) => left.date.localeCompare(right.date))

  const today = isoDate(new Date())
  const completedDays = sorted.filter((day) => day.date < today)

  if (completedDays.length < 7) return null

  const yesterday = completedDays[completedDays.length - 1]
  const past6Days = completedDays.slice(-7, -1)

  if (past6Days.length < 6) return null

  const past6Average =
    past6Days.reduce((sum, day) => sum + day.steps, 0) / past6Days.length

  if (past6Average === 0) return null

  return Math.round((yesterday.steps / past6Average) * 100) / 100
}

const evaluateHealthStatus = (
  avgSleepHours: number | null,
  stepRatio: number | null,
): HealthStatus => {
  if (avgSleepHours === null || stepRatio === null) {
    return 'data_unavailable'
  }

  if (avgSleepHours >= MIN_HEALTHY_SLEEP_HOURS && stepRatio >= MIN_ACTIVITY_SCORE) {
    return 'healthy'
  }

  if (avgSleepHours <= MIN_HEALTHY_SLEEP_HOURS) {
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
  const avgSleepHours = calcAvgSleepHours(sleepRecords)
  const stepRatio = calcYesterdayStepRatio(activity)
  const status = evaluateHealthStatus(avgSleepHours, stepRatio)

  const pomodoroMode =
    status === 'healthy'
      ? selectPomodoroMode(weather.pressureRange)
      : 'reduced'

  return {
    avgSleepHours: avgSleepHours ?? 0,
    status,
    pomodoroMode,
    sleepRecords,
    weather,
    activity,
  }
}
