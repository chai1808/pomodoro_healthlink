import {
  getForecastMaxDropText,
  getTodayPressureRangeText,
} from '../lib/healthJudgment'
import type { PressurePoint, WeatherInfo } from '../types'

type WeatherBadgeProps = {
  weather: WeatherInfo
}

const CHART_WIDTH = 280
const CHART_HEIGHT = 36
const MARKER_HEIGHT = 10
const PAD_X = 4
const PAD_Y = MARKER_HEIGHT + 2

const getPointX = (index: number, count: number): number => {
  const innerW = CHART_WIDTH - PAD_X * 2
  if (count <= 1) return PAD_X
  return PAD_X + (index / (count - 1)) * innerW
}

const buildLinePath = (points: PressurePoint[]): string => {
  if (points.length < 2) return ''

  const pressures = points.map((p) => p.pressure)
  const minP = Math.min(...pressures)
  const maxP = Math.max(...pressures)
  const range = maxP - minP || 1
  const innerH = CHART_HEIGHT - PAD_Y - 2

  return points
    .map((point, i) => {
      const x = getPointX(i, points.length)
      const y = PAD_Y + innerH - ((point.pressure - minP) / range) * innerH
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

const formatDayLabel = (timestamp: number): string => {
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

const buildDaySegments = (
  points: PressurePoint[],
  dayBoundaries: number[],
): Array<{ start: number; end: number; label: string }> => {
  const boundaries = [0, ...dayBoundaries, points.length]
  return boundaries.slice(0, -1).map((start, i) => {
    const end = boundaries[i + 1]
    const mid = Math.floor((start + end - 1) / 2)
    return {
      start,
      end,
      label: formatDayLabel(points[mid]?.timestamp ?? Date.now()),
    }
  })
}

export const WeatherBadge = ({ weather }: WeatherBadgeProps) => {
  const points = weather.pressureWave3Days
  const linePath = buildLinePath(points)
  const daySegments = buildDaySegments(points, weather.pressureDayBoundaries)
  const todayPressureText = getTodayPressureRangeText(
    weather.pressureRange,
    weather.jmaTodayWarnings ?? [],
  )
  const forecastDropText = getForecastMaxDropText(
    weather.maxDrop,
    weather.jmaForecastDayWarnings ?? [],
  )

  return (
    <section
      className="rounded-lg border border-mono-border bg-mono-surface px-4 py-3 pb-6"
      aria-label="天気情報"
    >
      {weather.jmaHeadline && (
        <p className="mb-3 text-[10px] leading-relaxed text-mono-muted">
          {weather.jmaHeadline}
        </p>
      )}
      {(weather.locationLabel || weather.jmaAreaName) && (
        <p className="mb-3 text-[10px] text-mono-muted">
          {weather.locationLabel && (
            <span>
              位置: {weather.locationLabel}
              {weather.locationSource === 'default' && '（デフォルト）'}
            </span>
          )}
          {weather.jmaAreaName && (
            <span>
              {weather.locationLabel ? ' · ' : ''}
              気象庁: {weather.jmaOfficeName ? `${weather.jmaOfficeName} ` : ''}
              {weather.jmaAreaName}
            </span>
          )}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="shrink-0 text-3xl leading-none" aria-hidden="true">
            {weather.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{weather.description}</p>
            <p className="text-xs text-mono-muted">
              {weather.temp}°C · 湿度 {weather.humidity}%
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1 text-xs text-mono-muted sm:ml-auto sm:shrink-0 sm:text-right">
          <p>当日：{todayPressureText}</p>
          <p>先2日：{forecastDropText}</p>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto md:overflow-visible">
        <div className="min-w-[480px] md:min-w-0">
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="w-full"
            role="img"
            aria-label="当日と先2日間の気圧変動"
          >
            {weather.pressureDayBoundaries.map((boundaryIndex) => {
              const x = getPointX(boundaryIndex, points.length)
              return (
                <line
                  key={boundaryIndex}
                  x1={x}
                  y1={PAD_Y}
                  x2={x}
                  y2={CHART_HEIGHT}
                  stroke="#2f2f2f"
                  strokeWidth="0.5"
                  strokeDasharray="1 2"
                />
              )
            })}

            <path
              d={linePath}
              fill="none"
              stroke="#888888"
              strokeWidth="0.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>

          <div className="relative mt-1 h-3 text-[9px] text-mono-muted">
            {daySegments.map((segment) => {
              const left =
                (segment.start / Math.max(points.length - 1, 1)) * 100
              const width =
                ((segment.end - segment.start) /
                  Math.max(points.length - 1, 1)) *
                100
              return (
                <span
                  key={`${segment.start}-${segment.end}`}
                  className="absolute truncate text-center"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                  }}
                >
                  {segment.label}
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
