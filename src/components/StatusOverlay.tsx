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
    title: 'データ未取得',
    subtitle: (
      <>
          <div className="mb-4">
            <p className="mb-2">このアプリでは以下の目的で<br />Googleアカウント認証を利用します。</p>
            <ul>
              <li>・Fitbit活動データの取得</li>
              <li>・睡眠データの取得</li>
              <li>・活動量データの表示</li>
              <li>・ポモドーロタイマーとの連携分析</li>
            </ul>
          </div>
          <p>右下のFitbitアプリボタンから連携してください。</p>
      </>
    ),
  },
  data_sleep_unregistered: {
    title: '睡眠データ未登録',
    subtitle: (
      <>
        Google Healthで本日の睡眠データを登録してください。
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
        <p className="text-3xl tracking-widest font-bold sm:text-4xl text-[#c4a574]">
          {copy.title}
        </p>
        <div className="mt-4 text-sm text-mono-text/70 wrap-anywhere"><div>{copy.subtitle}</div></div>
      </div>
    </div>
  )
}
