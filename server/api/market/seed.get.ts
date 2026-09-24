import type { AssetClass, SeedDto } from '#shared/types/trading'
import { isCryptoSymbol, normalizeSymbol } from '#shared/utils/symbols'
import { withAlpaca } from '../../utils/errors'
import { alpacaMarketData, fetchBars, fetchMinuteBars, fetchSnapshots } from '../../utils/market-data'
import type { JevBar, SnapshotLike } from '../../utils/market-data'
import { num } from '../../utils/normalize'

const CACHE_MS = 30_000
const MAX_SYMBOLS = 50
const BARS = 60
const DAY = 86_400_000
const cache = new Map<string, { at: number, seed: SeedDto }>()

function empty(symbol: string, assetClass: AssetClass): SeedDto {
  return { symbol, assetClass, closes: [], lastPrice: null, lastTs: null, prevClose: null }
}

function toSeed(symbol: string, assetClass: AssetClass, bars: JevBar[], snap: SnapshotLike | undefined): SeedDto {
  const closes = bars.map(b => b.close)
  return {
    symbol,
    assetClass,
    closes,
    lastPrice: num(snap?.latestTrade?.p) ?? closes.at(-1) ?? null,
    lastTs: snap?.latestTrade?.t ? new Date(snap.latestTrade.t).toISOString() : null,
    prevClose: num(snap?.prevDailyBar?.c) ?? (assetClass === 'crypto' ? closes[0] ?? null : null)
  }
}

async function seedStocks(symbols: string[]): Promise<SeedDto[]> {
  if (!symbols.length) return []
  const md = alpacaMarketData()
  const [minute, snapshots] = await Promise.all([
    fetchMinuteBars(md, symbols, 'us_equity', { limit: BARS, sinceMs: 3 * DAY }),
    fetchSnapshots(md, symbols, 'us_equity')
  ])
  // Thinly traded names (or a long weekend) may lack minute bars; fall back to hourly for the sparkline.
  const thin = symbols.filter(s => (minute[s]?.length ?? 0) < 10)
  const hourly = thin.length ? await fetchBars(md, thin, 'us_equity', { limit: BARS, sinceMs: 10 * DAY, timeframe: 'hour' }) : {}
  return symbols.map((symbol) => {
    const bars = (minute[symbol]?.length ?? 0) >= 10 ? minute[symbol]! : hourly[symbol] ?? []
    return toSeed(symbol, 'us_equity', bars, snapshots[symbol])
  })
}

async function seedCrypto(symbols: string[]): Promise<SeedDto[]> {
  if (!symbols.length) return []
  const md = alpacaMarketData()
  const [minute, snapshots] = await Promise.all([
    fetchMinuteBars(md, symbols, 'crypto', { limit: BARS, sinceMs: DAY }),
    fetchSnapshots(md, symbols, 'crypto')
  ])
  return symbols.map(symbol => toSeed(symbol, 'crypto', minute[symbol] ?? [], snapshots[symbol]))
}

export default defineEventHandler(async (event) => {
  const raw = String(getQuery(event).symbols ?? '')
  const symbols = [...new Set(raw.split(',').map(normalizeSymbol).filter(Boolean))].slice(0, MAX_SYMBOLS)
  const result: Record<string, SeedDto> = {}
  const now = Date.now()
  const missing: string[] = []
  for (const s of symbols) {
    const hit = cache.get(s)
    if (hit && now - hit.at < CACHE_MS) result[s] = hit.seed
    else missing.push(s)
  }
  if (missing.length) {
    const stocks = missing.filter(s => !isCryptoSymbol(s))
    const crypto = missing.filter(isCryptoSymbol)
    const [stockSeeds, cryptoSeeds] = await withAlpaca(() => Promise.all([seedStocks(stocks), seedCrypto(crypto)]))
    for (const seed of [...stockSeeds, ...cryptoSeeds]) {
      cache.set(seed.symbol, { at: now, seed })
      result[seed.symbol] = seed
    }
    for (const s of missing) result[s] ??= empty(s, isCryptoSymbol(s) ? 'crypto' : 'us_equity')
  }
  return result
})
