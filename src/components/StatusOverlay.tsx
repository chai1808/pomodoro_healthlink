import type { ReactNode } from 'react'
import type { HealthStatus } from '../types'

type StatusOverlayProps = {
  status: HealthStatus
  visible: boolean
}

const STATUS_COPY: Record<
  Exclude<HealthStatus, 'healthy'>,
  { title: string; subtitle: ReactNode }
> = {
  sleep_day: {
    title: '睡眠日',
    subtitle: (
      <>
        今日の睡眠時間が、
        <br />
        直近の睡眠記録(最大8件)の平均の70%より下のため、
        <br />
        本日は休息を優先してください
      </>
    ),
  },
  activity_day: {
    title: '運動日',
    subtitle: (
      <>
        昨日の歩数が、
        <br />
        直近7日間の上位・下位1位を除いた平均の70%より下のため、
        <br />
        本日は運動を優先してください
      </>
    ),
  },
  data_unavailable: {
    title: 'データ取得中',
    subtitle: (
      <>
        Google Health から睡眠・歩数を取得できませんでした。
        <br />
        Fitbit アプリで同期後、再読み込みしてください
      </>
    ),
  },
}

export const StatusOverlay = ({ status, visible }: StatusOverlayProps) => {
  if (!visible || status === 'healthy') return null

  const copy = STATUS_COPY[status]

  return (
    <div
      className="absolute inset-0 px-4 z-20 flex items-center justify-center bg-mono-bg/85 backdrop-blur-sm"
      role="alert"
      aria-live="assertive"
    >
      <div className="text-center">
        <p className="text-3xl font-light tracking-widest text-mono-muted font-bold sm:text-4xl">
          {copy.title}
        </p>
        <p className="mt-4 text-sm text-mono-muted/70">{copy.subtitle}</p>
      </div>
    </div>
  )
}
