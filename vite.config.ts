// @ts-nocheck
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { exchangeGoogleToken } from './api/lib/exchangeGoogleToken.js'

const readRequestBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })

const googleTokenApiPlugin = (clientSecret) => ({
  name: 'google-token-api',
  configureServer(server) {
    server.middlewares.use('/api/google/token', async (req, res, next) => {
      if (req.method !== 'POST') {
        next()
        return
      }

      try {
        const body = await readRequestBody(req)
        const { status, text } = await exchangeGoogleToken(body, clientSecret)
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.end(text)
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error: 'proxy_failed',
            message: err instanceof Error ? err.message : 'Unknown error',
          }),
        )
      }
    })
  },
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      googleTokenApiPlugin(env.GOOGLE_CLIENT_SECRET),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'Pomodoro Healthlink',
          short_name: 'Healthlink',
          description: '睡眠・気圧・活動量に連動するポモドーロタイマー',
          theme_color: '#0a0a0a',
          background_color: '#0a0a0a',
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
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallbackDenylist: [/^\/api\//],
        },
      }),
    ],
  }
})
