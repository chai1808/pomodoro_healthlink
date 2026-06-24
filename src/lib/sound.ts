const WHITE_NOISE_GAIN = 0.02
const SAMPLE_RATE = 22050
const BUFFER_SECONDS = 1

let audioContext: AudioContext | null = null
let whiteNoiseSource: AudioBufferSourceNode | null = null
let whiteNoiseGain: GainNode | null = null
let shouldPlayWorkWhiteNoise = false
let isStarting = false
let resumeTimer: ReturnType<typeof setTimeout> | null = null

const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
  }
  return audioContext
}

const createWhiteNoiseBuffer = (ctx: AudioContext): AudioBuffer => {
  const bufferSize = SAMPLE_RATE * BUFFER_SECONDS
  const buffer = ctx.createBuffer(1, bufferSize, SAMPLE_RATE)
  const data = buffer.getChannelData(0)

  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1
  }

  return buffer
}

const destroySourceNodes = (): void => {
  if (whiteNoiseSource) {
    try {
      whiteNoiseSource.stop()
    } catch {
      // 既に停止済み
    }
    whiteNoiseSource.disconnect()
    whiteNoiseSource = null
  }

  if (whiteNoiseGain) {
    whiteNoiseGain.disconnect()
    whiteNoiseGain = null
  }
}

const startSourceNodes = (ctx: AudioContext): void => {
  destroySourceNodes()

  const source = ctx.createBufferSource()
  source.buffer = createWhiteNoiseBuffer(ctx)
  source.loop = true

  const gain = ctx.createGain()
  gain.gain.value = WHITE_NOISE_GAIN

  source.connect(gain)
  gain.connect(ctx.destination)
  source.start(0)

  whiteNoiseSource = source
  whiteNoiseGain = gain
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

const playWhiteNoise = async (): Promise<void> => {
  if (isStarting) return
  isStarting = true

  try {
    const ctx = getAudioContext()

    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    if (!whiteNoiseSource) {
      startSourceNodes(ctx)
    }

    setMediaSessionPlaying(true)
  } catch {
    // 自動再生制限などでは無視
  } finally {
    isStarting = false
  }
}

export const startWorkWhiteNoise = async (): Promise<void> => {
  shouldPlayWorkWhiteNoise = true
  await playWhiteNoise()
}

export const stopWorkWhiteNoise = (): void => {
  shouldPlayWorkWhiteNoise = false
  destroySourceNodes()
  setMediaSessionPlaying(false)
}

export const resumeWorkWhiteNoiseIfNeeded = (): void => {
  if (!shouldPlayWorkWhiteNoise) return
  if (resumeTimer) clearTimeout(resumeTimer)
  resumeTimer = setTimeout(() => {
    resumeTimer = null
    void playWhiteNoise()
  }, 150)
}

const handleVisibilityResume = (): void => {
  if (document.visibilityState !== 'visible') return
  resumeWorkWhiteNoiseIfNeeded()
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', handleVisibilityResume)
  window.addEventListener('pageshow', handleVisibilityResume)
}
