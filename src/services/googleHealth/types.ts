export type OAuthCallbackResult =
  | { ok: true }
  | { ok: false; message: string }

export type CivilDate = { year?: number; month?: number; day?: number }
export type CivilTime = { hours?: number; minutes?: number }
export type CivilDateTime = { date?: CivilDate; time?: CivilTime }

export type HealthSleepPoint = {
  sleep?: {
    interval?: {
      startTime?: string
      endTime?: string
      civilStartTime?: CivilDateTime
      civilEndTime?: CivilDateTime
    }
    summary?: { minutesAsleep?: string }
  }
}

export type HealthStepsRollup = {
  rollupDataPoints?: Array<{
    civilStartTime?: CivilDateTime
    steps?: { countSum?: string }
  }>
}
