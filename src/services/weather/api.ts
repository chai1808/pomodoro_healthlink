import type { WeatherInfo, PressurePoint } from '../../types'
import {
  calcForecastDayPressureDrops,
  calcForecastMaxDrop,
  calcTodayPressureRange,
} from '../../lib/healthJudgment'
import { MAX_DROP_THRESHOLD } from '../../lib/constants'
import { fetchJmaWarnings } from '../jma/api'

const API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY ?? ''
const LAT = import.meta.env.VITE_WEATHER_LAT ?? '35.6762'
const LON = import.meta.env.VITE_WEATHER_LON ?? '139.6503'

const HOURS_PER_DAY = 24
const CHART_DAYS = 3
const FORECAST_DAYS = 2

type OneCallResponse = {
  current: {
    temp: number
    humidity: number
    pressure: number
    weather: Array<{ description: string; icon: string }>
  }
  hourly: Array<{
    dt: number
    pressure: number
  }>
}

type ForecastResponse = {
  list: Array<{
    dt: number
    main: {
      pressure: number
      temp: number
      humidity: number
    }
    weather: Array<{ description: string; icon: string }>
  }>
}

type CurrentWeatherResponse = {
  main: {
    temp: number
    humidity: number
    pressure: number
  }
  weather: Array<{ description: string; icon: string }>
}

const startOfDay = (date: Date): Date => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

const buildChartMeta = (points: PressurePoint[]) => {
  const now = Date.now()
  let currentIndex = points.findIndex(
    (point, i) =>
      point.timestamp <= now &&
      (points[i + 1]?.timestamp ?? Number.POSITIVE_INFINITY) > now,
  )
  if (currentIndex < 0) {
    currentIndex = points.reduce(
      (closest, point, i) =>
        Math.abs(point.timestamp - now) <
        Math.abs(points[closest].timestamp - now)
          ? i
          : closest,
      0,
    )
  }

  const dayBoundaries: number[] = []
  points.forEach((point, i) => {
    if (i === 0) return
    const prevDay = startOfDay(new Date(points[i - 1].timestamp)).getTime()
    const currDay = startOfDay(new Date(point.timestamp)).getTime()
    if (prevDay !== currDay) dayBoundaries.push(i)
  })

  return { currentIndex, dayBoundaries }
}

const buildMockPressureWave = (): PressurePoint[] => {
  const points: PressurePoint[] = []
  const start = startOfDay(new Date())
  const totalHours = CHART_DAYS * HOURS_PER_DAY

  for (let i = 0; i < totalHours; i++) {
    const timestamp = start.getTime() + i * 60 * 60 * 1000
    const date = new Date(timestamp)
    const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`
    const hour = String(date.getHours()).padStart(2, '0')

    points.push({
      time: `${dateLabel} ${hour}:00`,
      pressure: 1013 + Math.sin(i / 6) * 2.5 - Math.floor(i / 24) * 0.15,
      timestamp,
    })
  }

  return points
}

const MOCK_PRESSURE_WAVE = buildMockPressureWave()
const MOCK_CHART_META = buildChartMeta(MOCK_PRESSURE_WAVE)

const buildPressureMetrics = (points: PressurePoint[]) => ({
  pressureRange: calcTodayPressureRange(points),
  maxDrop: calcForecastMaxDrop(points, FORECAST_DAYS),
})

const MOCK_WEATHER: WeatherInfo = {
  description: '晴れ',
  icon: '01d',
  temp: 22,
  humidity: 55,
  ...buildPressureMetrics(MOCK_PRESSURE_WAVE),
  pressureWave3Days: MOCK_PRESSURE_WAVE,
  pressureCurrentIndex: MOCK_CHART_META.currentIndex,
  pressureDayBoundaries: MOCK_CHART_META.dayBoundaries,
  isMockData: true,
  mockReason: 'デモデータ',
}

const readOwmError = async (response: Response): Promise<string> => {
  try {
    const data = (await response.json()) as { message?: string }
    if (data.message) return data.message
  } catch {
    /* ignore */
  }
  return `HTTP ${response.status}`
}

const fetchForecastPoints = async (): Promise<{
  points: PressurePoint[]
  error?: string
}> => {
  const url = new URL('https://api.openweathermap.org/data/2.5/forecast')
  url.searchParams.set('lat', LAT)
  url.searchParams.set('lon', LON)
  url.searchParams.set('appid', API_KEY)
  url.searchParams.set('units', 'metric')
  url.searchParams.set('lang', 'ja')

  const response = await fetch(url)
  if (!response.ok) {
    return { points: [], error: await readOwmError(response) }
  }

  const data = (await response.json()) as ForecastResponse
  return {
    points: data.list.map((item) => {
      const date = new Date(item.dt * 1000)
      const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`
      const hour = String(date.getHours()).padStart(2, '0')
      return {
        time: `${dateLabel} ${hour}:00`,
        pressure: item.main.pressure,
        timestamp: item.dt * 1000,
      }
    }),
  }
}

