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
        最近の睡眠状況と比べて睡眠時間が短めだったため、
        <br />
        無理をせず体を休めることをおすすめします。
      </>
    ),
  },
  activity_day: {
    title: '運動日',
    subtitle: (
      <>
        昨日の活動量が最近の傾向より少なめだったため、
        <br />
        軽い散歩やストレッチなどがおすすめです。
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
        <p className="text-3xl font-light tracking-widest text-mono-muted font-bold sm:text-4xl text-[#7ecfc4]">
          {copy.title}
        </p>
        <div className="mt-4 text-sm text-mono-muted/70 wrap-anywhere"><div>{copy.subtitle}</div></div>
      </div>
    </div>
  )
}
