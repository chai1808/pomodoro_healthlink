import { useEffect, useState } from 'react'
import { TimerCircle } from './components/TimerCircle'
import { TimerControls } from './components/TimerControls'
import { StatusOverlay } from './components/StatusOverlay'
import { WeatherBadge } from './components/WeatherBadge'
import { SleepSummary } from './components/SleepSummary'
import { ActivitySummary } from './components/ActivitySummary'
import { useHealthData } from './hooks/useHealthData'
import { usePomodoroTimer } from './hooks/usePomodoroTimer'
import { getPomodoroConfig } from './lib/healthJudgment'
import { requestNotificationPermission } from './lib/notifications'
import type { HealthSnapshot } from './types'

type AppContentProps = {
  snapshot: HealthSnapshot
  showDetails: boolean
  onToggleDetails: () => void
  onCloseDetails: () => void
  fitbitConfigured: boolean
}

const AppContent = ({
  snapshot,
  showDetails,
  onToggleDetails,
  onCloseDetails,
  fitbitConfigured,
}: AppContentProps) => {
  const config = getPomodoroConfig(snapshot.pomodoroMode)
  const isHealthy = snapshot.status === 'healthy'

  const timer = usePomodoroTimer({
    config,
    enabled: isHealthy,
  })

  const timerDisabled = !isHealthy || timer.isLimitReached
  const modeLabel =
    snapshot.pomodoroMode === 'optimal'
      ? '25分 × 6サイクル（1日2回）'
      : '15分 × 3サイクル（1日1回）'

  return (
    <div className="relative flex h-full min-h-dvh flex-col">
      <header className="flex shrink-0 items-center justify-between px-4 py-3 sm:px-6">
        <h1 className="text-xs tracking-[0.3em] text-mono-muted uppercase">
          Pomodoro Healthlink
        </h1>
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-24 sm:gap-8">
        <StatusOverlay status={snapshot.status} visible={!isHealthy} />

        <div
          className={`transition-opacity duration-300 ${
            timerDisabled ? 'opacity-40' : ''
          } ${!isHealthy ? 'pointer-events-none' : ''}`}
        >
          <TimerCircle
            displayTime={timer.displayTime}
            phase={timer.phase}
            progress={timer.progress}
            workBorderColor={config.workBorderColor}
            breakBorderColor={config.breakBorderColor}
            cycle={timer.cycle}
            totalCycles={timer.totalCycles}
            disabled={timerDisabled}
          />
        </div>

        {isHealthy && (
          <>
            <p className="text-center text-xs text-mono-muted">{modeLabel}</p>
            <TimerControls
              sessionState={timer.sessionState}
              isLimitReached={timer.isLimitReached}
              onStart={timer.handleStart}
              onPause={timer.handlePause}
              onResume={timer.handleResume}
              onReset={timer.handleReset}
            />
          </>
        )}
      </main>

      <button
        type="button"
        onClick={onToggleDetails}
        className="fixed right-5 bottom-6 z-30 duration-200 cursor-pointer rounded-full border border-mono-border bg-mono-surface px-4 py-2.5 text-xs text-mono-text shadow-lg hover:border-mono-text focus:outline-none focus-visible:ring-2 focus-visible:ring-mono-text"
        aria-expanded={showDetails}
        aria-label={showDetails ? '詳細を閉じる' : '詳細データを表示'}
      >
        {showDetails ? '閉じる' : '詳細'}
      </button>

      {showDetails && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/50 duration-300"
            aria-label="詳細を閉じる"
            onClick={onCloseDetails}
          />
          <aside
            className="overflow-hidden details-sheet fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-mono-border bg-mono-bg px-4 pt-4 pb-8 sm:px-6"
            aria-label="詳細データ"
          >
            <div className="space-y-3">
              <WeatherBadge weather={snapshot.weather} />
              <SleepSummary
                records={snapshot.sleepRecords}
                avgSleepHours={snapshot.avgSleepHours}
                fitbitConfigured={fitbitConfigured}
              />
              <ActivitySummary
                activity={snapshot.activity}
                fitbitConfigured={fitbitConfigured}
              />
            </div>
          </aside>
        </>
      )}
    </div>
  )
}

export default function App() {
  const [showDetails, setShowDetails] = useState(false)
  const {
    snapshot,
    loading,
    error,
    refresh,
    fitbitConfigured,
  } = useHealthData()

  useEffect(() => {
    requestNotificationPermission()
  }, [])

  if (loading && !snapshot) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="animate-pulse text-sm text-mono-muted">読み込み中...</p>
      </div>
    )
  }

  if (error || !snapshot) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-mono-muted">{error ?? 'データがありません'}</p>
        <button
          type="button"
          onClick={refresh}
          className="duration-200 cursor-pointer rounded-full border border-mono-border px-6 py-2 text-sm hover:bg-mono-surface"
        >
          再読み込み
        </button>
      </div>
    )
  }

  return (
    <AppContent
      key={snapshot.pomodoroMode}
      snapshot={snapshot}
      showDetails={showDetails}
      onToggleDetails={() => setShowDetails((prev) => !prev)}
      onCloseDetails={() => setShowDetails(false)}
      fitbitConfigured={fitbitConfigured}
    />
  )
}

