import { minutesToSeconds } from './utils'
import type { PomodoroConfig, TimerPhase } from '../types'

export type CatchUpResult =
  | { status: 'running'; phase: TimerPhase; cycle: number; endAt: number; remainingSeconds: number }
  | { status: 'completed' }

export type PhaseAudioSchedule = {
  phase: TimerPhase
  endAt: number
}

export const catchUpTimerFromWallClock = (
  phase: TimerPhase,
  cycle: number,
  endAt: number,
  config: PomodoroConfig,
  workSeconds: number,
  breakSeconds: number,
  now = Date.now(),
): CatchUpResult => {
  const breakMs = breakSeconds * 1000
  const workMs = workSeconds * 1000
  let currentPhase = phase
  let currentCycle = cycle
  let currentEndAt = endAt

  while (now >= currentEndAt) {
    if (currentPhase === 'work') {
      if (currentCycle >= config.cycles) {
        return { status: 'completed' }
      }
      currentPhase = 'break'
      currentEndAt += breakMs
      continue
    }

    currentCycle += 1
    currentPhase = 'work'
    currentEndAt += workMs
  }

  return {
    status: 'running',
    phase: currentPhase,
    cycle: currentCycle,
    endAt: currentEndAt,
    remainingSeconds: Math.max(0, Math.ceil((currentEndAt - now) / 1000)),
  }
}

export const buildRemainingPhaseAudioSchedule = (
  phase: TimerPhase,
  cycle: number,
  remainingSeconds: number,
  config: PomodoroConfig,
): PhaseAudioSchedule[] => {
  const schedules: PhaseAudioSchedule[] = []
  let endAt = Date.now() + remainingSeconds * 1000
  let currentPhase = phase
  let currentCycle = cycle
  const breakMs = minutesToSeconds(config.breakMinutes) * 1000
  const workMs = minutesToSeconds(config.workMinutes) * 1000

  while (true) {
    schedules.push({ phase: currentPhase, endAt })

    if (currentPhase === 'work') {
      if (currentCycle >= config.cycles) break
      currentPhase = 'break'
      endAt += breakMs
      continue
    }

    currentCycle += 1
    currentPhase = 'work'
    endAt += workMs
  }

  return schedules
}
