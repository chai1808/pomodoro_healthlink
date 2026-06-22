export default function handler(_req, res) {
  const clientId =
    process.env.VITE_GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? ''
  const redirectUri =
    process.env.VITE_GOOGLE_REDIRECT_URI ?? process.env.GOOGLE_REDIRECT_URI ?? ''

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ clientId, redirectUri })
}
