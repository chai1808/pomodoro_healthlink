export type HealthStatus = 'healthy' | 'sleep_day' | 'activity_day'

export type PomodoroMode = 'optimal' | 'reduced'

export type TimerPhase = 'work' | 'break'

export type SessionState = 'idle' | 'running' | 'paused' | 'completed'

export type SleepRecord = {
  date: string
  sleepStart: string
  wakeTime: string
  minutesAsleep: number
}

export type PressurePoint = {
  time: string
  pressure: number
  timestamp: number
}

export type WeatherInfo = {
  description: string
  icon: string
  temp: number
  humidity: number
  pressureRange: number
  maxDrop: number
  pressureWave3Days: PressurePoint[]
  pressureCurrentIndex: number
  pressureDayBoundaries: number[]
  isMockData?: boolean
  mockReason?: string
  jmaHeadline?: string
  jmaTodayWarnings?: string[]
  jmaForecastDayWarnings?: Array<{ date: string; warnings: string[] }>
}

export type DailySteps = {
  date: string
  steps: number
}

export type ActivityData = {
  currentWeekSteps: number[]
  last4WeeksSteps: number[]
  dailySteps: DailySteps[]
}

export type HealthSnapshot = {
  avgSleepHours: number
  activityScore: number
  status: HealthStatus
  pomodoroMode: PomodoroMode
  sleepRecords: SleepRecord[]
  weather: WeatherInfo
  activity: ActivityData
}

export type PomodoroConfig = {
  mode: PomodoroMode
  workMinutes: number
  breakMinutes: number
  cycles: number
  maxSessionsPerDay: number
  workBorderColor: string
  breakBorderColor: string
}

export type DailyUsage = {
  date: string
  completedSessions: number
}
