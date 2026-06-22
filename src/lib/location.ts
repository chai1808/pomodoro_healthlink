import { STORAGE_KEYS } from './constants'

export type Coordinates = {
  lat: number
  lon: number
}

/** 公開デモ・位置情報拒否時のフォールバック（名古屋市） */
export const DEFAULT_COORDS: Coordinates = {
  lat: 35.1814,
  lon: 136.9063,
}

const readEnvCoords = (): Coordinates | null => {
  const lat = import.meta.env.VITE_WEATHER_LAT
  const lon = import.meta.env.VITE_WEATHER_LON
  if (!lat || !lon) return null

  const parsed = { lat: Number(lat), lon: Number(lon) }
  if (Number.isNaN(parsed.lat) || Number.isNaN(parsed.lon)) return null
  return parsed
}

const readCachedCoords = (): Coordinates | null => {
  const raw = localStorage.getItem(STORAGE_KEYS.userLocation)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Coordinates
    if (Number.isNaN(parsed.lat) || Number.isNaN(parsed.lon)) return null
    return parsed
  } catch {
    return null
  }
}

const cacheCoords = (coords: Coordinates): void => {
  localStorage.setItem(STORAGE_KEYS.userLocation, JSON.stringify(coords))
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
        timeout: 8000,
        maximumAge: 60 * 60 * 1000,
      },
    )
  })

/** 位置情報 → キャッシュ → .env → 名古屋の順で座標を決定 */
export const resolveUserLocation = async (): Promise<Coordinates> => {
  const geolocated = await requestGeolocation()
  if (geolocated) {
    cacheCoords(geolocated)
    return geolocated
  }

  const cached = readCachedCoords()
  if (cached) return cached

  const envCoords = readEnvCoords()
  if (envCoords) return envCoords

  return DEFAULT_COORDS
}

export const clearCachedLocation = (): void => {
  localStorage.removeItem(STORAGE_KEYS.userLocation)
}
