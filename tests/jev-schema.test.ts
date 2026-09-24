import { describe, expect, it } from 'vitest'
import { jevAutoSchema, jevEvaluateSchema, jevWatchlistSchema } from '#shared/utils/jev-schema'

describe('jevWatchlistSchema', () => {
  it('normalizes, deduplicates and drops empty symbols', () => {
    const parsed = jevWatchlistSchema.parse({ symbols: [' aapl ', 'btcusd', 'BTC/USD', '', 'AAPL'] })
    expect(parsed.symbols).toEqual(['AAPL', 'BTC/USD'])
  })

  it('rejects more than 100 symbols', () => {
    const symbols = Array.from({ length: 101 }, (_, i) => `S${i}`)
    expect(jevWatchlistSchema.safeParse({ symbols }).success).toBe(false)
  })

  it('accepts an empty list', () => {
    expect(jevWatchlistSchema.parse({ symbols: [] }).symbols).toEqual([])
  })
})

describe('jevEvaluateSchema', () => {
  it('requires a symbol and normalizes it', () => {
    expect(jevEvaluateSchema.parse({ symbol: 'eth-usd' }).symbol).toBe('ETH/USD')
    expect(jevEvaluateSchema.safeParse({ symbol: '   ' }).success).toBe(false)
    expect(jevEvaluateSchema.safeParse({}).success).toBe(false)
  })
})

describe('jevAutoSchema', () => {
  it('requires a boolean auto flag', () => {
    expect(jevAutoSchema.parse({ auto: true })).toEqual({ auto: true })
    expect(jevAutoSchema.safeParse({ auto: 'yes' }).success).toBe(false)
    expect(jevAutoSchema.safeParse({}).success).toBe(false)
  })
})
