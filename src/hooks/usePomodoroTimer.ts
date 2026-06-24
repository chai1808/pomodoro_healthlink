import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatElapsed, minutesToSeconds } from '../lib/utils'
import { startWorkWhiteNoise, stopWorkWhiteNoise } from '../lib/sound'
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
  resolveRestoredTimerState,
  saveTimerState,
} from '../lib/timerPersistence'
import { buildRemainingPhaseNotifications, catchUpTimerFromWallClock, getPhaseEndNotificationCopy, getPhaseStartNotificationCopy } from '../lib/timerSchedule'
import type { PomodoroConfig, SessionState, TimerPhase } from '../types'

type UsePomodoroTimerOptions = {
  config: PomodoroConfig
  enabled: boolean
}

const createInitialTimerState = (
  config: PomodoroConfig,
  workSeconds: number,
  breakSeconds: number,
) => {
  const restored = resolveRestoredTimerState(
    config,
    workSeconds,
    breakSeconds,
  )

  if (restored) return restored

  return {
    phase: 'work' as TimerPhase,
    cycle: 1,
    remainingSeconds: workSeconds,
    sessionState: 'idle' as SessionState,
    endAt: null as number | null,
  }
}

export const usePomodoroTimer = ({ config, enabled }: UsePomodoroTimerOptions) => {
  const workSeconds = minutesToSeconds(config.workMinutes)
  const breakSeconds = minutesToSeconds(config.breakMinutes)

  const initialStateRef = useRef(
    createInitialTimerState(config, workSeconds, breakSeconds),
  )
  const initialState = initialStateRef.current
  const shouldResumeOnMount =
    initialState.sessionState === 'running' && initialState.endAt !== null

  const [phase, setPhase] = useState<TimerPhase>(initialState.phase)
  const [cycle, setCycle] = useState(initialState.cycle)
  const [remainingSeconds, setRemainingSeconds] = useState(
    initialState.remainingSeconds,
  )
  const [sessionState, setSessionState] = useState<SessionState>(
    initialState.sessionState,
  )
  const [isLimitReached, setIsLimitReached] = useState(
    () => isSessionLimitReached(config.maxSessionsPerDay),
  )

  const endAtRef = useRef<number | null>(initialState.endAt)
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

  const startTicking = useCallback(() => {
    clearTimer()
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
  }, [clearTimer])

  const applyRunningTimer = useCallback(
    (nextPhase: TimerPhase, nextCycle: number, endAt: number) => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      endAtRef.current = endAt
      setPhase(nextPhase)
      setCycle(nextCycle)
      setSessionState('running')
      setRemainingSeconds(left)
      persistRunningState(nextPhase, nextCycle, endAt)
      void syncScheduledNotifications(nextPhase, nextCycle, left)
      startTicking()
    },
    [persistRunningState, syncScheduledNotifications, startTicking],
  )

  const startCountdown = useCallback(
    (seconds: number, nextPhase: TimerPhase, nextCycle: number) => {
      applyRunningTimer(nextPhase, nextCycle, Date.now() + seconds * 1000)
    },
    [applyRunningTimer],
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

      if (currentPhase === 'work') {
        const copy = getPhaseEndNotificationCopy('work', currentCycle, currentConfig)
        await showTimerNotification(copy.title, copy.body)
        startCountdown(breakSeconds, 'break', currentCycle)
        return
      }

      const nextCycle = currentCycle + 1
      if (nextCycle > currentConfig.cycles) {
        const copy = getPhaseEndNotificationCopy('work', currentCycle, currentConfig)
        await showTimerNotification(copy.title, copy.body)
        completeSession()
        return
      }

      const copy = getPhaseEndNotificationCopy('break', currentCycle, currentConfig)
      await showTimerNotification(copy.title, copy.body)
      startCountdown(workSeconds, 'work', nextCycle)
    } finally {
      isAdvancingRef.current = false
    }
  }, [breakSeconds, completeSession, startCountdown, workSeconds])

  const syncFromWallClock = useCallback(async () => {
    if (sessionStateRef.current !== 'running' || !endAtRef.current) return
    if (isAdvancingRef.current) return
    isAdvancingRef.current = true

    try {
      const beforePhase = phaseRef.current
      const beforeCycle = cycleRef.current
      const currentConfig = configRef.current

      const result = catchUpTimerFromWallClock(
        beforePhase,
        beforeCycle,
        endAtRef.current,
        currentConfig,
        workSeconds,
        breakSeconds,
      )

      if (result.status === 'completed') {
        const copy = getPhaseEndNotificationCopy('work', beforeCycle, currentConfig)
        await showTimerNotification(copy.title, copy.body)
        completeSession()
        return
      }

      const phaseChanged =
        result.phase !== beforePhase || result.cycle !== beforeCycle

      if (phaseChanged) {
        const copy = getPhaseStartNotificationCopy(result.phase, currentConfig)
        await showTimerNotification(copy.title, copy.body)
      }

      applyRunningTimer(result.phase, result.cycle, result.endAt)
    } finally {
      isAdvancingRef.current = false
    }
  }, [applyRunningTimer, breakSeconds, completeSession, workSeconds])

  const hasResumedOnMountRef = useRef(false)

  useLayoutEffect(() => {
    if (!shouldResumeOnMount || hasResumedOnMountRef.current) return
    hasResumedOnMountRef.current = true
    void syncFromWallClock()
  }, [shouldResumeOnMount, syncFromWallClock])

  useEffect(() => {
    if (shouldResumeOnMount && !hasResumedOnMountRef.current) return
    if (sessionState !== 'running' || remainingSeconds > 0) return
    void advancePhase()
  }, [sessionState, remainingSeconds, advancePhase, shouldResumeOnMount])

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

  useEffect(() => {
    const shouldPlayWhiteNoise = sessionState === 'running' && phase === 'work'

    if (shouldPlayWhiteNoise) {
      void startWorkWhiteNoise()
    } else {
      stopWorkWhiteNoise()
    }
  }, [phase, sessionState])

  const configSnapshotRef = useRef('')

  useLayoutEffect(() => {
    if (sessionState === 'running' || sessionState === 'paused') return

    const snapshot = `${config.mode}:${workSeconds}:${config.cycles}:${config.maxSessionsPerDay}`
    if (snapshot === configSnapshotRef.current && sessionState !== 'completed') {
      return
    }
    configSnapshotRef.current = snapshot

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
      remainingSeconds,
      configMode: config.mode,
      updatedAt: Date.now(),
    })
    setSessionState('paused')
  }, [sessionState, clearTimer, phase, cycle, remainingSeconds, config.mode])

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
