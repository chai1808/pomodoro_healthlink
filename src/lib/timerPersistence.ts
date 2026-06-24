import { STORAGE_KEYS } from './constants'
import type { PomodoroConfig, SessionState, TimerPhase } from '../types'

export type PersistedTimerState = {
  sessionState: SessionState
  phase: TimerPhase
  cycle: number
  endAt: number | null
  remainingSeconds?: number
  configMode: PomodoroConfig['mode']
  updatedAt: number
}

export type RestoredTimerState = {
  phase: TimerPhase
  cycle: number
  remainingSeconds: number
  sessionState: Extract<SessionState, 'running' | 'paused'>
  endAt: number | null
}

export const saveTimerState = (state: PersistedTimerState): void => {
  localStorage.setItem(STORAGE_KEYS.timerState, JSON.stringify(state))
}

export const loadTimerState = (): PersistedTimerState | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.timerState)
    if (!raw) return null
    return JSON.parse(raw) as PersistedTimerState
  } catch {
    return null
  }
}

export const resolveRestoredTimerState = (
  config: PomodoroConfig,
  workSeconds: number,
  breakSeconds: number,
): RestoredTimerState | null => {
  const persisted = loadTimerState()
  if (!persisted) return null

  if (persisted.configMode !== config.mode) {
    clearTimerState()
    return null
  }

  if (persisted.cycle < 1 || persisted.cycle > config.cycles) {
    clearTimerState()
    return null
  }

  const phaseSeconds =
    persisted.phase === 'work' ? workSeconds : breakSeconds

  if (persisted.sessionState === 'running' && persisted.endAt) {
    const remainingSeconds = Math.max(
      0,
      Math.ceil((persisted.endAt - Date.now()) / 1000),
    )

    return {
      phase: persisted.phase,
      cycle: persisted.cycle,
      remainingSeconds,
      sessionState: 'running',
      endAt: persisted.endAt,
    }
  }

  if (persisted.sessionState === 'paused') {
    const remainingSeconds = Math.min(
      Math.max(0, persisted.remainingSeconds ?? phaseSeconds),
      phaseSeconds,
    )

    return {
      phase: persisted.phase,
      cycle: persisted.cycle,
      remainingSeconds,
      sessionState: 'paused',
      endAt: null,
    }
  }

  return null
}

export const clearTimerState = (): void => {
  localStorage.removeItem(STORAGE_KEYS.timerState)
}
