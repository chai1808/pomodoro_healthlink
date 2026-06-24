import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatElapsed, minutesToSeconds } from '../lib/utils'
import { startWorkWhiteNoise, stopWorkWhiteNoise, schedulePhaseAudioChain, setAudioMuted, syncImmediatePhaseAudio } from '../lib/sound'
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
import { buildRemainingPhaseAudioSchedule, catchUpTimerFromWallClock } from '../lib/timerSchedule'
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
  const [isMuted, setIsMuted] = useState(false)

  const endAtRef = useRef<number | null>(initialState.endAt)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wallClockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phaseRef = useRef(phase)
  const cycleRef = useRef(cycle)
  const sessionStateRef = useRef(sessionState)
  const configRef = useRef(config)
  const isAdvancingRef = useRef(false)
  const syncFromWallClockRef = useRef<() => void>(() => {})

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

  const scheduleWallClockSync = useCallback(() => {
    clearWallClockTimer()
    if (sessionStateRef.current !== 'running' || !endAtRef.current) return

    const tick = () => {
      wallClockTimerRef.current = null
      syncFromWallClockRef.current()
    }

    const delay = endAtRef.current - Date.now()
    if (delay <= 0) {
      tick()
      return
    }

    wallClockTimerRef.current = setTimeout(tick, delay)
  }, [clearWallClockTimer])

  const applyRunningTimer = useCallback(
    (nextPhase: TimerPhase, nextCycle: number, endAt: number) => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      endAtRef.current = endAt
      setPhase(nextPhase)
      setCycle(nextCycle)
      setSessionState('running')
      setRemainingSeconds(left)
      persistRunningState(nextPhase, nextCycle, endAt)
      startTicking()
      scheduleWallClockSync()
    },
    [persistRunningState, scheduleWallClockSync, startTicking],
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
    clearWallClockTimer()
    stopWorkWhiteNoise()
    clearTimerState()
    endAtRef.current = null
    setPhase('work')
    setCycle(1)
    setSessionState('completed')
    setIsLimitReached(usage.completedSessions >= config.maxSessionsPerDay)
    setRemainingSeconds(workSeconds)
  }, [config.maxSessionsPerDay, clearWallClockTimer, workSeconds])

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

      startCountdown(workSeconds, 'work', nextCycle)
    } finally {
      isAdvancingRef.current = false
    }
  }, [breakSeconds, completeSession, startCountdown, workSeconds])

  const syncFromWallClock = useCallback(() => {
    if (sessionStateRef.current !== 'running' || !endAtRef.current) return
    if (isAdvancingRef.current) return
    isAdvancingRef.current = true

    try {
      const currentConfig = configRef.current

      const result = catchUpTimerFromWallClock(
        phaseRef.current,
        cycleRef.current,
        endAtRef.current,
        currentConfig,
        workSeconds,
        breakSeconds,
      )

      if (result.status === 'completed') {
        completeSession()
        return
      }

      applyRunningTimer(result.phase, result.cycle, result.endAt)
    } finally {
      isAdvancingRef.current = false
    }
  }, [applyRunningTimer, breakSeconds, completeSession, workSeconds])

  syncFromWallClockRef.current = syncFromWallClock

  const scheduleWorkAudio = useCallback(() => {
    if (sessionStateRef.current !== 'running' || !endAtRef.current) {
      stopWorkWhiteNoise()
      return
    }

    const remaining = Math.max(
      0,
      Math.ceil((endAtRef.current - Date.now()) / 1000),
    )
    const schedules = buildRemainingPhaseAudioSchedule(
      phaseRef.current,
      cycleRef.current,
      remaining,
      configRef.current,
    )
    schedulePhaseAudioChain(schedules)
  }, [])

  const syncWorkAudio = useCallback(() => {
    if (sessionStateRef.current !== 'running' || !endAtRef.current) {
      stopWorkWhiteNoise()
      return
    }

    syncImmediatePhaseAudio(phaseRef.current)
    scheduleWorkAudio()
  }, [scheduleWorkAudio])

  const hasResumedOnMountRef = useRef(false)

  useLayoutEffect(() => {
    if (!shouldResumeOnMount || hasResumedOnMountRef.current) return
    hasResumedOnMountRef.current = true
    syncFromWallClock()
    syncWorkAudio()
  }, [shouldResumeOnMount, syncFromWallClock, syncWorkAudio])

  useEffect(() => {
    if (shouldResumeOnMount && !hasResumedOnMountRef.current) return
    if (sessionState !== 'running' || remainingSeconds > 0) return
    advancePhase()
  }, [sessionState, remainingSeconds, advancePhase, shouldResumeOnMount])

  useEffect(() => {
    const handleResume = () => {
      if (document.visibilityState === 'hidden') return
      syncFromWallClock()
      syncWorkAudio()
    }

    document.addEventListener('visibilitychange', handleResume)
    window.addEventListener('focus', handleResume)
    window.addEventListener('pageshow', handleResume)

    return () => {
      document.removeEventListener('visibilitychange', handleResume)
      window.removeEventListener('focus', handleResume)
      window.removeEventListener('pageshow', handleResume)
    }
  }, [syncFromWallClock, syncWorkAudio])

  useEffect(() => () => {
    clearTimer()
    clearWallClockTimer()
  }, [clearTimer, clearWallClockTimer])

  useEffect(() => {
    if (sessionState !== 'running') {
      stopWorkWhiteNoise()
      return
    }

    syncImmediatePhaseAudio(phase)
    scheduleWorkAudio()
  }, [phase, sessionState, scheduleWorkAudio])

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
    setSessionState('running')
    const seconds =
      remainingSeconds > 0 ? remainingSeconds : getPhaseSeconds(phase)
    startCountdown(seconds, phase, cycle)
    if (phase === 'work') {
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
    setSessionState('running')
    startCountdown(remainingSeconds, phase, cycle)
  }, [sessionState, remainingSeconds, phase, cycle, startCountdown])

  const handleReset = useCallback(() => {
    clearTimer()
    clearWallClockTimer()
    endAtRef.current = null
    clearTimerState()
    setIsMuted(false)
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
      setAudioMuted(next)
      if (!next) {
        scheduleWorkAudio()
      }
      return next
    })
  }, [scheduleWorkAudio])

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
