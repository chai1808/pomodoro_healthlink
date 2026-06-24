import webpush from 'web-push'
import { getVapidConfig, isVapidConfigured } from './vapid.js'

let configured = false

const ensureWebPushConfigured = () => {
  if (configured || !isVapidConfigured()) return false

  const { subject, publicKey, privateKey } = getVapidConfig()
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
  return true
}

export const sendPushNotification = async (subscription, payload) => {
  if (!ensureWebPushConfigured()) {
    throw new Error('vapid_not_configured')
  }

  return webpush.sendNotification(subscription, JSON.stringify(payload))
}
