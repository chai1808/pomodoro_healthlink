let audioContext: AudioContext | null = null
let whiteNoiseSource: AudioBufferSourceNode | null = null
let whiteNoiseGain: GainNode | null = null

const WHITE_NOISE_GAIN = 0.02

const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  return audioContext
}

const createWhiteNoiseBuffer = (ctx: AudioContext): AudioBuffer => {
  const bufferSize = 2 * ctx.sampleRate
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)

  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1
  }

  return buffer
}

export const startWorkWhiteNoise = async (): Promise<void> => {
  if (whiteNoiseSource) return

  try {
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    const source = ctx.createBufferSource()
    source.buffer = createWhiteNoiseBuffer(ctx)
    source.loop = true

    const gain = ctx.createGain()
    gain.gain.value = WHITE_NOISE_GAIN

    source.connect(gain)
    gain.connect(ctx.destination)
    source.start()

    whiteNoiseSource = source
    whiteNoiseGain = gain
  } catch {
    // 音声再生不可環境では無視
  }
}

export const stopWorkWhiteNoise = (): void => {
  if (whiteNoiseSource) {
    try {
      whiteNoiseSource.stop()
      whiteNoiseSource.disconnect()
    } catch {
      // 既に停止済み
    }
    whiteNoiseSource = null
  }

  if (whiteNoiseGain) {
    whiteNoiseGain.disconnect()
    whiteNoiseGain = null
  }
}
