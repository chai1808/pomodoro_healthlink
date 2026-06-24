const getVapidPublicKey = () =>
  process.env.VITE_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY ?? ''

const getVapidPrivateKey = () => process.env.VAPID_PRIVATE_KEY ?? ''

const getVapidSubject = () =>
  process.env.VAPID_SUBJECT ?? 'mailto:support@pomodoro-healthlink.vercel.app'

export const isVapidConfigured = () =>
  Boolean(getVapidPublicKey() && getVapidPrivateKey())

export const getVapidConfig = () => ({
  publicKey: getVapidPublicKey(),
  privateKey: getVapidPrivateKey(),
  subject: getVapidSubject(),
})
