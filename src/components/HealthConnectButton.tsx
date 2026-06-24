import { startHealthAuth } from '../services/googleHealth/api'

type HealthConnectButtonProps = {
  configured: boolean
}

export const HealthConnectButton = ({ configured }: HealthConnectButtonProps) => {
  const handleConnect = () => {
    void startHealthAuth()
  }

  return (
    <button
      type="button"
      onClick={handleConnect}
      disabled={!configured}
      className="duration-200 cursor-pointer rounded-full border border-mono-border bg-mono-surface px-4 py-2.5 text-xs text-mono-text shadow-lg hover:border-mono-text focus:outline-none focus-visible:ring-2 focus-visible:ring-mono-text disabled:cursor-not-allowed disabled:opacity-40"
      aria-label={configured ? 'Fitbit と連携する' : 'Google OAuth クライアント ID が未設定'}
    >
      Fitbit連携
    </button>
  )
}
