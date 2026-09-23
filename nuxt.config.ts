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
  nitro: {
    experimental: { websocket: true }
  },
  runtimeConfig: {
    // Populated from NUXT_ALPACA_KEY_ID / NUXT_ALPACA_SECRET_KEY in .env
    alpacaKeyId: '',
    alpacaSecretKey: ''
  }
})
