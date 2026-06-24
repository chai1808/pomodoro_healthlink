import { getVapidConfig, isVapidConfigured } from '../lib/vapid.js'

export default function handler(_req, res) {
  if (!isVapidConfigured()) {
    res.status(503).json({ error: 'vapid_not_configured' })
    return
  }

  const { publicKey } = getVapidConfig()
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ publicKey })
}
