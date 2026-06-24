import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatElapsed, minutesToSeconds } from '../lib/utils'
import { startWorkWhiteNoise, stopWorkWhiteNoise, setAudioMuted, syncImmediatePhaseAudio } from '../lib/sound'
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
import { catchUpTimerFromWallClock } from '../lib/timerSchedule'
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

  const [initialState] = useState(() =>
    createInitialTimerState(config, workSeconds, breakSeconds),
  )
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
  const [isMuted, setIsMuted] = useState(false)

  const endAtRef = useRef<number | null>(initialState.endAt)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wallClockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phaseRef = useRef(phase)
  const cycleRef = useRef(cycle)
  const sessionStateRef = useRef(sessionState)
  const configRef = useRef(config)
  const isMutedRef = useRef(isMuted)
  const isAdvancingRef = useRef(false)
  const shouldPauseAtNextWorkRef = useRef(false)
  const syncAllFromWallClockRef = useRef<() => void>(() => {})

  useEffect(() => {
    phaseRef.current = phase
    cycleRef.current = cycle
    sessionStateRef.current = sessionState
    configRef.current = config
    isMutedRef.current = isMuted
  }, [phase, cycle, sessionState, config, isMuted])

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const clearWallClockTimer = useCallback(() => {
    if (wallClockTimerRef.current) {
      clearTimeout(wallClockTimerRef.current)
      wallClockTimerRef.current = null
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
      phaseRef.current = nextPhase
      cycleRef.current = nextCycle
      sessionStateRef.current = 'running'
      setPhase(nextPhase)
      setCycle(nextCycle)
      setSessionState('running')
      setRemainingSeconds(left)
      persistRunningState(nextPhase, nextCycle, endAt)
      startTicking()
    },
    [persistRunningState, startTicking],
  )

  const scheduleWallClockSync = useCallback(() => {
    clearWallClockTimer()
    if (sessionStateRef.current !== 'running' || !endAtRef.current) return

    const tick = () => {
      wallClockTimerRef.current = null
      syncAllFromWallClockRef.current()
    }

    const delay = endAtRef.current - Date.now()
    if (delay <= 0) {
      tick()
      return
    }

    wallClockTimerRef.current = setTimeout(tick, delay)
  }, [clearWallClockTimer])

  const applyRunningTimerWithSchedule = useCallback(
    (nextPhase: TimerPhase, nextCycle: number, endAt: number) => {
      applyRunningTimer(nextPhase, nextCycle, endAt)
      scheduleWallClockSync()
    },
    [applyRunningTimer, scheduleWallClockSync],
  )

  const startCountdown = useCallback(
    (seconds: number, nextPhase: TimerPhase, nextCycle: number) => {
      applyRunningTimerWithSchedule(
        nextPhase,
        nextCycle,
        Date.now() + seconds * 1000,
      )
    },
    [applyRunningTimerWithSchedule],
  )

  const pauseAtWorkStart = useCallback(
    (nextCycle: number) => {
      clearTimer()
      clearWallClockTimer()
      endAtRef.current = null
      stopWorkWhiteNoise()
      shouldPauseAtNextWorkRef.current = false

      phaseRef.current = 'work'
      cycleRef.current = nextCycle
      sessionStateRef.current = 'paused'

      setPhase('work')
      setCycle(nextCycle)
      setRemainingSeconds(workSeconds)
      setSessionState('paused')

      saveTimerState({
        sessionState: 'paused',
        phase: 'work',
        cycle: nextCycle,
        endAt: null,
        remainingSeconds: workSeconds,
        configMode: config.mode,
        updatedAt: Date.now(),
      })
    },
    [clearTimer, clearWallClockTimer, config.mode, workSeconds],
  )

  const completeSession = useCallback(() => {
    incrementDailySession()
    const usage = loadDailyUsage()
    clearWallClockTimer()
    stopWorkWhiteNoise()
    shouldPauseAtNextWorkRef.current = false
    clearTimerState()
    endAtRef.current = null
    phaseRef.current = 'work'
    cycleRef.current = 1
    sessionStateRef.current = 'completed'
    setPhase('work')
    setCycle(1)
    setSessionState('completed')
    setIsLimitReached(usage.completedSessions >= config.maxSessionsPerDay)
    setRemainingSeconds(workSeconds)
  }, [config.maxSessionsPerDay, clearWallClockTimer, workSeconds])

  const shouldPauseForNextWork = useCallback(
    (prevCycle: number, nextPhase: TimerPhase, nextCycle: number) =>
      shouldPauseAtNextWorkRef.current &&
      nextPhase === 'work' &&
      nextCycle > prevCycle,
    [],
  )

  const advancePhase = useCallback(() => {
    if (isAdvancingRef.current) return
    isAdvancingRef.current = true

    try {
      const currentPhase = phaseRef.current
      const currentCycle = cycleRef.current
      const currentConfig = configRef.current

      if (currentPhase === 'work') {
        startCountdown(breakSeconds, 'break', currentCycle)
        return
      }

      const nextCycle = currentCycle + 1
      if (nextCycle > currentConfig.cycles) {
        completeSession()
        return
      }

      if (shouldPauseForNextWork(currentCycle, 'work', nextCycle)) {
        pauseAtWorkStart(nextCycle)
        return
      }

      startCountdown(workSeconds, 'work', nextCycle)
    } finally {
      isAdvancingRef.current = false
    }
  }, [
    breakSeconds,
    completeSession,
    pauseAtWorkStart,
    shouldPauseForNextWork,
    startCountdown,
    workSeconds,
  ])

  const syncWorkAudio = useCallback(() => {
    if (sessionStateRef.current !== 'running') {
      stopWorkWhiteNoise()
      return
    }

    if (isMutedRef.current) {
      stopWorkWhiteNoise()
      return
    }

    syncImmediatePhaseAudio(phaseRef.current)
  }, [])

  const syncAllFromWallClock = useCallback(() => {
    if (sessionStateRef.current !== 'running' || !endAtRef.current) return
    if (isAdvancingRef.current) return
    isAdvancingRef.current = true

    try {
      const prevCycle = cycleRef.current
      const result = catchUpTimerFromWallClock(
        phaseRef.current,
        cycleRef.current,
        endAtRef.current,
        configRef.current,
        workSeconds,
        breakSeconds,
      )

      if (result.status === 'completed') {
        completeSession()
        return
      }

      if (shouldPauseForNextWork(prevCycle, result.phase, result.cycle)) {
        pauseAtWorkStart(result.cycle)
        return
      }

      applyRunningTimerWithSchedule(
        result.phase,
        result.cycle,
        result.endAt,
      )
      syncWorkAudio()
    } finally {
      isAdvancingRef.current = false
    }
  }, [
    applyRunningTimerWithSchedule,
    breakSeconds,
    completeSession,
    pauseAtWorkStart,
    shouldPauseForNextWork,
    syncWorkAudio,
    workSeconds,
  ])

  useEffect(() => {
    syncAllFromWallClockRef.current = syncAllFromWallClock
  }, [syncAllFromWallClock])

  const hasResumedOnMountRef = useRef(false)

  useLayoutEffect(() => {
    if (!shouldResumeOnMount || hasResumedOnMountRef.current) return
    hasResumedOnMountRef.current = true
    syncAllFromWallClock()
  }, [shouldResumeOnMount, syncAllFromWallClock])

  useEffect(() => {
    if (shouldResumeOnMount && !hasResumedOnMountRef.current) return
    if (sessionState !== 'running' || remainingSeconds > 0) return
    advancePhase()
  }, [sessionState, remainingSeconds, advancePhase, shouldResumeOnMount])

  useEffect(() => {
    const handleBackground = () => {
      if (document.visibilityState !== 'hidden') return
      if (sessionStateRef.current !== 'running') return
      shouldPauseAtNextWorkRef.current = true
    }

    const handleForeground = () => {
      if (document.visibilityState === 'hidden') return
      syncAllFromWallClock()
    }

    document.addEventListener('visibilitychange', handleBackground)
    document.addEventListener('visibilitychange', handleForeground)
    window.addEventListener('focus', handleForeground)
    window.addEventListener('pageshow', handleForeground)

    return () => {
      document.removeEventListener('visibilitychange', handleBackground)
      document.removeEventListener('visibilitychange', handleForeground)
      window.removeEventListener('focus', handleForeground)
      window.removeEventListener('pageshow', handleForeground)
    }
  }, [syncAllFromWallClock])

  useEffect(() => () => {
    clearTimer()
    clearWallClockTimer()
  }, [clearTimer, clearWallClockTimer])

  useEffect(() => {
    if (sessionState !== 'running') {
      stopWorkWhiteNoise()
      return
    }

    syncWorkAudio()
  }, [phase, sessionState, syncWorkAudio])

  const configSnapshotRef = useRef('')

  useLayoutEffect(() => {
    if (sessionState === 'running' || sessionState === 'paused') return

    const snapshot = `${config.mode}:${workSeconds}:${config.cycles}:${config.maxSessionsPerDay}`
    if (snapshot === configSnapshotRef.current && sessionState !== 'completed') {
      return
    }
    configSnapshotRef.current = snapshot

    clearTimer()
    clearWallClockTimer()
    endAtRef.current = null
    shouldPauseAtNextWorkRef.current = false
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
    clearWallClockTimer,
    sessionState,
  ])

  const handleStart = useCallback(() => {
    if (!enabled || isLimitReached) return
    shouldPauseAtNextWorkRef.current = false
    setSessionState('running')
    sessionStateRef.current = 'running'
    const seconds =
      remainingSeconds > 0 ? remainingSeconds : getPhaseSeconds(phase)
    startCountdown(seconds, phase, cycle)
    if (phase === 'work' && !isMutedRef.current) {
      void startWorkWhiteNoise(true)
    }
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
    clearWallClockTimer()
    endAtRef.current = null
    stopWorkWhiteNoise()
    sessionStateRef.current = 'paused'
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
  }, [sessionState, clearTimer, clearWallClockTimer, phase, cycle, remainingSeconds, config.mode])

  const handleResume = useCallback(() => {
    if (sessionState !== 'paused') return
    shouldPauseAtNextWorkRef.current = false
    setSessionState('running')
    sessionStateRef.current = 'running'
    startCountdown(remainingSeconds, phase, cycle)
  }, [sessionState, remainingSeconds, phase, cycle, startCountdown])

  const handleReset = useCallback(() => {
    clearTimer()
    clearWallClockTimer()
    endAtRef.current = null
    shouldPauseAtNextWorkRef.current = false
    clearTimerState()
    setIsMuted(false)
    isMutedRef.current = false
    setAudioMuted(false)
    setPhase('work')
    setCycle(1)
    setRemainingSeconds(workSeconds)
    setSessionState('idle')
    setIsLimitReached(isSessionLimitReached(config.maxSessionsPerDay))
  }, [clearTimer, clearWallClockTimer, config.maxSessionsPerDay, workSeconds])

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev
      isMutedRef.current = next
      setAudioMuted(next)
      if (!next) {
        syncWorkAudio()
      }
      return next
    })
  }, [syncWorkAudio])

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
    isMuted,
    progress,
    handleStart,
    handlePause,
    handleResume,
    handleReset,
    handleToggleMute,
  }
}
