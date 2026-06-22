import { kindCodeToLabel } from './warningCodes'
import type { Coordinates } from '../../lib/location'
import { resolveMunicipality, resolveOfficeCode } from './region'

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
  areaName: string
  officeName: string
  todayWarnings: string[]
  forecastDayWarnings: Array<{ date: string; warnings: string[] }>
}

const ACTIVE_STATUSES = new Set(['発表', '継続', '切替'])

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

const fetchForecastSeries = async (
  officeCode: string,
): Promise<JmaForecastSeries | null> => {
  const response = await fetch(
    `https://www.jma.go.jp/bosai/forecast/data/forecast/${officeCode}.json`,
  )
  if (!response.ok) return null

  const forecast = (await response.json()) as Array<{
    timeSeries: JmaForecastSeries[]
  }>

  return forecast[0]?.timeSeries?.[0] ?? null
}

const fetchWarningReport = async (
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

const fetchForecastWindRisks = (
  dailySeries: JmaForecastSeries,
  areaCode: string,
): Array<{ date: string; warnings: string[] }> => {
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

export const fetchJmaWarnings = async (
  coords: Coordinates,
): Promise<JmaWarningState> => {
  const empty: JmaWarningState = {
    headline: '',
    areaName: '',
    officeName: '',
    todayWarnings: [],
    forecastDayWarnings: [],
  }

  try {
    const office = await resolveOfficeCode(coords)
    if (!office) return empty

    const forecastSeries = await fetchForecastSeries(office.officeCode)
    if (!forecastSeries) return empty

    const municipality = await resolveMunicipality(
      coords,
      office.officeCode,
      forecastSeries.areas,
    )
    if (!municipality) return empty

    const [report, forecastRisks] = await Promise.all([
      fetchWarningReport(office.officeCode),
      Promise.resolve(
        fetchForecastWindRisks(forecastSeries, municipality.areaCode),
      ),
    ])

    const todayWarnings = report
      ? uniqueLabels(
          pickAreaItems(report, municipality.areaCode).flatMap((item) =>
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
      areaName: municipality.areaName,
      officeName: office.officeName,
      todayWarnings,
      forecastDayWarnings,
    }
  } catch {
    return empty
  }
}
