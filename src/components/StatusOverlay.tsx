import type { HealthStatus } from '../types'

type StatusOverlayProps = {
  status: HealthStatus
  visible: boolean
}

const STATUS_COPY: Record<
  Exclude<HealthStatus, 'healthy'>,
  { title: string; subtitle: string }
> = {
  sleep_day: {
    title: '睡眠日',
    subtitle: '平均睡眠7時間未満のため、本日は休息を優先してください',
  },
  activity_day: {
    title: '運動日',
    subtitle: '活動量が基準未満のため、本日は運動を優先してください',
  },
}

export const StatusOverlay = ({ status, visible }: StatusOverlayProps) => {
  if (!visible || status === 'healthy') return null

  const copy = STATUS_COPY[status]

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-mono-bg/85 backdrop-blur-sm"
      role="alert"
      aria-live="assertive"
    >
      <div className="text-center">
        <p className="text-3xl font-light tracking-widest text-mono-muted sm:text-4xl">
          {copy.title}
        </p>
        <p className="mt-4 text-sm text-mono-muted/70">{copy.subtitle}</p>
      </div>
    </div>
  )
}
