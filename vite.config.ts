import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
// @ts-expect-error JS module without bundled types
import { exchangeGoogleToken } from './api/lib/exchangeGoogleToken.js'
// @ts-expect-error JS module without bundled types
import { getVapidConfig, isVapidConfigured } from './api/lib/vapid.js'
// @ts-expect-error JS module without bundled types
import { cancelPushNotifications, dispatchDuePushes, schedulePushNotifications } from './api/lib/pushStore.js'

const readRequestBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

const pushApiPlugin = (): Plugin => ({
  name: 'push-api',
  configureServer(server) {
    server.middlewares.use('/api/push/vapid-public-key', (req, res, next) => {
      if (req.method !== 'GET') {
        next()
        return
      }

      if (!isVapidConfigured()) {
        sendJson(res, 503, { error: 'vapid_not_configured' })
        return
      }

      sendJson(res, 200, { publicKey: getVapidConfig().publicKey })
    })

    server.middlewares.use('/api/push/schedule', async (req, res, next) => {
      if (req.method !== 'POST' && req.method !== 'DELETE') {
        next()
        return
      }

      if (!isVapidConfigured()) {
        sendJson(res, 503, { error: 'vapid_not_configured' })
        return
      }

      try {
        const rawBody = await readRequestBody(req)
        const body = rawBody ? JSON.parse(rawBody) : {}

        if (req.method === 'DELETE') {
          if (!body.endpoint) {
            sendJson(res, 400, { error: 'endpoint_required' })
            return
          }

          await cancelPushNotifications(body.endpoint)
          sendJson(res, 200, { cancelled: true })
          return
        }

        if (!body.subscription?.endpoint) {
          sendJson(res, 400, { error: 'invalid_subscription' })
          return
        }

        const result = await schedulePushNotifications(
          body.subscription,
          body.phases ?? [],
        )
        sendJson(res, 200, result)
      } catch (err) {
        sendJson(res, 500, {
          error: 'schedule_failed',
          message: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    })

    server.middlewares.use('/api/cron/dispatch-pushes', async (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'POST') {
        next()
        return
      }

      if (!isVapidConfigured()) {
        sendJson(res, 503, { error: 'vapid_not_configured' })
        return
      }

      try {
        const result = await dispatchDuePushes()
        sendJson(res, 200, result)
      } catch (err) {
        sendJson(res, 500, {
          error: 'dispatch_failed',
          message: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    })
  },
})

const googleTokenApiPlugin = (clientSecret: string): Plugin => ({
  name: 'google-token-api',
  configureServer(server) {
    server.middlewares.use(
      '/api/google/token',
      async (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }

        try {
          const body = await readRequestBody(req)
          const { status, text } = await exchangeGoogleToken(body, clientSecret)
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          ;(res as ServerResponse).end(text)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          ;(res as ServerResponse).end(
            JSON.stringify({
              error: 'proxy_failed',
              message: err instanceof Error ? err.message : 'Unknown error',
            }),
          )
        }
      },
    )
  },
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      pushApiPlugin(),
      googleTokenApiPlugin(env.GOOGLE_CLIENT_SECRET),
      react(),
      tailwindcss(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        injectRegister: false,
        includeAssets: ['favicon.svg'],
        devOptions: {
          enabled: true,
          type: 'module',
          navigateFallback: 'index.html',
        },
        manifest: {
          name: 'Pomodoro Healthlink',
          short_name: 'Healthlink',
          description: '睡眠・気圧・活動量に連動するポモドーロタイマー',
          theme_color: '#020617',
          background_color: '#020617',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          icons: [
            {
              src: 'favicon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        },
        workbox: {
          navigateFallbackDenylist: [/^\/api\//],
        },
      }),
    ],
  }
})
