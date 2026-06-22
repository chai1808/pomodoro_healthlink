import { minutesToSeconds } from './utils'
import type { PomodoroConfig, TimerPhase } from '../types'

export type PhaseNotification = {
  endAt: number
  title: string
  body: string
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
    const isLastWork =
      currentPhase === 'work' && currentCycle >= config.cycles

    schedules.push({
      endAt,
      title:
        currentPhase === 'work'
          ? isLastWork
            ? 'セッション完了'
            : '休憩時間'
          : '作業時間',
      body:
        currentPhase === 'work'
          ? isLastWork
            ? '本日の学習セッションが完了しました'
            : `${config.breakMinutes}分間休憩します`
          : `${config.workMinutes}分間集中します`,
    })

    if (currentPhase === 'work') {
      if (isLastWork) break
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
