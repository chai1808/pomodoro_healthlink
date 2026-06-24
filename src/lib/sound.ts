const WHITE_NOISE_VOLUME = 0.02

let whiteNoiseAudio: HTMLAudioElement | null = null
let whiteNoiseUrl: string | null = null
let shouldPlayWorkWhiteNoise = false

const createWhiteNoiseWavBlob = (): Blob => {
  const sampleRate = 44100
  const durationSeconds = 2
  const numSamples = sampleRate * durationSeconds
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + numSamples * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, numSamples * 2, true)

  for (let i = 0; i < numSamples; i++) {
    const sample = (Math.random() * 2 - 1) * 0.35
    view.setInt16(44 + i * 2, sample * 0x7fff, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

const getWhiteNoiseAudio = (): HTMLAudioElement => {
  if (whiteNoiseAudio) return whiteNoiseAudio

  if (!whiteNoiseUrl) {
    whiteNoiseUrl = URL.createObjectURL(createWhiteNoiseWavBlob())
  }

  const audio = new Audio(whiteNoiseUrl)
  audio.loop = true
  audio.preload = 'auto'
  audio.volume = WHITE_NOISE_VOLUME
  audio.setAttribute('playsinline', 'true')
  whiteNoiseAudio = audio
  return audio
}

const playWhiteNoise = async (): Promise<void> => {
  try {
    const audio = getWhiteNoiseAudio()
    if (!audio.paused) return

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: '作業中',
        artist: 'Pomodoro Healthlink',
      })
      navigator.mediaSession.playbackState = 'playing'
    }

    await audio.play()
  } catch {
    // 自動再生制限などでは無視（フォアグラウンド復帰時に再試行）
  }
}

export const startWorkWhiteNoise = async (): Promise<void> => {
  shouldPlayWorkWhiteNoise = true
  await playWhiteNoise()
}

export const stopWorkWhiteNoise = (): void => {
  shouldPlayWorkWhiteNoise = false
  if (!whiteNoiseAudio) return
  whiteNoiseAudio.pause()
  whiteNoiseAudio.currentTime = 0

  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'none'
  }
}

export const resumeWorkWhiteNoiseIfNeeded = (): void => {
  if (!shouldPlayWorkWhiteNoise) return
  void playWhiteNoise()
}

const handleVisibilityResume = () => {
  if (document.visibilityState !== 'visible') return
  resumeWorkWhiteNoiseIfNeeded()
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', handleVisibilityResume)
  window.addEventListener('pageshow', handleVisibilityResume)
  window.addEventListener('focus', handleVisibilityResume)
}
