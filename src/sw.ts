/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.skipWaiting()
clientsClaim()

type PushPayload = {
  title?: string
  body?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  const payload = (event.data?.json() ?? {}) as PushPayload

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Pomodoro Healthlink', {
      body: payload.body ?? '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: payload.tag ?? 'pomodoro-push',
      silent: false,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          return client.focus()
        }
      }
      return self.clients.openWindow('/')
    }),
  )
})
