import type { SessionState } from '../types'

type TimerControlsProps = {
  sessionState: SessionState
  isLimitReached: boolean
  isMuted: boolean
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onReset: () => void
  onToggleMute: () => void
}

export const TimerControls = ({
  sessionState,
  isLimitReached,
  isMuted,
  onStart,
  onPause,
  onResume,
  onReset,
  onToggleMute,
}: TimerControlsProps) => {
  if (isLimitReached) {
    return (
      <p
        className="text-center text-sm tracking-wide font-bold text-xl text-[#c4a574]"
        role="status"
      >
        本日の学習は終了しました
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {sessionState === 'idle' || sessionState === 'completed' ? (
        <button
          type="button"
          onClick={onStart}
          className="duration-300 cursor-pointer min-h-11 min-w-28 rounded-full border border-mono-border px-6 py-2 text-sm tracking-wider transition-colors hover:border-mono-text hover:bg-mono-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-mono-text"
          aria-label="タイマーを開始"
        >
          開始
        </button>
      ) : sessionState === 'running' ? (
        <button
          type="button"
          onClick={onPause}
          className="duration-300 cursor-pointer min-h-11 min-w-28 rounded-full border border-mono-border px-6 py-2 text-sm tracking-wider transition-colors hover:border-mono-text hover:bg-mono-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-mono-text"
          aria-label="タイマーを一時停止"
        >
          一時停止
        </button>
      ) : (
        <button
          type="button"
          onClick={onResume}
          className="duration-300 cursor-pointer min-h-11 min-w-28 rounded-full border border-mono-border px-6 py-2 text-sm tracking-wider transition-colors hover:border-mono-text hover:bg-mono-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-mono-text"
          aria-label="タイマーを再開"
        >
          再開
        </button>
      )}

      {sessionState !== 'idle' && (
        <>
          <button
            type="button"
            onClick={onReset}
            className="duration-300 cursor-pointer min-h-11 rounded-full border border-mono-border/50 px-4 py-2 text-xs text-mono-muted transition-colors hover:border-mono-border hover:text-mono-text focus:outline-none focus-visible:ring-2 focus-visible:ring-mono-text"
            aria-label="タイマーをリセット"
          >
            リセット
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            aria-pressed={isMuted}
            aria-label={isMuted ? 'ミュートを解除' : 'ホワイトノイズをミュート'}
            className="duration-300 cursor-pointer min-h-11 rounded-full border border-mono-border/50 px-4 py-2 text-xs text-mono-muted transition-colors hover:border-mono-border hover:text-mono-text focus:outline-none focus-visible:ring-2 focus-visible:ring-mono-text data-[muted=true]:border-[#c4a574] data-[muted=true]:text-[#c4a574]"
            data-muted={isMuted ? 'true' : 'false'}
          >
            {isMuted ? 'ミュート解除' : 'ミュート'}
          </button>
        </>
      )}
    </div>
  )
}
