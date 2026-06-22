import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatElapsed, minutesToSeconds } from '../lib/formatTime'
import { playPhaseSwitchSound } from '../lib/sound'
import { showTimerNotification } from '../lib/notifications'
import {
  incrementDailySession,
  isSessionLimitReached,
  loadDailyUsage,
} from '../lib/storage'
import type { PomodoroConfig, SessionState, TimerPhase } from '../types'

type UsePomodoroTimerOptions = {
  config: PomodoroConfig
  enabled: boolean
}

export const usePomodoroTimer = ({ config, enabled }: UsePomodoroTimerOptions) => {
  const workSeconds = minutesToSeconds(config.workMinutes)
  const breakSeconds = minutesToSeconds(config.breakMinutes)

  const [phase, setPhase] = useState<TimerPhase>('work')
  const [cycle, setCycle] = useState(1)
  const [remainingSeconds, setRemainingSeconds] = useState(workSeconds)
  const [sessionState, setSessionState] = useState<SessionState>('idle')
  const [isLimitReached, setIsLimitReached] = useState(
    () => isSessionLimitReached(config.maxSessionsPerDay),
  )

  const endAtRef = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const getPhaseSeconds = useCallback(
    (targetPhase: TimerPhase) =>
      targetPhase === 'work' ? workSeconds : breakSeconds,
    [workSeconds, breakSeconds],
  )

  const startCountdown = useCallback(
    (seconds: number) => {
      clearTimer()
      endAtRef.current = Date.now() + seconds * 1000
      setRemainingSeconds(seconds)

      intervalRef.current = setInterval(() => {
        if (!endAtRef.current) return

        const left = Math.max(
          0,
          Math.ceil((endAtRef.current - Date.now()) / 1000),
        )
        setRemainingSeconds(left)

        if (left <= 0) {
          clearTimer()
          endAtRef.current = null
        }
      }, 200)
    },
    [clearTimer],
  )

  const handlePhaseComplete = useCallback(async () => {
    await playPhaseSwitchSound()

    if (phase === 'work') {
      showTimerNotification('休憩時間', `${config.breakMinutes}分間休憩します`)
      setPhase('break')
      setSessionState('running')
      startCountdown(breakSeconds)
      return
    }

    const nextCycle = cycle + 1
    if (nextCycle > config.cycles) {
      incrementDailySession()
      const usage = loadDailyUsage()
      showTimerNotification('セッション完了', '本日の学習セッションが完了しました')
      setPhase('work')
      setCycle(1)
      setSessionState('completed')
      setIsLimitReached(usage.completedSessions >= config.maxSessionsPerDay)
      setRemainingSeconds(workSeconds)
      return
    }

    showTimerNotification('作業時間', `${config.workMinutes}分間集中します`)
    setPhase('work')
    setCycle(nextCycle)
    setSessionState('running')
    startCountdown(workSeconds)
  }, [
    phase,
    cycle,
    config.breakMinutes,
    config.cycles,
    config.maxSessionsPerDay,
    config.workMinutes,
    breakSeconds,
    workSeconds,
    startCountdown,
  ])

  useEffect(() => {
    if (sessionState !== 'running' || remainingSeconds > 0) return
    handlePhaseComplete()
  }, [sessionState, remainingSeconds, handlePhaseComplete])

  useEffect(() => {
    const syncOnVisible = () => {
      if (document.visibilityState !== 'visible' || !endAtRef.current) return
      const left = Math.max(
        0,
        Math.ceil((endAtRef.current - Date.now()) / 1000),
      )
      setRemainingSeconds(left)
    }
    document.addEventListener('visibilitychange', syncOnVisible)
    return () => document.removeEventListener('visibilitychange', syncOnVisible)
  }, [])

  useEffect(() => () => clearTimer(), [clearTimer])

  useLayoutEffect(() => {
    if (sessionState === 'running' || sessionState === 'paused') return

    clearTimer()
    endAtRef.current = null
    setPhase('work')
    setCycle(1)
    setRemainingSeconds(workSeconds)
    setIsLimitReached(isSessionLimitReached(config.maxSessionsPerDay))
  }, [
    config.mode,
    workSeconds,
    config.cycles,
    config.maxSessionsPerDay,
    clearTimer,
    sessionState,
  ])

  const handleStart = useCallback(() => {
    if (!enabled || isLimitReached) return
    setSessionState('running')
    startCountdown(remainingSeconds > 0 ? remainingSeconds : getPhaseSeconds(phase))
  }, [enabled, isLimitReached, remainingSeconds, getPhaseSeconds, phase, startCountdown])

  const handlePause = useCallback(() => {
    if (sessionState !== 'running') return
    clearTimer()
    endAtRef.current = null
    setSessionState('paused')
  }, [sessionState, clearTimer])

  const handleResume = useCallback(() => {
    if (sessionState !== 'paused') return
    setSessionState('running')
    startCountdown(remainingSeconds)
  }, [sessionState, remainingSeconds, startCountdown])

  const handleReset = useCallback(() => {
    clearTimer()
    endAtRef.current = null
    setPhase('work')
    setCycle(1)
    setRemainingSeconds(workSeconds)
    setSessionState('idle')
    setIsLimitReached(isSessionLimitReached(config.maxSessionsPerDay))
  }, [clearTimer, config.maxSessionsPerDay, workSeconds])

  const totalSeconds = getPhaseSeconds(phase)
  const progress =
    totalSeconds > 0 ? (totalSeconds - remainingSeconds) / totalSeconds : 0

  return {
    phase,
    cycle,
    totalCycles: config.cycles,
    displayTime: formatElapsed(remainingSeconds),
    sessionState,
    isLimitReached,
    progress,
    handleStart,
    handlePause,
    handleResume,
    handleReset,
  }
}
