import type { ActivityData } from '../types'
import { isoDate } from '../services/googleHealth/format'

type ActivitySummaryProps = {
  activity: ActivityData
  healthConfigured: boolean
  healthConnected: boolean
}

const DISPLAY_DAYS = 6

const isValidStepDay = (day: ActivityData['dailySteps'][number]): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(day.date) && day.steps >= 0

const calcAvgSteps = (steps: ActivityData['dailySteps']): number => {
  if (steps.length === 0) return 0
  const total = steps.reduce((sum, day) => sum + day.steps, 0)
  return Math.round(total / steps.length)
}

export const ActivitySummary = ({
  activity,
  healthConfigured,
  healthConnected,
}: ActivitySummaryProps) => {
  if (!healthConfigured || !healthConnected) return null

  const today = isoDate(new Date())

  const steps = [...activity.dailySteps]
    .filter(isValidStepDay)
    .filter((day) => day.date <= today)
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, DISPLAY_DAYS)

  if (steps.length === 0) return null

  const avgSteps = calcAvgSteps(steps)

  return (
    <section
      className="rounded-lg border border-mono-border bg-mono-surface px-4 py-3"
      aria-label="歩数"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-xs tracking-widest text-mono-muted uppercase">
          Steps
        </h2>
        <p className="text-sm text-mono-muted">
          平均{' '}
          <span className="font-mono text-mono-text">
            {avgSteps.toLocaleString()}
          </span>
          <span className="text-mono-muted"> 歩</span>
        </p>
      </div>

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
    </section>
  )
}
