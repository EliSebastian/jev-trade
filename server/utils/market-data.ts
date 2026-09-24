import { TimeFrame } from '@alpacahq/alpaca-trade-api'
import type { AssetClass } from '#shared/types/trading'
import { getAlpaca } from './alpaca'
import type { JevBar } from './jev/context'

/**
 * Bars and snapshots from Alpaca market data, normalized for the seed route and the Jev engine.
 * The SDK object is passed in so tests can hand over a fake.
 */

export interface RawBarLike {
  timestamp: Date | string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface SnapshotLike {
  latestTrade?: { p?: number, t?: Date | string }
  prevDailyBar?: { c?: number }
  dailyBar?: { o?: number, h?: number, l?: number, c?: number, v?: number }
}

/** Method syntax on purpose: it keeps the SDK's stricter parameter types assignable. */
export interface MarketDataLike {
  getStockBars(params: unknown, opts: { maxPerSymbol: number }): Promise<Record<string, RawBarLike[]>>
  getCryptoBars(params: unknown, opts: { maxPerSymbol: number }): Promise<Record<string, RawBarLike[]>>
  stocks: { stockSnapshots(params: unknown): Promise<Record<string, SnapshotLike>> }
  crypto: { cryptoSnapshots(params: unknown): Promise<{ snapshots?: Record<string, SnapshotLike> }> }
}

export interface FetchBarsOptions {
  /** Newest bars kept per symbol. */
  limit: number
  /** Look-back window from now. */
  sinceMs: number
  timeframe?: 'minute' | 'hour'
}

export function alpacaMarketData(): MarketDataLike {
  return getAlpaca().marketData as unknown as MarketDataLike
}

function toBars(raw: RawBarLike[] | undefined, limit: number): JevBar[] {
  if (!raw?.length) return []
  return [...raw]
    .map(b => ({ ...b, ms: new Date(b.timestamp).getTime() }))
    .filter(b => Number.isFinite(b.ms))
    .sort((a, b) => a.ms - b.ms)
    .slice(-limit)
    .map(b => ({ timestamp: new Date(b.ms).toISOString(), open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }))
}

/** Oldest-first bars per symbol. Symbols without data map to an empty array. */
export async function fetchBars(md: MarketDataLike, symbols: string[], assetClass: AssetClass, opts: FetchBarsOptions): Promise<Record<string, JevBar[]>> {
  if (!symbols.length) return {}
  const timeframe = opts.timeframe === 'hour' ? TimeFrame.Hour : TimeFrame.Minute
  const start = new Date(Date.now() - opts.sinceMs)
  const raw = assetClass === 'crypto'
    ? await md.getCryptoBars({ loc: 'us', symbols, timeframe, start, sort: 'desc', limit: 1000 }, { maxPerSymbol: opts.limit })
    : await md.getStockBars({ symbols, timeframe, start, feed: 'iex', sort: 'desc', limit: 1000 }, { maxPerSymbol: opts.limit })
  const out: Record<string, JevBar[]> = {}
  for (const s of symbols) out[s] = toBars(raw?.[s], opts.limit)
  return out
}

export function fetchMinuteBars(md: MarketDataLike, symbols: string[], assetClass: AssetClass, opts: Omit<FetchBarsOptions, 'timeframe'>) {
  return fetchBars(md, symbols, assetClass, { ...opts, timeframe: 'minute' })
}

/** Latest trade, previous daily close and today's daily bar per symbol. */
export async function fetchSnapshots(md: MarketDataLike, symbols: string[], assetClass: AssetClass): Promise<Record<string, SnapshotLike>> {
  if (!symbols.length) return {}
  const joined = symbols.join(',')
  if (assetClass === 'crypto') {
    const resp = await md.crypto.cryptoSnapshots({ loc: 'us', symbols: joined })
    return resp?.snapshots ?? {}
  }
  return (await md.stocks.stockSnapshots({ symbols: joined, feed: 'iex' })) ?? {}
}
