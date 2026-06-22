import type { WeatherInfo, PressurePoint } from '../../types'
import {
  calcForecastDayPressureDrops,
  calcForecastMaxDrop,
  calcTodayPressureRange,
} from '../../lib/healthJudgment'
import { MAX_DROP_THRESHOLD } from '../../lib/constants'
import { fetchJmaWarnings } from '../jma/api'
import { getWeatherDescription, getWeatherEmoji } from './weatherCodes'

const LAT = Number(import.meta.env.VITE_WEATHER_LAT ?? '35.6762')
const LON = Number(import.meta.env.VITE_WEATHER_LON ?? '139.6503')

const CHART_DAYS = 3
const FORECAST_DAYS = 2

type OpenMeteoResponse = {
  current: {
    temperature_2m: number
    relative_humidity_2m: number
    weather_code: number
    pressure_msl: number
  }
  hourly: {
    time: string[]
    pressure_msl: number[]
  }
}

const startOfDay = (date: Date): Date => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

const buildDayBoundaries = (points: PressurePoint[]): number[] => {
  const dayBoundaries: number[] = []
  points.forEach((point, i) => {
    if (i === 0) return
    const prevDay = startOfDay(new Date(points[i - 1].timestamp)).getTime()
    const currDay = startOfDay(new Date(point.timestamp)).getTime()
    if (prevDay !== currDay) dayBoundaries.push(i)
  })
  return dayBoundaries
}

const buildPressurePoints = (
  hourly: OpenMeteoResponse['hourly'],
): PressurePoint[] => {
  const rangeStart = startOfDay(new Date())
  const rangeEnd = new Date(rangeStart)
  rangeEnd.setDate(rangeEnd.getDate() + CHART_DAYS)

  return hourly.time
    .map((time, index) => ({
      pressure: hourly.pressure_msl[index],
      timestamp: new Date(time).getTime(),
    }))
    .filter(
      (point) =>
        point.timestamp >= rangeStart.getTime() &&
        point.timestamp < rangeEnd.getTime(),
    )
    .sort((a, b) => a.timestamp - b.timestamp)
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

  const jmaForecastDayWarnings = [1, 2]
    .map((dayOffset) => {
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
    })
    .filter((day) => day.warnings.length > 0)

  return {
    ...weather,
    jmaHeadline: jma.headline,
    jmaTodayWarnings: jma.todayWarnings,
    jmaForecastDayWarnings: jmaForecastDayWarnings,
  }
}

const fetchOpenMeteo = async (): Promise<OpenMeteoResponse> => {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(LAT))
  url.searchParams.set('longitude', String(LON))
  url.searchParams.set('timezone', 'Asia/Tokyo')
  url.searchParams.set('forecast_days', String(CHART_DAYS))
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,weather_code,pressure_msl',
  )
  url.searchParams.set('hourly', 'pressure_msl')

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Open-Meteo error: HTTP ${response.status}`)
  }

  return (await response.json()) as OpenMeteoResponse
}

export const fetchWeather = async (): Promise<WeatherInfo> => {
  const data = await fetchOpenMeteo()
  const chartPoints = buildPressurePoints(data.hourly)

  if (chartPoints.length < 2) {
    throw new Error('Open-Meteo: insufficient hourly data')
  }

  const weatherCode = data.current.weather_code

  return attachJmaData(
    {
      description: getWeatherDescription(weatherCode),
      icon: getWeatherEmoji(weatherCode),
      temp: Math.round(data.current.temperature_2m),
      humidity: Math.round(data.current.relative_humidity_2m),
      pressureRange: calcTodayPressureRange(chartPoints),
      maxDrop: calcForecastMaxDrop(chartPoints, FORECAST_DAYS),
      pressureWave3Days: chartPoints,
      pressureDayBoundaries: buildDayBoundaries(chartPoints),
    },
    chartPoints,
  )
}
