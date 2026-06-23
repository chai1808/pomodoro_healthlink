import type { SleepRecord } from '../types'
import {
  calcRecentAvgSleepHours,
  getRecentSleepRecords,
} from '../lib/healthJudgment'

type SleepSummaryProps = {
  records: SleepRecord[]
  healthConfigured: boolean
  healthConnected: boolean
}

const formatDuration = (minutes: number): string => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}時間${m > 0 ? `${m}分` : ''}`
}

export const SleepSummary = ({
  records,
  healthConfigured,
  healthConnected,
}: SleepSummaryProps) => {
  if (!healthConfigured || !healthConnected) return null

  const sleepRecords = getRecentSleepRecords(records)

  if (sleepRecords.length === 0) return null

  const avgSleepHours = calcRecentAvgSleepHours(records)

  return (
    <section
      className="rounded-lg border border-mono-border bg-mono-bg px-4 py-3"
      aria-label="睡眠データ"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-xs tracking-widest text-mono-muted uppercase">
          Sleep
        </h2>
        <p className="text-sm text-mono-muted">
          平均{' '}
          <span className="font-mono text-mono-text">
            {avgSleepHours.toFixed(1)}
          </span>
          <span className="text-mono-muted"> h</span>
        </p>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-9">
        {sleepRecords.map((record, index) => (
          <li
            key={record.date}
            className={`flex items-baseline justify-between py-2 text-xs ${
              index > 0 ? 'border-t border-mono-border/50' : ''
            } ${index >= 2 ? 'sm:border-t' : 'sm:border-t-0'}`}
          >
            <span className="font-mono text-mono-text">{record.date}</span>
            <span className="font-mono text-mono-text">
              {formatDuration(record.minutesAsleep)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
