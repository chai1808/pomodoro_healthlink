import type { Coordinates } from '../../lib/location'
import { reverseGeocodeLabel } from '../../lib/location'

type JmaAreaEntry = {
  name: string
  code: string
  parent?: string
}

type JmaAreaConst = {
  offices: Record<string, { name: string }>
  class20s?: JmaAreaEntry[]
}

type AmedasStation = {
  lat?: [number, number]
  lon?: [number, number]
  kjName?: string
}

type ForecastArea = {
  area: { name: string; code: string }
}

let areaConstCache: JmaAreaConst | null = null
let amedasCache: Record<string, AmedasStation> | null = null

const toDecimalDegrees = ([degrees, minutes]: [number, number]): number =>
  degrees + minutes / 60

const normalizePlaceName = (name: string): string =>
  name.replace(/\s/g, '').replace(/(都|道|府|県|市|区|町|村)$/g, '')

const fetchAreaConst = async (): Promise<JmaAreaConst | null> => {
  if (areaConstCache) return areaConstCache

  const response = await fetch(
    'https://www.jma.go.jp/bosai/common/const/area.json',
  )
  if (!response.ok) return null

  areaConstCache = (await response.json()) as JmaAreaConst
  return areaConstCache
}

const fetchAmedasTable = async (): Promise<Record<string, AmedasStation> | null> => {
  if (amedasCache) return amedasCache

  const response = await fetch(
    'https://www.jma.go.jp/bosai/amedas/const/amedastable.json',
  )
  if (!response.ok) return null

  amedasCache = (await response.json()) as Record<string, AmedasStation>
  return amedasCache
}

const findNearestAmedasName = async (
  coords: Coordinates,
): Promise<string | null> => {
  const table = await fetchAmedasTable()
  if (!table) return null

  let nearestName = ''
  let nearestDistance = Number.POSITIVE_INFINITY

  Object.values(table).forEach((station) => {
    if (!station.lat || !station.lon || !station.kjName) return

    const slat = toDecimalDegrees(station.lat)
    const slon = toDecimalDegrees(station.lon)
    const distance =
      (slat - coords.lat) ** 2 + (slon - coords.lon) ** 2

    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestName = station.kjName
    }
  })

  return nearestName || null
}

export const resolveOfficeCode = async (
  coords: Coordinates,
): Promise<{ officeCode: string; officeName: string } | null> => {
  const areaConst = await fetchAreaConst()
  const amedasTable = await fetchAmedasTable()
  if (!areaConst || !amedasTable) return null

  let nearestId = ''
  let nearestDistance = Number.POSITIVE_INFINITY

  Object.entries(amedasTable).forEach(([id, station]) => {
    if (!station.lat || !station.lon) return
    const slat = toDecimalDegrees(station.lat)
    const slon = toDecimalDegrees(station.lon)
    const distance = (slat - coords.lat) ** 2 + (slon - coords.lon) ** 2
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestId = id
    }
  })

  if (!nearestId) return null

  const prefCandidates = [
    nearestId.slice(0, 2) + '0000',
    nearestId.slice(0, 1) + '40000',
  ]

  const officeCode =
    prefCandidates.find((code) => areaConst.offices[code]) ?? ''
  if (!officeCode) return null

  return {
    officeCode,
    officeName: areaConst.offices[officeCode]?.name ?? '',
  }
}

const matchForecastArea = (
  areas: ForecastArea[],
  query: string,
): ForecastArea | null => {
  const normalizedQuery = normalizePlaceName(query)
  if (!normalizedQuery) return null

  const exact = areas.find(
    (entry) => normalizePlaceName(entry.area.name) === normalizedQuery,
  )
  if (exact) return exact

  return (
    areas.find((entry) => {
      const normalizedArea = normalizePlaceName(entry.area.name)
      return (
        normalizedArea.includes(normalizedQuery) ||
        normalizedQuery.includes(normalizedArea)
      )
    }) ?? null
  )
}

const matchClass20Area = (
  class20s: JmaAreaEntry[],
  officeCode: string,
  query: string,
): JmaAreaEntry | null => {
  const candidates = class20s.filter((entry) => entry.parent === officeCode)
  const normalizedQuery = normalizePlaceName(query)
  if (!normalizedQuery) return null

  return (
    candidates.find((entry) => {
      const normalizedArea = normalizePlaceName(entry.name)
      return (
        normalizedArea === normalizedQuery ||
        normalizedArea.includes(normalizedQuery) ||
        normalizedQuery.includes(normalizedArea)
      )
    }) ?? null
  )
}

export const resolveMunicipality = async (
  coords: Coordinates,
  officeCode: string,
  forecastAreas: ForecastArea[],
): Promise<{ areaCode: string; areaName: string } | null> => {
  const placeCandidates = [
    await reverseGeocodeLabel(coords),
    await findNearestAmedasName(coords),
  ].filter((name): name is string => Boolean(name))

  for (const placeName of placeCandidates) {
    const forecastMatch = matchForecastArea(forecastAreas, placeName)
    if (forecastMatch) {
      return {
        areaCode: forecastMatch.area.code,
        areaName: forecastMatch.area.name,
      }
    }

    const areaConst = await fetchAreaConst()
    const class20Match = areaConst?.class20s
      ? matchClass20Area(areaConst.class20s, officeCode, placeName)
      : null
    if (class20Match) {
      return {
        areaCode: class20Match.code,
        areaName: class20Match.name,
      }
    }
  }

  const fallback = forecastAreas[0]
  if (!fallback) return null

  return {
    areaCode: fallback.area.code,
    areaName: fallback.area.name,
  }
}
