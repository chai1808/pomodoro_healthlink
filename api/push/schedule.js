import { isVapidConfigured } from '../lib/vapid.js'
import {
  cancelPushNotifications,
  schedulePushNotifications,
} from '../lib/pushStore.js'

export default async function handler(req, res) {
  if (!isVapidConfigured()) {
    res.status(503).json({ error: 'vapid_not_configured' })
    return
  }

  if (req.method === 'DELETE') {
    const endpoint =
      typeof req.body === 'object' && req.body !== null
        ? req.body.endpoint
        : undefined

    if (!endpoint) {
      res.status(400).json({ error: 'endpoint_required' })
      return
    }

    await cancelPushNotifications(endpoint)
    res.status(200).json({ cancelled: true })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const { subscription, phases } = body ?? {}

  if (!subscription?.endpoint) {
    res.status(400).json({ error: 'invalid_subscription' })
    return
  }

  try {
    const result = await schedulePushNotifications(subscription, phases ?? [])
    res.status(200).json(result)
  } catch (error) {
    res.status(500).json({
      error: 'schedule_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
