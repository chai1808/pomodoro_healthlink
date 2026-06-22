import { STORAGE_KEYS } from './constants'
import type { PomodoroConfig, SessionState, TimerPhase } from '../types'

export type PersistedTimerState = {
  sessionState: SessionState
  phase: TimerPhase
  cycle: number
  endAt: number | null
  configMode: PomodoroConfig['mode']
  updatedAt: number
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

export const clearTimerState = (): void => {
  localStorage.removeItem(STORAGE_KEYS.timerState)
}
