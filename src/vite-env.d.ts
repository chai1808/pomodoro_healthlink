/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_FITBIT_CLIENT_ID: string
  readonly VITE_FITBIT_REDIRECT_URI: string
  readonly VITE_OPENWEATHER_API_KEY: string
  readonly VITE_WEATHER_LAT: string
  readonly VITE_WEATHER_LON: string
  readonly VITE_USE_MOCK: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
