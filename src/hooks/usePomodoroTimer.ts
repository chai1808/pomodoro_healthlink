import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatElapsed, minutesToSeconds } from '../lib/utils'
import { playPhaseSwitchSound } from '../lib/sound'
import {
  cancelScheduledTimerNotifications,
  schedulePhaseNotifications,
  showTimerNotification,
} from '../lib/notifications'
import {
  incrementDailySession,
  isSessionLimitReached,
  loadDailyUsage,
} from '../lib/storage'
import {
  clearTimerState,
  saveTimerState,
} from '../lib/timerPersistence'
import { buildRemainingPhaseNotifications } from '../lib/timerSchedule'
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
  const phaseRef = useRef(phase)
  const cycleRef = useRef(cycle)
  const sessionStateRef = useRef(sessionState)
  const configRef = useRef(config)
  const isAdvancingRef = useRef(false)

  useEffect(() => {
    phaseRef.current = phase
    cycleRef.current = cycle
    sessionStateRef.current = sessionState
    configRef.current = config
  }, [phase, cycle, sessionState, config])

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

  const persistRunningState = useCallback(
    (nextPhase: TimerPhase, nextCycle: number, endAt: number) => {
      saveTimerState({
        sessionState: 'running',
        phase: nextPhase,
        cycle: nextCycle,
        endAt,
        configMode: config.mode,
        updatedAt: Date.now(),
      })
    },
    [config.mode],
  )

  const syncScheduledNotifications = useCallback(
    async (
      nextPhase: TimerPhase,
      nextCycle: number,
      secondsLeft: number,
    ) => {
      const schedules = buildRemainingPhaseNotifications(
        nextPhase,
        nextCycle,
        secondsLeft,
        config,
      )
      await schedulePhaseNotifications(schedules)
    },
    [config],
  )

  const startCountdown = useCallback(
    (seconds: number, nextPhase: TimerPhase, nextCycle: number) => {
      clearTimer()
      const endAt = Date.now() + seconds * 1000
      endAtRef.current = endAt
      setRemainingSeconds(seconds)
      persistRunningState(nextPhase, nextCycle, endAt)
      void syncScheduledNotifications(nextPhase, nextCycle, seconds)

      intervalRef.current = setInterval(() => {
        if (!endAtRef.current) return

        const left = Math.max(
          0,
          Math.ceil((endAtRef.current - Date.now()) / 1000),
        )
        setRemainingSeconds(left)

        if (left <= 0) {
          clearTimer()
        }
      }, 200)
    },
    [clearTimer, persistRunningState, syncScheduledNotifications],
  )

  const completeSession = useCallback(() => {
    incrementDailySession()
    const usage = loadDailyUsage()
    void cancelScheduledTimerNotifications()
    clearTimerState()
    endAtRef.current = null
    setPhase('work')
    setCycle(1)
    setSessionState('completed')
    setIsLimitReached(usage.completedSessions >= config.maxSessionsPerDay)
    setRemainingSeconds(workSeconds)
  }, [config.maxSessionsPerDay, workSeconds])

  const advancePhase = useCallback(async () => {
    if (isAdvancingRef.current) return
    isAdvancingRef.current = true

    try {
      const currentPhase = phaseRef.current
      const currentCycle = cycleRef.current
      const currentConfig = configRef.current

      await playPhaseSwitchSound()

      if (currentPhase === 'work') {
        await showTimerNotification(
          '休憩時間',
          `${currentConfig.breakMinutes}分間休憩します`,
        )
        setPhase('break')
        setSessionState('running')
        startCountdown(breakSeconds, 'break', currentCycle)
        return
      }

      const nextCycle = currentCycle + 1
      if (nextCycle > currentConfig.cycles) {
        await showTimerNotification(
          'セッション完了',
          '本日の学習セッションが完了しました',
        )
        completeSession()
        return
      }

      await showTimerNotification(
        '作業時間',
        `${currentConfig.workMinutes}分間集中します`,
      )
      setPhase('work')
      setCycle(nextCycle)
      setSessionState('running')
      startCountdown(workSeconds, 'work', nextCycle)
    } finally {
      isAdvancingRef.current = false
    }
  }, [breakSeconds, completeSession, startCountdown, workSeconds])

  const syncFromWallClock = useCallback(async () => {
    if (sessionStateRef.current !== 'running' || !endAtRef.current) return

    const left = Math.max(
      0,
      Math.ceil((endAtRef.current - Date.now()) / 1000),
    )
    setRemainingSeconds(left)

    if (left > 0) return

    endAtRef.current = null
    await advancePhase()
  }, [advancePhase])

  useEffect(() => {
    if (sessionState !== 'running' || remainingSeconds > 0) return
    void advancePhase()
  }, [sessionState, remainingSeconds, advancePhase])

  useEffect(() => {
    const handleResume = () => {
      if (document.visibilityState === 'hidden') return
      void syncFromWallClock()
    }

    document.addEventListener('visibilitychange', handleResume)
    window.addEventListener('focus', handleResume)
    window.addEventListener('pageshow', handleResume)

    return () => {
      document.removeEventListener('visibilitychange', handleResume)
      window.removeEventListener('focus', handleResume)
      window.removeEventListener('pageshow', handleResume)
    }
  }, [syncFromWallClock])

  useEffect(() => () => clearTimer(), [clearTimer])

  useLayoutEffect(() => {
    if (sessionState === 'running' || sessionState === 'paused') return

    clearTimer()
    endAtRef.current = null
    void cancelScheduledTimerNotifications()
    clearTimerState()
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
    const seconds =
      remainingSeconds > 0 ? remainingSeconds : getPhaseSeconds(phase)
    startCountdown(seconds, phase, cycle)
  }, [
    enabled,
    isLimitReached,
    remainingSeconds,
    getPhaseSeconds,
    phase,
    cycle,
    startCountdown,
  ])

  const handlePause = useCallback(() => {
    if (sessionState !== 'running') return
    clearTimer()
    endAtRef.current = null
    void cancelScheduledTimerNotifications()
    saveTimerState({
      sessionState: 'paused',
      phase,
      cycle,
      endAt: null,
      configMode: config.mode,
      updatedAt: Date.now(),
    })
    setSessionState('paused')
  }, [sessionState, clearTimer, phase, cycle, config.mode])

  const handleResume = useCallback(() => {
    if (sessionState !== 'paused') return
    setSessionState('running')
    startCountdown(remainingSeconds, phase, cycle)
  }, [sessionState, remainingSeconds, phase, cycle, startCountdown])

  const handleReset = useCallback(() => {
    clearTimer()
    endAtRef.current = null
    void cancelScheduledTimerNotifications()
    clearTimerState()
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
