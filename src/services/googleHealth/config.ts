type HealthConfig = {
  clientId: string
  redirectUri: string
}

let config: HealthConfig | null = null

const defaultRedirectUri = (): string =>
  `${window.location.origin}/auth/google/callback`

export const loadHealthConfig = async (): Promise<HealthConfig> => {
  if (config) return config

  const buildClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
  const buildRedirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI ?? ''

  if (buildClientId) {
    config = {
      clientId: buildClientId,
      redirectUri: buildRedirectUri || defaultRedirectUri(),
    }
    return config
  }

  try {
    const response = await fetch('/api/config')
    if (response.ok) {
      const data = (await response.json()) as {
        clientId?: string
        redirectUri?: string
      }
      config = {
        clientId: data.clientId ?? '',
        redirectUri: data.redirectUri || defaultRedirectUri(),
      }
      return config
    }
  } catch {
    // fall through to empty config
  }

  config = { clientId: '', redirectUri: defaultRedirectUri() }
  return config
}

export const getHealthConfig = (): HealthConfig => {
  if (!config) {
    throw new Error('Health config not loaded')
  }
  return config
}

export const isHealthConfigured = (): boolean => Boolean(config?.clientId)
