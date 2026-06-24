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
  const phaseRef = useRef(phase)
  const cycleRef = useRef(cycle)
  const sessionStateRef = useRef(sessionState)
  const configRef = useRef(config)
  const isMutedRef = useRef(isMuted)
  const isAdvancingRef = useRef(false)

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

  const startCountdown = useCallback(
    (seconds: number, nextPhase: TimerPhase, nextCycle: number) => {
      applyRunningTimer(nextPhase, nextCycle, Date.now() + seconds * 1000)
    },
    [applyRunningTimer],
  )

  const completeSession = useCallback(() => {
    incrementDailySession()
    const usage = loadDailyUsage()
    stopWorkWhiteNoise()
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
  }, [config.maxSessionsPerDay, workSeconds])

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

  const pauseRunningTimer = useCallback(() => {
    if (sessionStateRef.current !== 'running' || !endAtRef.current) return

    const left = Math.max(
      0,
      Math.ceil((endAtRef.current - Date.now()) / 1000),
    )
    const currentPhase = phaseRef.current
    const currentCycle = cycleRef.current

    clearTimer()
    endAtRef.current = null
    stopWorkWhiteNoise()
    sessionStateRef.current = 'paused'

    setRemainingSeconds(left)
    setPhase(currentPhase)
    setCycle(currentCycle)
    setSessionState('paused')

    saveTimerState({
      sessionState: 'paused',
      phase: currentPhase,
      cycle: currentCycle,
      endAt: null,
      remainingSeconds: left,
      configMode: config.mode,
      updatedAt: Date.now(),
    })
  }, [clearTimer, config.mode])

  useEffect(() => {
    if (sessionState !== 'running' || remainingSeconds > 0) return
    advancePhase()
  }, [sessionState, remainingSeconds, advancePhase])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        pauseRunningTimer()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [pauseRunningTimer])

  useEffect(() => () => clearTimer(), [clearTimer])

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
    sessionState,
  ])

  const handleStart = useCallback(() => {
    if (!enabled || isLimitReached) return
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
    pauseRunningTimer()
  }, [pauseRunningTimer])

  const handleResume = useCallback(() => {
    if (sessionState !== 'paused') return
    setSessionState('running')
    sessionStateRef.current = 'running'
    startCountdown(remainingSeconds, phase, cycle)
  }, [sessionState, remainingSeconds, phase, cycle, startCountdown])

  const handleReset = useCallback(() => {
    clearTimer()
    endAtRef.current = null
    clearTimerState()
    setIsMuted(false)
    isMutedRef.current = false
    setAudioMuted(false)
    setPhase('work')
    setCycle(1)
    setRemainingSeconds(workSeconds)
    setSessionState('idle')
    setIsLimitReached(isSessionLimitReached(config.maxSessionsPerDay))
  }, [clearTimer, config.maxSessionsPerDay, workSeconds])

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
