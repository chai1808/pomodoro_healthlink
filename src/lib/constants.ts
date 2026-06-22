export const MIN_HEALTHY_SLEEP_HOURS = 7
export const MIN_ACTIVITY_SCORE = 0.7

export const PRESSURE_RANGE_THRESHOLD = 4
export const MAX_DROP_THRESHOLD = 4

export const POMODORO_CONFIGS = {
  optimal: {
    mode: 'optimal' as const,
    workMinutes: 25,
    breakMinutes: 5,
    cycles: 6,
    maxSessionsPerDay: 2,
    workBorderColor: '#2a2a2a',
    breakBorderColor: '#7ecfc4',
  },
  reduced: {
    mode: 'reduced' as const,
    workMinutes: 15,
    breakMinutes: 5,
    cycles: 3,
    maxSessionsPerDay: 1,
    workBorderColor: '#2a2a2a',
    breakBorderColor: '#c4a574',
  },
} as const

export const STORAGE_KEYS = {
  fitbitToken: 'healthlink_fitbit_token',
  dailyUsage: 'healthlink_daily_usage',
  pkceVerifier: 'healthlink_pkce_verifier',
} as const
