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
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    const text = await response.text()
    res.status(response.status).setHeader('Content-Type', 'application/json').send(text)
  } catch (err) {
    res.status(500).json({
      error: 'proxy_failed',
      message: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}
