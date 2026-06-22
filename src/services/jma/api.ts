import { kindCodeToLabel } from './warningCodes'

const OFFICE_CODE = import.meta.env.VITE_JMA_OFFICE_CODE ?? ''
const AREA_CODE = import.meta.env.VITE_JMA_AREA_CODE ?? ''
const LAT = Number(import.meta.env.VITE_WEATHER_LAT ?? '35.6762')
const LON = Number(import.meta.env.VITE_WEATHER_LON ?? '139.6503')

type JmaKind = {
  code?: string
  status: string
  properties?: Array<{ type?: string }>
}

type JmaAreaItem = {
  areaCode: string
  kinds: JmaKind[]
}

type JmaWarningReport = {
  reportDatetime: string
  headlineText?: string
  warning?: {
    class10Items?: JmaAreaItem[]
    class20Items?: JmaAreaItem[]
  }
}

type JmaForecastArea = {
  area: { name: string; code: string }
  weathers?: string[]
  winds?: string[]
  waves?: string[]
}

type JmaForecastSeries = {
  timeDefines: string[]
  areas: JmaForecastArea[]
}

export type JmaWarningState = {
  headline: string
  todayWarnings: string[]
  forecastDayWarnings: Array<{ date: string; warnings: string[] }>
}

const ACTIVE_STATUSES = new Set(['発表', '継続', '切替'])

const toDecimalDegrees = ([degrees, minutes]: [number, number]): number =>
  degrees + minutes / 60

const uniqueLabels = (labels: string[]): string[] =>
  [...new Set(labels.filter(Boolean))]

const extractLabelsFromKinds = (kinds: JmaKind[]): string[] =>
  kinds
    .filter((kind) => ACTIVE_STATUSES.has(kind.status))
    .map((kind) =>
      kindCodeToLabel(kind.code, kind.properties?.find((p) => p.type)?.type),
    )

const pickAreaItems = (
  report: JmaWarningReport,
  areaCode: string,
): JmaAreaItem[] => {
  const class20 = report.warning?.class20Items ?? []
  const class10 = report.warning?.class10Items ?? []

  if (areaCode) {
    const exact20 = class20.filter((item) => item.areaCode === areaCode)
    if (exact20.length > 0) return exact20

    const exact10 = class10.filter((item) => item.areaCode === areaCode)
    if (exact10.length > 0) return exact10
  }

  return [...class20, ...class10]
}

const resolveOfficeCode = async (): Promise<string> => {
  if (OFFICE_CODE) return OFFICE_CODE

  if (LAT >= 33.72 && LAT <= 35.05 && LON >= 135.73 && LON <= 136.99) {
    return '240000'
  }
  if (LAT >= 34.15 && LAT <= 35.7 && LON >= 136.0 && LON <= 137.95) {
    return '230000'
  }
  if (LAT >= 35.05 && LAT <= 35.95 && LON >= 138.9 && LON <= 140.9) {
    return '130000'
  }

  const amedasRes = await fetch(
    'https://www.jma.go.jp/bosai/amedas/const/amedastable.json',
  )
  if (!amedasRes.ok) return ''

  const amedasTable = (await amedasRes.json()) as Record<
    string,
    { lat: [number, number]; lon: [number, number] }
  >

  let nearestId = ''
  let nearestDistance = Number.POSITIVE_INFINITY

  Object.entries(amedasTable).forEach(([id, station]) => {
    if (!station.lat || !station.lon) return
    const slat = toDecimalDegrees(station.lat)
    const slon = toDecimalDegrees(station.lon)
    const distance = (slat - LAT) ** 2 + (slon - LON) ** 2
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestId = id
    }
  })

  const areaRes = await fetch('https://www.jma.go.jp/bosai/common/const/area.json')
  if (!areaRes.ok) return ''

  const areaData = (await areaRes.json()) as {
    offices: Record<string, { name: string }>
  }

  const prefCandidates = [
    nearestId.slice(0, 2) + '0000',
    nearestId.slice(0, 1) + '40000',
  ]

  return prefCandidates.find((code) => areaData.offices[code]) ?? ''
}

