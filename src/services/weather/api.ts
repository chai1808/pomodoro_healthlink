import type { WeatherInfo, PressurePoint } from '../../types'
import type { Coordinates, ResolvedLocation } from '../../lib/location'
import {
  calcForecastDayPressureDrops,
  calcForecastMaxDrop,
  calcTodayPressureRange,
} from '../../lib/healthJudgment'
import { MAX_DROP_THRESHOLD } from '../../lib/constants'
import { fetchJmaWarnings } from '../jma/api'

const WMO_LABELS: Record<number, string> = {
  0: '快晴',
  1: '晴れ',
  2: '晴れ時々曇り',
  3: '曇り',
  45: '霧',
  48: '霧',
  51: '霧雨',
  53: '霧雨',
  55: '霧雨',
  56: '着氷性霧雨',
  57: '着氷性霧雨',
  61: '雨',
  63: '雨',
  65: '大雨',
  66: '着氷性の雨',
  67: '着氷性の雨',
  71: '雪',
  73: '雪',
  75: '大雪',
  77: '雪',
  80: 'にわか雨',
  81: 'にわか雨',
  82: '激しいにわか雨',
  85: 'にわか雪',
  86: '激しいにわか雪',
  95: '雷雨',
  96: '雷雨',
  99: '激しい雷雨',
}

const WMO_EMOJI: Record<number, string> = {
  0: '☀️',
  1: '🌤️',
  2: '⛅',
  3: '☁️',
  45: '🌫️',
  48: '🌫️',
  51: '🌦️',
  53: '🌦️',
  55: '🌧️',
  56: '🌧️',
  57: '🌧️',
  61: '🌧️',
  63: '🌧️',
  65: '🌧️',
  66: '🌧️',
  67: '🌧️',
  71: '❄️',
  73: '❄️',
  75: '❄️',
  77: '❄️',
  80: '🌦️',
  81: '🌦️',
  82: '🌧️',
  85: '🌨️',
  86: '🌨️',
  95: '⛈️',
  96: '⛈️',
  99: '⛈️',
}

const getWeatherDescription = (code: number): string =>
  WMO_LABELS[code] ?? '不明'

const getWeatherEmoji = (code: number): string =>
  WMO_EMOJI[code] ?? '🌡️'

const PAST_DAYS = 2
const FORECAST_DAYS = 2
const CHART_DAYS = FORECAST_DAYS + 1

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
  rangeStart.setDate(rangeStart.getDate() - PAST_DAYS)
  const rangeEnd = startOfDay(new Date())
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
  location: ResolvedLocation,
): Promise<WeatherInfo> => {
  const jma = await fetchJmaWarnings(location.coords)
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
    locationLabel: location.label,
    locationSource: location.source,
    jmaHeadline: jma.headline,
    jmaAreaName: jma.areaName,
    jmaOfficeName: jma.officeName,
    jmaTodayWarnings: jma.todayWarnings,
    jmaForecastDayWarnings: jmaForecastDayWarnings,
  }
}

const fetchOpenMeteo = async (coords: Coordinates): Promise<OpenMeteoResponse> => {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(coords.lat))
  url.searchParams.set('longitude', String(coords.lon))
  url.searchParams.set('timezone', 'Asia/Tokyo')
  url.searchParams.set('past_days', String(PAST_DAYS))
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

export const fetchWeather = async (
  location: ResolvedLocation,
): Promise<WeatherInfo> => {
  const data = await fetchOpenMeteo(location.coords)
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
    location,
  )
}
