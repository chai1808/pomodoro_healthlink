import { FitbitSetupNotice } from './FitbitSetupNotice'
import type { ActivityData } from '../types'

type ActivitySummaryProps = {
  activity: ActivityData
  activityScore: number
  fitbitConfigured: boolean
}

const BAR_MAX_HEIGHT = 56

const formatShortDate = (dateStr: string): string => {
  const [, month, day] = dateStr.split('-')
  if (!month || !day) return dateStr
  return `${parseInt(month, 10)}/${parseInt(day, 10)}`
}

export const ActivitySummary = ({
  activity,
  activityScore,
  fitbitConfigured,
}: ActivitySummaryProps) => {
  if (!fitbitConfigured) {
    return (
      <section
        className="rounded-lg border border-mono-border bg-mono-surface px-4 py-3"
        aria-label="活動量"
      >
        <h2 className="mb-2 text-xs tracking-widest text-mono-muted uppercase">
          Activity
        </h2>
        <FitbitSetupNotice />
      </section>
    )
  }

  const steps = activity.dailySteps
  const maxSteps = Math.max(...steps.map((d) => d.steps), 1)

  return (
    <section
      className="rounded-lg border border-mono-border bg-mono-surface px-4 py-3"
      aria-label="活動量"
    >
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs tracking-widest text-mono-muted uppercase">
          Activity
        </h2>
        <p className="text-sm text-mono-muted">
          スコア{' '}
          <span className="font-mono text-mono-text">
            {(activityScore * 100).toFixed(0)}%
          </span>
        </p>
      </div>

      {steps.length === 0 ? (
        <p className="py-4 text-center text-xs text-mono-muted">
          歩数データがありません
        </p>
      ) : (
        <div
          className="flex items-end gap-1"
          style={{ height: `${BAR_MAX_HEIGHT + 16}px` }}
          role="img"
          aria-label="直近7日間の歩数"
        >
          {steps.map((day) => {
            const barHeight = Math.max(
              (day.steps / maxSteps) * BAR_MAX_HEIGHT,
              4,
            )
            return (
              <div
                key={day.date}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              >
                <div
                  className="w-full rounded-t bg-mono-border"
                  style={{ height: `${barHeight}px` }}
                  title={`${day.date}: ${day.steps.toLocaleString()} 歩`}
                />
                <span className="text-[9px] text-mono-muted">
                  {formatShortDate(day.date)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
