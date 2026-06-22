/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_FITBIT_CLIENT_ID: string
  readonly VITE_FITBIT_REDIRECT_URI: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
