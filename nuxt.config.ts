import { JEV_DEFAULTS } from './shared/utils/jev-config'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', 'nuxt-icons'],
  css: ['~/assets/css/main.css'],
  ui: {
    theme: {
      colors: ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'gain', 'loss']
    }
  },
  colorMode: {
    preference: 'dark',
    fallback: 'dark'
  },
  fonts: {
    families: [
      { name: 'IBM Plex Mono', weights: [400, 500, 600] },
      { name: 'IBM Plex Sans', weights: [400, 500, 600] }
    ]
  },
  routeRules: {
    '/': { ssr: false }
  },
  vite: {
    server: {
      // Dev only: let an ngrok tunnel reach the dev server (Vite blocks unknown hosts otherwise).
      allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.ngrok.dev', '.ngrok.io']
    }
  },
  nitro: {
    experimental: { websocket: true },
    // Jev engine state and decision log survive restarts here (gitignored).
    storage: {
      jev: { driver: 'fs', base: '.data/jev' }
    }
  },
  runtimeConfig: {
    // Populated from NUXT_ALPACA_KEY_ID / NUXT_ALPACA_SECRET_KEY in .env
    alpacaKeyId: '',
    alpacaSecretKey: '',
    // Vercel AI Gateway key (NUXT_AI_GATEWAY_API_KEY). Jev stays disabled without it.
    aiGatewayApiKey: '',
    // Jev rails; each key is overridable as NUXT_JEV_<SNAKE_CASE> (see .env.example).
    jev: { ...JEV_DEFAULTS }
  }
})
