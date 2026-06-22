export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false

  const result = await Notification.requestPermission()
  return result === 'granted'
}

export const showTimerNotification = (title: string, body: string): void => {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.showNotification(title, {
          body,
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          tag: 'pomodoro-phase',
        })
      })
      .catch(() => {
        new Notification(title, { body, icon: '/favicon.svg' })
      })
    return
  }

  new Notification(title, { body, icon: '/favicon.svg' })
}