const fetchCurrentWeather = async (): Promise<{
  data: CurrentWeatherResponse | null
  error?: string
}> => {
  const url = new URL('https://api.openweathermap.org/data/2.5/weather')
  url.searchParams.set('lat', LAT)
  url.searchParams.set('lon', LON)
  url.searchParams.set('appid', API_KEY)
  url.searchParams.set('units', 'metric')
  url.searchParams.set('lang', 'ja')

  const response = await fetch(url)
  if (!response.ok) {
    return { data: null, error: await readOwmError(response) }
  }

  return { data: (await response.json()) as CurrentWeatherResponse }
}

const buildPressureChart = (
  hourly: Array<{ dt: number; pressure: number }>,
  forecastPoints: PressurePoint[],
): {
  points: PressurePoint[]
  currentIndex: number
  dayBoundaries: number[]
} => {
  const rangeStart = startOfDay(new Date())
  const rangeEnd = new Date(rangeStart)
  rangeEnd.setDate(rangeEnd.getDate() + CHART_DAYS)

  const hourlyPoints: PressurePoint[] = hourly.map((item) => {
    const date = new Date(item.dt * 1000)
    const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`
    const hour = String(date.getHours()).padStart(2, '0')
    return {
      time: `${dateLabel} ${hour}:00`,
      pressure: item.pressure,
      timestamp: item.dt * 1000,
    }
  })

  const merged = [...hourlyPoints, ...forecastPoints]
    .filter(
      (point) =>
        point.timestamp >= rangeStart.getTime() &&
        point.timestamp < rangeEnd.getTime(),
    )
    .sort((a, b) => a.timestamp - b.timestamp)

  const unique: PressurePoint[] = []
  merged.forEach((point) => {
    const last = unique[unique.length - 1]
    if (!last || last.timestamp !== point.timestamp) {
      unique.push(point)
    }
  })

  if (unique.length < 2 && forecastPoints.length >= 2) {
    const chartPoints = forecastPoints.filter(
      (point) =>
        point.timestamp >= rangeStart.getTime() &&
        point.timestamp < rangeEnd.getTime(),
    )
    const points = chartPoints.length >= 2 ? chartPoints : forecastPoints
    return { points, ...buildChartMeta(points) }
  }

  if (unique.length < 2) {
    return {
      points: MOCK_PRESSURE_WAVE,
      ...MOCK_CHART_META,
    }
  }

  return { points: unique, ...buildChartMeta(unique) }
}

const formatDayLabel = (dayOffset: number): string => {
  const date = new Date()
  date.setDate(date.getDate() + dayOffset)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

const attachJmaData = async (
  weather: WeatherInfo,
  chartPoints: PressurePoint[],
): Promise<WeatherInfo> => {
  const jma = await fetchJmaWarnings()
  const dayDrops = calcForecastDayPressureDrops(chartPoints, FORECAST_DAYS)

  const jmaForecastDayWarnings = [1, 2].map((dayOffset) => {
    const date = formatDayLabel(dayOffset)
    const jmaDay = jma.forecastDayWarnings.find((day) => day.date === date)
    const drop = dayDrops.find((item) => item.dayOffset === dayOffset)
    const warnings = [...(jmaDay?.warnings ?? [])]

    if (drop && drop.maxDrop >= MAX_DROP_THRESHOLD) {
      warnings.push(`6時間で${drop.maxDrop.toFixed(1)}hPa降下`)
    }

    return {
      date,
      warnings: [...new Set(warnings)],
    }
  }).filter((day) => day.warnings.length > 0)

  return {
    ...weather,
    jmaHeadline: jma.headline,
    jmaTodayWarnings: jma.todayWarnings,
    jmaForecastDayWarnings: jmaForecastDayWarnings,
  }
}

const buildWeatherResult = async (
  description: string,
  icon: string,
  temp: number,
  humidity: number,
  chartPoints: PressurePoint[],
  currentIndex: number,
  dayBoundaries: number[],
): Promise<WeatherInfo> =>
  attachJmaData(
    {
      description,
      icon,
      temp,
      humidity,
      ...buildPressureMetrics(chartPoints),
      pressureWave3Days: chartPoints,
      pressureCurrentIndex: currentIndex,
      pressureDayBoundaries: dayBoundaries,
      isMockData: false,
    },
    chartPoints,
  )

export const isWeatherConfigured = (): boolean => Boolean(API_KEY)

export const fetchWeather = async (): Promise<WeatherInfo> => {
  if (!API_KEY) {
    return attachJmaData(
      {
        ...MOCK_WEATHER,
        mockReason: '開発者にご連絡ください',
      },
      MOCK_PRESSURE_WAVE,
    )
  }

  const oneCallUrl = new URL('https://api.openweathermap.org/data/3.0/onecall')
  oneCallUrl.searchParams.set('lat', LAT)
  oneCallUrl.searchParams.set('lon', LON)
  oneCallUrl.searchParams.set('appid', API_KEY)
  oneCallUrl.searchParams.set('units', 'metric')
  oneCallUrl.searchParams.set('lang', 'ja')
  oneCallUrl.searchParams.set('exclude', 'minutely,daily,alerts')

  const [oneCallRes, forecastResult, currentResult] = await Promise.all([
    fetch(oneCallUrl),
    fetchForecastPoints(),
    fetchCurrentWeather(),
  ])

  const forecastPoints = forecastResult.points
  const currentWeather = currentResult.data

  if (oneCallRes.ok) {
    const data = (await oneCallRes.json()) as OneCallResponse
    const pressureChart = buildPressureChart(data.hourly, forecastPoints)

    return buildWeatherResult(
      data.current.weather[0]?.description ?? '',
      data.current.weather[0]?.icon ?? '',
      Math.round(data.current.temp),
      data.current.humidity,
      pressureChart.points,
      pressureChart.currentIndex,
      pressureChart.dayBoundaries,
    )
  }

  if (currentWeather && forecastPoints.length >= 2) {
    const pressureChart = buildPressureChart([], forecastPoints)

    return buildWeatherResult(
      currentWeather.weather[0]?.description ?? '',
      currentWeather.weather[0]?.icon ?? '',
      Math.round(currentWeather.main.temp),
      currentWeather.main.humidity,
      pressureChart.points,
      pressureChart.currentIndex,
      pressureChart.dayBoundaries,
    )
  }

  const apiError =
    forecastResult.error ??
    currentResult.error ??
    (oneCallRes.ok ? undefined : await readOwmError(oneCallRes))

  if (import.meta.env.DEV && apiError) {
    console.warn('[weather] API failed, using mock data:', apiError)
  }

  return attachJmaData(
    {
      ...MOCK_WEATHER,
      mockReason:
        apiError ??
        '天気APIの取得に失敗しました。APIキーを確認してください',
    },
    MOCK_PRESSURE_WAVE,
  )
}

export const getWeatherIconUrl = (icon: string): string =>
  `https://openweathermap.org/img/wn/${icon}@2x.png`