const resolveAreaCode = async (officeCode: string): Promise<string> => {
  if (AREA_CODE) return AREA_CODE

  const forecastRes = await fetch(
    `https://www.jma.go.jp/bosai/forecast/data/forecast/${officeCode}.json`,
  )
  if (!forecastRes.ok) return ''

  const forecast = (await forecastRes.json()) as Array<{
    timeSeries: JmaForecastSeries[]
  }>

  const dailySeries = forecast[0]?.timeSeries?.[0]
  if (!dailySeries?.areas?.[0]?.area.code) return ''

  return dailySeries.areas[0].area.code
}

const fetchLatestWarningReport = async (
  officeCode: string,
): Promise<JmaWarningReport | null> => {
  const response = await fetch(
    `https://www.jma.go.jp/bosai/warning/data/r8/${officeCode}.json`,
  )
  if (!response.ok) return null

  const reports = (await response.json()) as JmaWarningReport[]
  if (!Array.isArray(reports) || reports.length === 0) return null

  return reports.reduce((latest, report) =>
    new Date(report.reportDatetime) > new Date(latest.reportDatetime)
      ? report
      : latest,
  )
}

const formatDateLabel = (iso: string): string => {
  const date = new Date(iso)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

const isLandWindRisk = (windText: string): boolean => {
  const normalized = windText.replace(/\s/g, '')
  if (!normalized.includes('強く')) return false
  if (normalized.includes('海上') && !normalized.includes('陸上')) {
    return normalized.includes('やや強く') && !normalized.startsWith('海上')
  }
  return true
}

const fetchForecastWindRisks = async (
  officeCode: string,
  areaCode: string,
): Promise<Array<{ date: string; warnings: string[] }>> => {
  const response = await fetch(
    `https://www.jma.go.jp/bosai/forecast/data/forecast/${officeCode}.json`,
  )
  if (!response.ok) return []

  const forecast = (await response.json()) as Array<{
    timeSeries: JmaForecastSeries[]
  }>

  const dailySeries = forecast[0]?.timeSeries?.[0]
  if (!dailySeries) return []

  const targetArea =
    dailySeries.areas.find((area) => area.area.code === areaCode) ??
    dailySeries.areas[0]

  if (!targetArea?.winds) return []

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  return dailySeries.timeDefines
    .map((timeDefine, index) => {
      const date = new Date(timeDefine)
      const dayOffset = Math.floor(
        (date.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000),
      )
      if (dayOffset < 1 || dayOffset > 2) return null

      const windText = targetArea.winds?.[index] ?? ''
      if (!isLandWindRisk(windText)) return null

      return {
        date: formatDateLabel(timeDefine),
        warnings: ['強風注意報相当（予報）'],
      }
    })
    .filter((item): item is { date: string; warnings: string[] } => item !== null)
}

export const fetchJmaWarnings = async (): Promise<JmaWarningState> => {
  const empty: JmaWarningState = {
    headline: '',
    todayWarnings: [],
    forecastDayWarnings: [],
  }

  try {
    const officeCode = await resolveOfficeCode()
    if (!officeCode) return empty

    const areaCode = await resolveAreaCode(officeCode)
    const [report, forecastRisks] = await Promise.all([
      fetchLatestWarningReport(officeCode),
      fetchForecastWindRisks(officeCode, areaCode),
    ])

    const todayWarnings = report
      ? uniqueLabels(
          pickAreaItems(report, areaCode).flatMap((item) =>
            extractLabelsFromKinds(item.kinds),
          ),
        )
      : []

    const forecastDayWarnings = forecastRisks.map((day) => ({
      date: day.date,
      warnings: uniqueLabels(day.warnings),
    }))

    return {
      headline: report?.headlineText ?? '',
      todayWarnings,
      forecastDayWarnings,
    }
  } catch {
    return empty
  }
}
