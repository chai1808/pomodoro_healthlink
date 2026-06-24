export const MIN_ACTIVITY_SCORE = 0.7
export const SLEEP_RECENT_DAYS = 8

export const PRESSURE_RANGE_THRESHOLD = 4
export const MAX_DROP_THRESHOLD = 4

export const POMODORO_COLORS = {
  BACKGROUND_BORDER_COLOR: '#1E293B',
  WORK_BORDER_COLOR: '#7ecfc4',
  BREAK_BORDER_COLOR:'#c4a574',
}

export const POMODORO_CONFIGS = {
  optimal: {
    mode: 'optimal' as const,
    // workMinutes: 90,
    // breakMinutes: 30,
    workMinutes: 3,
    breakMinutes: 1,
    cycles: 2,
    maxSessionsPerDay: 2
  },
  reduced: {
    mode: 'reduced' as const,
    workMinutes: 25,
    breakMinutes: 5,
    cycles: 4,
    maxSessionsPerDay: 1
  },
} as const

export const STORAGE_KEYS = {
  googleHealthAccessToken: 'healthlink_google_health_access_token',
  googleHealthRefreshToken: 'healthlink_google_health_refresh_token',
  oauthProcessedCode: 'healthlink_oauth_processed_code',
  dailyUsage: 'healthlink_daily_usage',
  timerState: 'healthlink_timer_state',
  pkceVerifier: 'healthlink_pkce_verifier',
  userLocation: 'healthlink_user_location',
} as const
