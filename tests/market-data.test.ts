import { describe, expect, it, vi } from 'vitest'
import { fetchMinuteBars, fetchSnapshots } from '~~/server/utils/market-data'
import type { MarketDataLike } from '~~/server/utils/market-data'

const t = (minutesAgo: number) => new Date(Date.parse('2026-09-23T18:00:00.000Z') - minutesAgo * 60_000)
const bar = (minutesAgo: number, close: number) => ({ timestamp: t(minutesAgo), open: close - 0.1, high: close + 0.2, low: close - 0.2, close, volume: 1000 })

function fakeMarketData(): MarketDataLike & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { getStockBars: [], getCryptoBars: [], stockSnapshots: [], cryptoSnapshots: [] }
  return {
    calls,
    getStockBars: vi.fn(async (params: unknown, opts: unknown) => {
      calls.getStockBars!.push({ params, opts })
      return { AAPL: [bar(1, 189.4), bar(3, 189.0), bar(2, 189.2)] }
    }),
    getCryptoBars: vi.fn(async (params: unknown, opts: unknown) => {
      calls.getCryptoBars!.push({ params, opts })
      return { 'BTC/USD': [bar(1, 110_100), bar(2, 110_000)] }
    }),
    stocks: {
      stockSnapshots: vi.fn(async (params: unknown) => {
        calls.stockSnapshots!.push(params)
        return { AAPL: { latestTrade: { p: 189.42, t: t(0) }, prevDailyBar: { c: 188 }, dailyBar: { h: 190.2, l: 186.1 } } }
      })
    },
    crypto: {
      cryptoSnapshots: vi.fn(async (params: unknown) => {
        calls.cryptoSnapshots!.push(params)
        return { snapshots: { 'BTC/USD': { latestTrade: { p: 110_150, t: t(0) }, dailyBar: { h: 111_000, l: 109_000 } } } }
      })
    }
  }
}

describe('fetchMinuteBars', () => {
  it('returns stock bars oldest first with ISO timestamps and asks the SDK for the limit per symbol', async () => {
    const md = fakeMarketData()
    const bars = await fetchMinuteBars(md, ['AAPL'], 'us_equity', { limit: 60, sinceMs: 3 * 86_400_000 })
    expect(bars.AAPL!.map(b => b.close)).toEqual([189.0, 189.2, 189.4])
    expect(bars.AAPL![0]!.timestamp).toBe(t(3).toISOString())
    expect(bars.AAPL![0]).toMatchObject({ open: 188.9, high: 189.2, low: 188.8, volume: 1000 })
    expect(md.calls.getStockBars![0]).toMatchObject({ params: { symbols: ['AAPL'], feed: 'iex', sort: 'desc' }, opts: { maxPerSymbol: 60 } })
    expect(md.getCryptoBars).not.toHaveBeenCalled()
  })

  it('routes crypto symbols to the crypto endpoint', async () => {
    const md = fakeMarketData()
    const bars = await fetchMinuteBars(md, ['BTC/USD'], 'crypto', { limit: 60, sinceMs: 86_400_000 })
    expect(bars['BTC/USD']!.map(b => b.close)).toEqual([110_000, 110_100])
    expect(md.calls.getCryptoBars![0]).toMatchObject({ params: { loc: 'us', symbols: ['BTC/USD'] } })
  })

  it('returns an empty map for no symbols without calling the SDK', async () => {
    const md = fakeMarketData()
    expect(await fetchMinuteBars(md, [], 'us_equity', { limit: 60, sinceMs: 1 })).toEqual({})
    expect(md.getStockBars).not.toHaveBeenCalled()
  })
})

describe('fetchSnapshots', () => {
  it('normalizes stock and crypto snapshot shapes into one map', async () => {
    const md = fakeMarketData()
    const stocks = await fetchSnapshots(md, ['AAPL'], 'us_equity')
    expect(stocks.AAPL).toMatchObject({ latestTrade: { p: 189.42 }, prevDailyBar: { c: 188 }, dailyBar: { h: 190.2, l: 186.1 } })
    expect(md.calls.stockSnapshots![0]).toEqual({ symbols: 'AAPL', feed: 'iex' })

    const crypto = await fetchSnapshots(md, ['BTC/USD'], 'crypto')
    expect(crypto['BTC/USD']).toMatchObject({ latestTrade: { p: 110_150 }, dailyBar: { h: 111_000, l: 109_000 } })
    expect(md.calls.cryptoSnapshots![0]).toEqual({ loc: 'us', symbols: 'BTC/USD' })
  })

  it('returns an empty map for no symbols', async () => {
    const md = fakeMarketData()
    expect(await fetchSnapshots(md, [], 'crypto')).toEqual({})
    expect(md.crypto.cryptoSnapshots).not.toHaveBeenCalled()
  })
})
