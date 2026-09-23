import { Alpaca } from '@alpacahq/alpaca-trade-api'
import { createError } from 'h3'

let client: Alpaca | undefined

export function hasAlpacaKeys(): boolean {
  const { alpacaKeyId, alpacaSecretKey } = useRuntimeConfig()
  return Boolean(alpacaKeyId && alpacaSecretKey)
}

/** Memoized paper-trading client. Throws a 503 when the keys are missing from .env. */
export function getAlpaca(): Alpaca {
  if (client) return client
  const { alpacaKeyId, alpacaSecretKey } = useRuntimeConfig()
  if (!alpacaKeyId || !alpacaSecretKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Alpaca keys not configured. Set NUXT_ALPACA_KEY_ID and NUXT_ALPACA_SECRET_KEY in .env'
    })
  }
  client = new Alpaca({ keyId: alpacaKeyId, secret: alpacaSecretKey, paper: true })
  return client
}
