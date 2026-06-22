import { exchangeGoogleToken } from '../lib/exchangeGoogleToken.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const body =
    typeof req.body === 'string'
      ? req.body
      : new URLSearchParams(req.body ?? {}).toString()

  try {
    const { status, text } = await exchangeGoogleToken(body, process.env.GOOGLE_CLIENT_SECRET)
    res.status(status).setHeader('Content-Type', 'application/json').send(text)
  } catch (err) {
    res.status(500).json({
      error: 'proxy_failed',
      message: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}
