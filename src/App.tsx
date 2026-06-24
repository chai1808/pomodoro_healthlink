import { useState } from 'react'
import { TimerCircle } from './components/TimerCircle'
import { TimerControls } from './components/TimerControls'
import { StatusOverlay } from './components/StatusOverlay'
import { WeatherBadge } from './components/WeatherBadge'
import { SleepSummary } from './components/SleepSummary'
import { ActivitySummary } from './components/ActivitySummary'
import { HealthConnectButton } from './components/HealthConnectButton'
import { useHealthData } from './hooks/useHealthData'
import { usePomodoroTimer } from './hooks/usePomodoroTimer'
import { getPomodoroConfig } from './lib/healthJudgment'
import { loadDailyUsage } from './lib/storage'
import type { HealthSnapshot } from './types'

type AppContentProps = {
  snapshot: HealthSnapshot
  showDetails: boolean
  onToggleDetails: () => void
  onCloseDetails: () => void
  healthConfigured: boolean
  healthConnected: boolean
  onDisconnect: () => void
}

const AppContent = ({
  snapshot,
  showDetails,
  onToggleDetails,
  onCloseDetails,
  healthConfigured,
  healthConnected,
  onDisconnect,
}: AppContentProps) => {
  const config = getPomodoroConfig(snapshot.pomodoroMode)
  const isHealthy = snapshot.status === 'healthy'

  const timer = usePomodoroTimer({
    config,
    enabled: isHealthy,
  })

  const timerDisabled = !isHealthy || timer.isLimitReached
  const completedSessions = loadDailyUsage().completedSessions
  const currentDailySession = Math.min(
    completedSessions + 1,
    config.maxSessionsPerDay,
  )
  const modeLabel =
    config.workMinutes +
    '分 × ' +
    config.cycles +
    'サイクル（1日' +
    config.maxSessionsPerDay +
    '回、うち現在' +
    currentDailySession +
    '回目）'

  return (
    <div className="relative flex h-full min-h-dvh flex-col">
      <aside
        className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-[max(1.25rem,env(safe-area-inset-left))] z-10 max-w-[21rem]"
        aria-label="アプリの説明"
      >
        <p className="text-[10px] leading-relaxed text-mono-muted">
          Pomodoro Healthlink は Fitbit の健康データと連携して、
          集中時間と健康状態を可視化するポモドーロタイマーです。
        </p>
        <p className="mt-3 text-[10px] leading-relaxed text-mono-muted">
          このアプリでは以下の目的で Google アカウント認証を利用します。
        </p>
        <ul className="mt-1.5 list-inside space-y-0.5 text-[10px] leading-relaxed text-mono-muted">
          <li>・Fitbit活動データの取得</li>
          <li>・睡眠データの取得</li>
          <li>・活動量データの表示</li>
          <li>・ポモドーロタイマーとの連携分析</li>
        </ul>
      </aside>

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
              isMuted={timer.isMuted}
              onStart={timer.handleStart}
              onPause={timer.handlePause}
              onResume={timer.handleResume}
              onReset={timer.handleReset}
              onToggleMute={timer.handleToggleMute}
            />
          </>
        )}
      </main>

      <div className="fixed right-5 bottom-6 z-30 flex gap-2">
        <a href="/privacy-policy.html" aria-label="プライバシーポリシーを表示" className="flex"><img src="../shieldicon.svg" alt="Policy" width="25" height="25" /></a>

        {healthConnected ? (
          <button
            type="button"
            onClick={onToggleDetails}
            className='duration-200 cursor-pointer rounded-full border border-mono-border bg-mono-surface px-4 py-2.5 text-xs text-mono-text shadow-lg hover:border-mono-text focus:outline-none focus-visible:ring-2 focus-visible:ring-mono-text'
            aria-expanded={showDetails}
            aria-label={showDetails ? '詳細を閉じる' : '詳細データを表示'}
          >
            {showDetails ? '閉じる' : 'Health Details'}
          </button>
        ) : (
          <HealthConnectButton configured={healthConfigured} />
        )}
      </div>

      {healthConnected ? (
        <>

          {showDetails && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 bg-black/50 duration-300"
                aria-label="詳細を閉じる"
                onClick={onCloseDetails}
              />
              <aside
                className="details-sheet fixed inset-x-0 bottom-0 z-50 flex h-dvh max-h-dvh flex-col rounded-t-2xl border-t border-mono-border bg-mono-bg sm:h-auto sm:max-h-[85dvh]"
                aria-label="詳細データ"
              >
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
                  <div className="space-y-3">
                  <WeatherBadge weather={snapshot.weather} />
                  <SleepSummary
                    records={snapshot.sleepRecords}
                    healthConfigured={healthConfigured}
                    healthConnected={healthConnected}
                  />
                  <ActivitySummary
                    activity={snapshot.activity}
                    healthConfigured={healthConfigured}
                    healthConnected={healthConnected}
                  />
                  <div className="flex gap-2 sm:block">
                    <button
                      type="button"
                      onClick={onDisconnect}
                      className="flex-1 duration-200 cursor-pointer rounded-full border border-mono-border/50 py-2.5 text-xs text-mono-muted transition-colors hover:border-mono-border hover:text-mono-text focus:outline-none focus-visible:ring-2 focus-visible:ring-mono-text sm:w-full"
                      aria-label="Fitbit 連携を解除"
                    >
                      Fitbit 連携を解除
                    </button>
                    <button
                      type="button"
                      onClick={onCloseDetails}
                      className="flex-1 duration-200 cursor-pointer rounded-full border border-mono-border bg-mono-surface py-2.5 text-xs text-mono-text transition-colors hover:border-mono-text focus:outline-none focus-visible:ring-2 focus-visible:ring-mono-text sm:hidden"
                      aria-label="詳細を閉じる"
                    >
                      閉じる
                    </button>
                  </div>
                </div>
                </div>
              </aside>
            </>
          )}
        </>
      ) : null}
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
    healthConfigured,
    healthConnected,
    disconnect,
  } = useHealthData()

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

  const handleDisconnect = () => {
    setShowDetails(false)
    disconnect()
  }

  return (
    <AppContent
      snapshot={snapshot}
      showDetails={showDetails}
      onToggleDetails={() => setShowDetails((prev) => !prev)}
      onCloseDetails={() => setShowDetails(false)}
      healthConfigured={healthConfigured}
      healthConnected={healthConnected}
      onDisconnect={handleDisconnect}
    />
  )
}
