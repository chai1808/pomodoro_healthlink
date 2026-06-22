import { getStatusMessage } from '../lib/healthJudgment'
import type { HealthStatus } from '../types'

type StatusOverlayProps = {
  status: HealthStatus
  visible: boolean
}

export const StatusOverlay = ({ status, visible }: StatusOverlayProps) => {
  if (!visible || status === 'healthy') return null

  const message = getStatusMessage(status)

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-mono-bg/85 backdrop-blur-sm"
      role="alert"
      aria-live="assertive"
    >
      <div className="text-center">
        <p className="text-3xl font-light tracking-widest text-mono-muted sm:text-4xl">
          {message}
        </p>
        <p className="mt-4 text-sm text-mono-muted/70">
          {status === 'sleep_day'
            ? '平均睡眠7時間未満のため、本日は休息を優先してください'
            : '活動量が基準未満のため、本日は運動を優先してください'}
        </p>
      </div>
    </div>
  )
}
