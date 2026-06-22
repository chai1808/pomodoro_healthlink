/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare class TimestampTrigger implements NotificationTrigger {
  constructor(timestamp: number)
  readonly timestamp: number
}

interface ImportMetaEnv {  readonly VITE_GOOGLE_CLIENT_ID: string
  readonly VITE_GOOGLE_REDIRECT_URI: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
