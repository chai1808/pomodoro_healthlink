import webpush from 'web-push'

const publicKey = webpush.generateVAPIDKeys()

console.log('VAPID_PUBLIC_KEY=' + publicKey.publicKey)
console.log('VITE_VAPID_PUBLIC_KEY=' + publicKey.publicKey)
console.log('VAPID_PRIVATE_KEY=' + publicKey.privateKey)
console.log('VAPID_SUBJECT=mailto:support@pomodoro-healthlink.vercel.app')
