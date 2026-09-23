import { TimeFrame } from '@alpacahq/alpaca-trade-api'
import type { AssetClass, SeedDto } from '#shared/types/trading'
import { isCryptoSymbol, normalizeSymbol } from '#shared/utils/symbols'
import { getAlpaca } from '../../utils/alpaca'
import { withAlpaca } from '../../utils/errors'
import { num } from '../../utils/normalize'

const CACHE_MS = 30_000
const MAX_SYMBOLS = 50
const BARS = 60
const cache = new Map<string, { at: number, seed: SeedDto }>()

type BarLike = { close: number, timestamp: Date }
type SnapshotLike = { latestTrade?: { p?: number, t?: Date | string }, prevDailyBar?: { c?: number } }

function empty(symbol: string, assetClass: AssetClass): SeedDto {
  return { symbol, assetClass, closes: [], lastPrice: null, lastTs: null, prevClose: null }
}

/** Newest-first bars from the SDK collector, returned oldest-first for drawing. */
function closesOf(bars: BarLike[] | undefined): number[] {
  if (!bars?.length) return []
  const sorted = [...bars].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  return sorted.slice(-BARS).map(b => b.close)
}

async function seedStocks(symbols: string[]): Promise<SeedDto[]> {
  if (!symbols.length) return []
  const md = getAlpaca().marketData
  const since = (days: number) => new Date(Date.now() - days * 86_400_000)
  const [minute, snapshots] = await Promise.all([
    md.getStockBars({ symbols, timeframe: TimeFrame.Minute, start: since(3), feed: 'iex', sort: 'desc', limit: 1000 }, { maxPerSymbol: BARS }),
    md.stocks.stockSnapshots({ symbols: symbols.join(','), feed: 'iex' }) as Promise<Record<string, SnapshotLike>>
  ])
  const thin = symbols.filter(s => closesOf(minute[s]).length < 10)
  const hourly = thin.length
    ? await md.getStockBars({ symbols: thin, timeframe: TimeFrame.Hour, start: since(10), feed: 'iex', sort: 'desc', limit: 1000 }, { maxPerSymbol: BARS })
    : {}
  return symbols.map((symbol) => {
    const closes = closesOf(minute[symbol]).length >= 10 ? closesOf(minute[symbol]) : closesOf(hourly[symbol])
    const snap = snapshots?.[symbol]
    return {
      symbol,
      assetClass: 'us_equity',
      closes,
      lastPrice: num(snap?.latestTrade?.p) ?? closes.at(-1) ?? null,
      lastTs: snap?.latestTrade?.t ? new Date(snap.latestTrade.t).toISOString() : null,
      prevClose: num(snap?.prevDailyBar?.c)
    }
  })
}

async function seedCrypto(symbols: string[]): Promise<SeedDto[]> {
  if (!symbols.length) return []
  const md = getAlpaca().marketData
  const [minute, snapshotResp] = await Promise.all([
    md.getCryptoBars({ loc: 'us', symbols, timeframe: TimeFrame.Minute, start: new Date(Date.now() - 86_400_000), sort: 'desc', limit: 1000 }, { maxPerSymbol: BARS }),
    md.crypto.cryptoSnapshots({ loc: 'us', symbols: symbols.join(',') }) as Promise<{ snapshots?: Record<string, SnapshotLike> }>
  ])
  const snapshots = snapshotResp?.snapshots ?? {}
  return symbols.map((symbol) => {
    const closes = closesOf(minute[symbol])
    const snap = snapshots[symbol]
    return {
      symbol,
      assetClass: 'crypto',
      closes,
      lastPrice: num(snap?.latestTrade?.p) ?? closes.at(-1) ?? null,
      lastTs: snap?.latestTrade?.t ? new Date(snap.latestTrade.t).toISOString() : null,
      prevClose: num(snap?.prevDailyBar?.c) ?? closes[0] ?? null
    }
  })
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
