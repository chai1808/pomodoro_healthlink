import type { PomodoroConfig, TimerPhase } from '../types'

export type CatchUpResult =
  | { status: 'running'; phase: TimerPhase; cycle: number; endAt: number; remainingSeconds: number }
  | { status: 'completed' }

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
