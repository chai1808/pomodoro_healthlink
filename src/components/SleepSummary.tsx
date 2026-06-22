import type { SleepRecord } from '../types'
import { isoDate } from '../services/googleHealth/format'

type SleepSummaryProps = {
  records: SleepRecord[]
  healthConfigured: boolean
  healthConnected: boolean
}

const DISPLAY_DAYS = 7

const isValidSleepRecord = (record: SleepRecord): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(record.date) && record.minutesAsleep > 0

const formatDuration = (minutes: number): string => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}時間${m > 0 ? `${m}分` : ''}`
}

const calcAvgSleepHours = (records: SleepRecord[]): number => {
  if (records.length === 0) return 0
  const totalHours = records.reduce(
    (sum, record) => sum + record.minutesAsleep / 60,
    0,
  )
  return totalHours / records.length
}

export const SleepSummary = ({
  records,
  healthConfigured,
  healthConnected,
}: SleepSummaryProps) => {
  if (!healthConfigured || !healthConnected) return null

  const today = isoDate(new Date())

  const sleepRecords = [...records]
    .filter(isValidSleepRecord)
    .filter((record) => record.date <= today)
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, DISPLAY_DAYS)

  if (sleepRecords.length === 0) return null

  const avgSleepHours = calcAvgSleepHours(sleepRecords)

  return (
    <section
      className="rounded-lg border border-mono-border bg-mono-surface px-4 py-3"
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
