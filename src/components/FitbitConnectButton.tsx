import { startFitbitAuth } from '../services/fitbit/api'

export const FitbitConnectButton = () => {
  const handleConnect = () => {
    void startFitbitAuth()
  }

  return (
    <button
      type="button"
      onClick={handleConnect}
      className="fixed right-5 bottom-6 z-30 duration-200 cursor-pointer rounded-full border border-mono-border bg-mono-surface px-4 py-2.5 text-xs text-mono-text shadow-lg hover:border-mono-text focus:outline-none focus-visible:ring-2 focus-visible:ring-mono-text"
      aria-label="Fitbit と連携する"
    >
      Fitbit連携
    </button>
  )
}
