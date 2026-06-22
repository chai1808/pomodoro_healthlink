import { STORAGE_KEYS } from './constants'

export type Coordinates = {
  lat: number
  lon: number
}

export type LocationSource = 'geolocation' | 'cache' | 'default'

export type ResolvedLocation = {
  coords: Coordinates
  label: string
  source: LocationSource
}

/** 位置情報拒否時のフォールバック（名古屋市） */
export const DEFAULT_COORDS: Coordinates = {
  lat: 35.1814,
  lon: 136.9063,
}

const DEFAULT_LABEL = '名古屋市'

type ReverseGeocodeResult = {
  results?: Array<{
    name?: string
    admin1?: string
    admin2?: string
  }>
}

const readCachedLocation = (): ResolvedLocation | null => {
  const raw = localStorage.getItem(STORAGE_KEYS.userLocation)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as ResolvedLocation
    if (
      Number.isNaN(parsed.coords.lat) ||
      Number.isNaN(parsed.coords.lon) ||
      !parsed.label
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

const cacheLocation = (location: ResolvedLocation): void => {
  localStorage.setItem(STORAGE_KEYS.userLocation, JSON.stringify(location))
}

const requestGeolocation = (): Promise<Coordinates | null> =>
  new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        })
      },
      () => resolve(null),
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60 * 60 * 1000,
      },
    )
  })

export const reverseGeocodeLabel = async (
  coords: Coordinates,
): Promise<string | null> => {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/reverse')
  url.searchParams.set('latitude', String(coords.lat))
  url.searchParams.set('longitude', String(coords.lon))
  url.searchParams.set('language', 'ja')
  url.searchParams.set('count', '1')

  try {
    const response = await fetch(url)
    if (!response.ok) return null

    const data = (await response.json()) as ReverseGeocodeResult
    const place = data.results?.[0]
    if (!place) return null

    return place.name ?? place.admin2 ?? place.admin1 ?? null
  } catch {
    return null
  }
}

const buildResolvedLocation = async (
  coords: Coordinates,
  source: LocationSource,
  fallbackLabel: string,
): Promise<ResolvedLocation> => {
  const geocoded = await reverseGeocodeLabel(coords)
  return {
    coords,
    label: geocoded ?? fallbackLabel,
    source,
  }
}

/** Geolocation API → キャッシュ → 名古屋デフォルト */
export const resolveUserLocation = async (): Promise<ResolvedLocation> => {
  const geolocated = await requestGeolocation()
  if (geolocated) {
    const location = await buildResolvedLocation(
      geolocated,
      'geolocation',
      DEFAULT_LABEL,
    )
    cacheLocation(location)
    return location
  }

  const cached = readCachedLocation()
  if (cached) {
    return { ...cached, source: 'cache' }
  }

  return {
    coords: DEFAULT_COORDS,
    label: DEFAULT_LABEL,
    source: 'default',
  }
}

export const clearCachedLocation = (): void => {
  localStorage.removeItem(STORAGE_KEYS.userLocation)
}
