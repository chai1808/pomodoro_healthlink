import { HealthSetupNotice } from './HealthSetupNotice'
import type { ActivityData } from '../types'

type ActivitySummaryProps = {
  activity: ActivityData
  healthConfigured: boolean
}

const DISPLAY_DAYS = 6

const calcAvgSteps = (steps: ActivityData['dailySteps']): number => {
  if (steps.length === 0) return 0
  const total = steps.reduce((sum, day) => sum + day.steps, 0)
  return Math.round(total / steps.length)
}

export const ActivitySummary = ({
  activity,
  healthConfigured,
}: ActivitySummaryProps) => {
  if (!healthConfigured) {
    return (
      <section
        className="rounded-lg border border-mono-border bg-mono-surface px-4 py-3"
        aria-label="活動量"
      >
        <h2 className="mb-2 text-xs tracking-widest text-mono-muted uppercase">
          Activity
        </h2>
        <HealthSetupNotice />
      </section>
    )
  }

  const steps = activity.dailySteps.slice(-DISPLAY_DAYS)
  const avgSteps = calcAvgSteps(steps)

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
          平均{' '}
          <span className="font-mono text-mono-text">
            {avgSteps.toLocaleString()}
          </span>
          <span className="text-mono-muted"> 歩</span>
        </p>
      </div>

      {steps.length === 0 ? (
        <p className="py-4 text-center text-xs text-mono-muted">
          歩数データがありません
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-9">
          {steps.map((day, index) => (
            <li
              key={day.date}
              className={`flex items-baseline justify-between py-2 text-xs ${
                index > 0 ? 'border-t border-mono-border/50' : ''
              } ${index >= 2 ? 'sm:border-t' : 'sm:border-t-0'}`}
            >
              <span className="font-mono text-mono-text">{day.date}</span>
              <span className="font-mono text-mono-text">
                {day.steps.toLocaleString()} 歩
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
