import { minutesToSeconds } from './utils'
import type { PomodoroConfig, TimerPhase } from '../types'

export type PhaseNotification = {
  endAt: number
  title: string
  body: string
}

export type CatchUpResult =
  | { status: 'running'; phase: TimerPhase; cycle: number; endAt: number; remainingSeconds: number }
  | { status: 'completed' }

export const getPhaseEndNotificationCopy = (
  endingPhase: TimerPhase,
  cycle: number,
  config: PomodoroConfig,
): { title: string; body: string } => {
  if (endingPhase === 'work') {
    if (cycle >= config.cycles) {
      return {
        title: 'セッション完了',
        body: '本日の学習セッションが完了しました',
      }
    }
    return {
      title: '休憩時間',
      body: `${config.breakMinutes}分間休憩します`,
    }
  }

  return {
    title: '作業時間',
    body: `${config.workMinutes}分間集中します`,
  }
}

export const getPhaseStartNotificationCopy = (
  phase: TimerPhase,
  config: PomodoroConfig,
): { title: string; body: string } => {
  if (phase === 'break') {
    return {
      title: '休憩時間',
      body: `${config.breakMinutes}分間休憩します`,
    }
  }

  return {
    title: '作業時間',
    body: `${config.workMinutes}分間集中します`,
  }
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

export const buildRemainingPhaseNotifications = (
  phase: TimerPhase,
  cycle: number,
  remainingSeconds: number,
  config: PomodoroConfig,
): PhaseNotification[] => {
  const schedules: PhaseNotification[] = []
  let endAt = Date.now() + remainingSeconds * 1000
  let currentPhase = phase
  let currentCycle = cycle
  const breakMs = minutesToSeconds(config.breakMinutes) * 1000
  const workMs = minutesToSeconds(config.workMinutes) * 1000

  while (true) {
    const copy = getPhaseEndNotificationCopy(currentPhase, currentCycle, config)

    schedules.push({
      endAt,
      title: copy.title,
      body: copy.body,
    })

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
