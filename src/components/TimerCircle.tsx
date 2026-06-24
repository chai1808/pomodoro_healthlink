import type { TimerPhase } from '../types'
import { POMODORO_COLORS } from '../lib/constants'

type TimerCircleProps = {
  displayTime: string
  phase: TimerPhase
  progress: number
  cycle: number
  totalCycles: number
  disabled?: boolean
}

const SIZE = 280
const STROKE = 4
const CENTER = SIZE / 2
const RADIUS = CENTER - STROKE / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export const TimerCircle = ({
  displayTime,
  phase,
  progress,
  cycle,
  totalCycles,
  disabled = false,
}: TimerCircleProps) => {
  const clampedProgress = Math.min(1, Math.max(0, progress))
  const elapsedLength = CIRCUMFERENCE * clampedProgress
  const progressColor =
    phase === 'work'
      ? POMODORO_COLORS.WORK_BORDER_COLOR
      : POMODORO_COLORS.BREAK_BORDER_COLOR

  return (
    <div
      className="relative shrink-0"
      style={{ width: SIZE, height: SIZE }}
      role="timer"
      aria-live="polite"
      aria-label={`${phase === 'work' ? '作業' : '休憩'} ${displayTime}`}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        {/* 背景リング（常に全周表示） */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke={POMODORO_COLORS.BACKGROUND_BORDER_COLOR}
          strokeWidth={STROKE}
        />
        {/* 経過に応じて12時方向から時計回りに伸びる */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke={progressColor}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${elapsedLength} ${CIRCUMFERENCE}`}
          className="transition-[stroke-dasharray,stroke] duration-300"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center -translate-y-1 pt-6">
        <span
          className={`font-mono text-5xl leading-none tracking-wider mb-4 tabular-nums sm:text-6xl ${
            disabled ? 'text-mono-muted' : 'text-mono-text'
          }`}
        >
          {displayTime}
        </span>
        <div className="mt-3 flex flex-col items-center gap-0.5">
          <span className="text-xs tracking-widest text-mono-muted uppercase">
            {phase === 'work' ? 'Work' : 'Break'}
          </span>
          <span className="text-xs text-mono-muted">
            {cycle} / {totalCycles}
          </span>
        </div>
      </div>
    </div>
  )
}
