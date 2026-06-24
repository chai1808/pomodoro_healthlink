import type { PhaseNotification } from './timerSchedule'

const NOTIFICATION_TAG_PREFIX = 'pomodoro-'
const PUSH_ENDPOINT_STORAGE_KEY = 'healthlink_push_endpoint'

let cachedSubscription: PushSubscription | null = null

const urlBase64ToUint8Array = (base64String: string): Uint8Array<ArrayBuffer> => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const outputArray = new Uint8Array(buffer)

  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

const getServiceWorkerRegistration = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!('serviceWorker' in navigator)) return null

  try {
    const existing = await navigator.serviceWorker.getRegistration()
    if (existing?.active) return existing

    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), 5000)
      }),
    ])

    return ready
  } catch {
    return null
  }
}

const fetchVapidPublicKey = async (): Promise<string | null> => {
  const fromEnv = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (fromEnv) return fromEnv

  try {
    const response = await fetch('/api/push/vapid-public-key')
    if (!response.ok) return null
    const data = (await response.json()) as { publicKey?: string }
    return data.publicKey ?? null
  } catch {
    return null
  }
}

const subscriptionToJson = (subscription: PushSubscription) => {
  const json = subscription.toJSON()

  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('invalid_subscription')
  }

  return {
    endpoint: json.endpoint,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  }
}

export const ensurePushSubscription = async (): Promise<PushSubscription | null> => {
  if (!('PushManager' in window)) return null
  if (Notification.permission !== 'granted') return null

  const registration = await getServiceWorkerRegistration()
  if (!registration) return null

  const existing = await registration.pushManager.getSubscription()
  if (existing) {
    cachedSubscription = existing
    localStorage.setItem(PUSH_ENDPOINT_STORAGE_KEY, existing.endpoint)
    return existing
  }

  const publicKey = await fetchVapidPublicKey()
  if (!publicKey) return null

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
    cachedSubscription = subscription
    localStorage.setItem(PUSH_ENDPOINT_STORAGE_KEY, subscription.endpoint)
    return subscription
  } catch {
    return null
  }
}

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') {
    await ensurePushSubscription()
    return true
  }
  if (Notification.permission === 'denied') return false

  const result = await Notification.requestPermission()
  if (result !== 'granted') return false

  await ensurePushSubscription()
  return true
}

export const showTimerNotification = async (
  title: string,
  body: string,
): Promise<void> => {
  if (document.visibilityState === 'hidden') return
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return
  }

  const registration = await getServiceWorkerRegistration()
  if (registration) {
    try {
      await registration.showNotification(title, {
        body,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        silent: false,
        tag: `${NOTIFICATION_TAG_PREFIX}immediate-${Date.now()}`,
      })
      return
    } catch {
      // fall through
    }
  }

  new Notification(title, { body, icon: '/favicon.svg' })
}

const getPushEndpoint = (): string | null =>
  cachedSubscription?.endpoint ?? localStorage.getItem(PUSH_ENDPOINT_STORAGE_KEY)

export const cancelScheduledTimerNotifications = async (): Promise<void> => {
  const endpoint = getPushEndpoint()
  if (endpoint) {
    try {
      await fetch('/api/push/schedule', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      })
    } catch {
      // サーバー側キャンセル失敗時もローカル通知は閉じる
    }
  }

  const registration = await getServiceWorkerRegistration()
  if (!registration) return

  const notifications = await registration.getNotifications()
  for (const notification of notifications) {
    if (notification.tag?.startsWith(NOTIFICATION_TAG_PREFIX)) {
      notification.close()
    }
  }
}

export const schedulePhaseNotifications = async (
  phases: PhaseNotification[],
): Promise<boolean> => {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return false
  }

  const subscription = cachedSubscription ?? (await ensurePushSubscription())
  if (!subscription) return false

  const upcomingPhases = phases
    .filter((phase) => phase.endAt > Date.now())
    .map((phase) => ({
      endAt: phase.endAt,
      title: phase.title,
      body: phase.body,
      tag: `${NOTIFICATION_TAG_PREFIX}${phase.endAt}`,
    }))

  if (upcomingPhases.length === 0) return true

  try {
    const response = await fetch('/api/push/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscriptionToJson(subscription),
        phases: upcomingPhases,
      }),
    })
    return response.ok
  } catch {
    return false
  }
}
