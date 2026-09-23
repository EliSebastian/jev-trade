import type { AssetClass } from '#shared/types/trading'

/** Quote currencies Alpaca crypto pairs settle in, longest first so USDT wins over USD. */
const QUOTE_CURRENCIES = ['USDT', 'USDC', 'USD', 'BTC'] as const

/**
 * Canonical form used everywhere in the app: uppercase, `BTC/USD` for crypto pairs.
 * Accepts `btc-usd`, `btcusd`, ` aapl ` and so on.
 */
export function normalizeSymbol(raw: string | null | undefined): string {
  const s = (raw ?? '').trim().toUpperCase().replace(/\s+/g, '').replace(/-/g, '/')
  if (!s) return ''
  if (s.includes('/')) return s
  for (const quote of QUOTE_CURRENCIES) {
    if (s.length > quote.length + 1 && s.endsWith(quote)) {
      const base = s.slice(0, -quote.length)
      if (/^[A-Z0-9]{2,}$/.test(base)) return `${base}/${quote}`
    }
  }
  return s
}

export function isCryptoSymbol(symbol: string): boolean {
  return symbol.includes('/')
}

export function classifySymbol(symbol: string): AssetClass {
  return isCryptoSymbol(symbol) ? 'crypto' : 'us_equity'
}

/** Alpaca's positions API reports crypto as `BTCUSD`; rewrite to the canonical `BTC/USD`. */
export function toCanonicalSymbol(symbol: string, assetClass: AssetClass): string {
  const upper = symbol.toUpperCase()
  if (assetClass !== 'crypto' || upper.includes('/')) return upper
  return normalizeSymbol(upper)
}

/** Form accepted in URL path segments and by the assets endpoint (`BTCUSD`). */
export function toPathSymbol(symbol: string): string {
  return symbol.replace(/\//g, '')
}
