import type { PhaseAudioSchedule } from './timerSchedule'

const WHITE_NOISE_GAIN = 0.01
const SAMPLE_RATE = 22050
const LOOP_SECONDS = 60

let audioElement: HTMLAudioElement | null = null
let noiseUrl: string | null = null
let userMuted = false
let shouldPlayWorkWhiteNoise = false
let intentionalPause = false
let isStarting = false
let resumeTimer: ReturnType<typeof setTimeout> | null = null
let phaseTimer: ReturnType<typeof setTimeout> | null = null
let interruptionTimer: ReturnType<typeof setInterval> | null = null

const writeString = (view: DataView, offset: number, value: string) => {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i))
  }
}

const createNoiseWavUrl = (): string => {
  const numSamples = SAMPLE_RATE * LOOP_SECONDS
  const dataSize = numSamples * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  for (let i = 0; i < numSamples; i++) {
    const sample = Math.floor((Math.random() * 2 - 1) * 32767)
    view.setInt16(44 + i * 2, sample, true)
  }

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
}

const clearPhaseTimer = (): void => {
  if (phaseTimer) {
    clearTimeout(phaseTimer)
    phaseTimer = null
  }
}

const stopInterruptionRecovery = (): void => {
  if (interruptionTimer) {
    clearInterval(interruptionTimer)
    interruptionTimer = null
  }
}

const startInterruptionRecovery = (): void => {
  if (interruptionTimer || !shouldPlayWorkWhiteNoise) return

  interruptionTimer = setInterval(() => {
    if (!shouldPlayWorkWhiteNoise || !audioElement) {
      stopInterruptionRecovery()
      return
    }

    if (audioElement.paused) {
      intentionalPause = false
      void audioElement.play().catch(() => {})
      return
    }

    stopInterruptionRecovery()
  }, 1500)
}

const getAudioElement = (): HTMLAudioElement => {
  if (audioElement) return audioElement

  audioElement = new Audio()
  audioElement.loop = true
  audioElement.preload = 'auto'
  audioElement.volume = WHITE_NOISE_GAIN
  audioElement.setAttribute('playsinline', 'true')

  audioElement.addEventListener('pause', () => {
    if (!shouldPlayWorkWhiteNoise || intentionalPause) return
    startInterruptionRecovery()
  })

  return audioElement
}

const setMediaSessionPlaying = (playing: boolean): void => {
  if (!('mediaSession' in navigator)) return

  if (playing) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: '作業中',
      artist: 'Pomodoro Healthlink',
    })
    navigator.mediaSession.playbackState = 'playing'
    return
  }

  navigator.mediaSession.playbackState = 'none'
}

const ensureNoiseSource = (audio: HTMLAudioElement): void => {
  if (!noiseUrl) {
    noiseUrl = createNoiseWavUrl()
  }

  if (audio.src !== noiseUrl) {
    audio.src = noiseUrl
  }
}

const tryPlay = async (forceRestart = false): Promise<void> => {
  if (userMuted) return
  if (isStarting) return
  isStarting = true

  try {
    const audio = getAudioElement()
    ensureNoiseSource(audio)

    if (forceRestart) {
      audio.pause()
      audio.currentTime = 0
    }

    if (!audio.paused && !forceRestart) {
      setMediaSessionPlaying(true)
      return
    }

    intentionalPause = false
    await audio.play()
    setMediaSessionPlaying(true)
    stopInterruptionRecovery()
  } catch {
    startInterruptionRecovery()
  } finally {
    isStarting = false
  }
}

const schedulePhaseEnd = (
  schedules: PhaseAudioSchedule[],
  index: number,
): void => {
  const item = schedules[index]
  if (!item) return

  const delay = item.endAt - Date.now()
  const fire = () => {
    if (item.phase === 'work') {
      shouldPlayWorkWhiteNoise = false
      intentionalPause = true
      if (audioElement) audioElement.pause()
      setMediaSessionPlaying(false)
      stopInterruptionRecovery()
    }

    const nextIndex = index + 1
    const next = schedules[nextIndex]
    if (!next) {
      shouldPlayWorkWhiteNoise = false
      return
    }

    if (next.phase === 'work') {
      shouldPlayWorkWhiteNoise = true
      if (!userMuted) void tryPlay(false)
    }

    schedulePhaseEnd(schedules, nextIndex)
  }

  if (delay <= 0) {
    fire()
    return
  }

  phaseTimer = setTimeout(fire, delay)
}

export const setAudioMuted = (muted: boolean): void => {
  userMuted = muted
  if (muted) {
    intentionalPause = true
    if (audioElement) audioElement.pause()
    setMediaSessionPlaying(false)
    return
  }

  if (shouldPlayWorkWhiteNoise) {
    void tryPlay(false)
  }
}

export const getAudioMuted = (): boolean => userMuted

export const schedulePhaseAudioChain = (
  schedules: PhaseAudioSchedule[],
): void => {
  clearPhaseTimer()
  stopInterruptionRecovery()

  if (schedules.length === 0) {
    stopWorkWhiteNoise()
    return
  }

  const first = schedules[0]

  if (first.phase === 'work') {
    shouldPlayWorkWhiteNoise = true
    if (!userMuted) void tryPlay(false)
  } else {
    shouldPlayWorkWhiteNoise = false
    intentionalPause = true
    if (audioElement) audioElement.pause()
    setMediaSessionPlaying(false)
  }

  schedulePhaseEnd(schedules, 0)
}

export const startWorkWhiteNoise = async (
  forceRestart = false,
): Promise<void> => {
  shouldPlayWorkWhiteNoise = true
  if (userMuted) return
  await tryPlay(forceRestart)
}

export const stopWorkWhiteNoise = (): void => {
  shouldPlayWorkWhiteNoise = false
  intentionalPause = true
  clearPhaseTimer()
  stopInterruptionRecovery()

  if (audioElement) {
    audioElement.pause()
  }

  setMediaSessionPlaying(false)
}

export const resumeWorkWhiteNoiseIfNeeded = (): void => {
  if (!shouldPlayWorkWhiteNoise) return
  if (resumeTimer) clearTimeout(resumeTimer)
  resumeTimer = setTimeout(() => {
    resumeTimer = null
    void tryPlay(false)
  }, 0)
}

const handleVisibilityResume = (): void => {
  if (document.visibilityState !== 'visible') return
  resumeWorkWhiteNoiseIfNeeded()
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', handleVisibilityResume)
  window.addEventListener('pageshow', handleVisibilityResume)
  window.addEventListener('focus', handleVisibilityResume)
}
