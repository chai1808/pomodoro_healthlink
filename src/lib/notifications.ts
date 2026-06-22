import type { PhaseNotification } from './timerSchedule'

const NOTIFICATION_TAG_PREFIX = 'pomodoro-'

const notificationOptions = (body: string) => ({
  body,
  icon: '/favicon.svg',
  badge: '/favicon.svg',
  silent: false,
  vibrate: [180, 90, 180, 90, 180] as number[],
})

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false

  const result = await Notification.requestPermission()
  return result === 'granted'
}

const getServiceWorkerRegistration = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

export const showTimerNotification = async (
  title: string,
  body: string,
): Promise<void> => {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return
  }

  const registration = await getServiceWorkerRegistration()
  const options = notificationOptions(body)

  if (registration) {
    try {
      await registration.showNotification(title, {
        ...options,
        tag: `${NOTIFICATION_TAG_PREFIX}immediate-${Date.now()}`,
      })
      return
    } catch {
      // fall through
    }
  }

  new Notification(title, { body, icon: '/favicon.svg' })
}

export const cancelScheduledTimerNotifications = async (): Promise<void> => {
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
): Promise<void> => {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return
  }

  const registration = await getServiceWorkerRegistration()
  if (!registration) return

  await cancelScheduledTimerNotifications()

  const canSchedule = typeof TimestampTrigger === 'function'

  for (const phase of phases) {
    if (phase.endAt <= Date.now()) continue

    const options: NotificationOptions & { showTrigger?: TimestampTrigger } = {
      ...notificationOptions(phase.body),
      tag: `${NOTIFICATION_TAG_PREFIX}${phase.endAt}`,
    }

    if (canSchedule) {
      options.showTrigger = new TimestampTrigger(phase.endAt)
    }

    try {
      await registration.showNotification(phase.title, options)
    } catch {
      // 予約通知非対応環境ではフォアグラウンド復帰時の同期に任せる
    }
  }
}
