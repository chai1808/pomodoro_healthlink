import { dispatchDuePushes } from '../lib/pushStore.js'
import { isVapidConfigured } from '../lib/vapid.js'

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.authorization
    if (auth !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
  }

  if (!isVapidConfigured()) {
    res.status(503).json({ error: 'vapid_not_configured' })
    return
  }

  try {
    const result = await dispatchDuePushes()
    res.status(200).json(result)
  } catch (error) {
    res.status(500).json({
      error: 'dispatch_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
