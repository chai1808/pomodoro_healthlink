export const HealthSetupNotice = () => (
  <div className="rounded border border-dashed border-mono-border px-3 py-5 text-center text-xs text-mono-muted">
    <p className="text-mono-text">Google Health API が未設定です</p>
    <p className="mt-1">VITE_GOOGLE_CLIENT_ID を .env に設定してください</p>
  </div>
)
