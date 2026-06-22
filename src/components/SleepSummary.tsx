import { HealthSetupNotice } from './HealthSetupNotice'
import type { SleepRecord } from '../types'

type SleepSummaryProps = {
  records: SleepRecord[]
  avgSleepHours: number
  healthConfigured: boolean
  isDemoData: boolean
}

const formatDuration = (minutes: number): string => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}時間${m > 0 ? `${m}分` : ''}`
}

export const SleepSummary = ({
  records,
  avgSleepHours,
  healthConfigured,
  isDemoData,
}: SleepSummaryProps) => {
  if (!healthConfigured) {
    return (
      <section
        className="rounded-lg border border-mono-border bg-mono-surface px-4 py-3"
        aria-label="睡眠データ"
      >
        <h2 className="mb-2 text-xs tracking-widest text-mono-muted uppercase">
          Sleep
        </h2>
        <HealthSetupNotice />
      </section>
    )
  }

  if (!isDemoData && records.length === 0) return null

  return (
    <section
      className="rounded-lg border border-mono-border bg-mono-surface px-4 py-3"
      aria-label="睡眠データ"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs tracking-widest text-mono-muted uppercase">
            Sleep
          </h2>
          {isDemoData && (
            <span className="rounded-full border border-mono-border px-2 py-0.5 text-[10px] text-mono-muted">
              デモ
            </span>
          )}
        </div>
        {records.length > 0 && (
          <p className="text-sm text-mono-muted">
            平均{' '}
            <span className="font-mono text-mono-text">{avgSleepHours.toFixed(1)}</span>
            <span className="text-mono-muted"> h</span>
          </p>
        )}
      </div>

      {records.length === 0 ? (
        <p className="py-4 text-center text-xs text-mono-muted">デモデータがありません</p>
      ) : (
        <ul className="space-y-2">
          {records.slice(0, 3).map((record) => (
            <li
              key={record.date}
              className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-0.5 border-t border-mono-border/50 pt-2 text-xs first:border-t-0 first:pt-0"
            >
              <span className="font-mono text-mono-text">{record.date}</span>
              <span className="text-mono-muted">
                {record.sleepStart} → {record.wakeTime}
              </span>
              <span className="font-mono text-right text-mono-text">
                {formatDuration(record.minutesAsleep)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
