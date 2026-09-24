import type { AssetClass } from '#shared/types/trading'

/**
 * Symbols a fresh install tracks, in the browser and in the Jev engine before any watchlist is saved.
 * Crypto pairs verified tradable on Alpaca paper (2026-09-23); MKR/USD is not.
 */
export const WATCHLIST_DEFAULTS = [
  // US equities
  'AAPL', 'MSFT', 'TSLA', 'SPY',
  // Majors
  'BTC/USD', 'ETH/USD',
  // Large and liquid
  'SOL/USD', 'XRP/USD', 'DOGE/USD', 'LTC/USD', 'BCH/USD',
  'LINK/USD', 'AVAX/USD', 'DOT/USD', 'UNI/USD', 'AAVE/USD',
  // DeFi and smaller caps (thinner volume, noisier signals)
  'CRV/USD', 'SUSHI/USD', 'GRT/USD', 'XTZ/USD', 'BAT/USD', 'YFI/USD',
  // Meme coins (very volatile; expect the avoid flag often)
  'SHIB/USD', 'PEPE/USD', 'TRUMP/USD'
]

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
