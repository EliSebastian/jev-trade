import { describe, expect, it } from 'vitest'
import type { AccountDto, ClockDto, PositionDto } from '#shared/types/trading'
import type { JevNewsItem } from '#shared/types/jev'
import { JEV_DEFAULTS } from '#shared/utils/jev-config'
import { buildContext } from '~~/server/utils/jev/context'
import type { ContextInput, JevBar } from '~~/server/utils/jev/context'

// Wednesday 2026-09-23 14:05 ET (18:05Z)
const NOW = Date.parse('2026-09-23T18:05:00.000Z')

/** `n` one-minute bars ending one minute before NOW, closes drifting by `step` per bar. */
function bars(n: number, opts: { start?: number, step?: number, volume?: number } = {}): JevBar[] {
  const { start = 100, step = 0.1, volume = 1000 } = opts
  return Array.from({ length: n }, (_, i) => {
    const ts = NOW - (n - i) * 60_000
    const close = start + i * step
    return { timestamp: new Date(ts).toISOString(), open: close - step / 2, high: close + 0.2, low: close - 0.2, close, volume }
  })
}

const account: AccountDto = { id: 'a', status: 'ACTIVE', currency: 'USD', cash: 92_110, buyingPower: 184_220, equity: 99_954.8, lastEquity: 100_000, portfolioValue: 99_954.8 }
const openClock: ClockDto = { isOpen: true, nextOpen: '2026-09-24T13:30:00.000Z', nextClose: '2026-09-23T20:00:00.000Z', timestamp: new Date(NOW).toISOString() }
const closedClock: ClockDto = { isOpen: false, nextOpen: '2026-09-24T13:30:00.000Z', nextClose: '2026-09-24T20:00:00.000Z', timestamp: new Date(NOW).toISOString() }

const position: PositionDto = {
  symbol: 'AAPL', assetClass: 'us_equity', side: 'long', qty: 0.5281, avgEntryPrice: 189.1, marketValue: 100.17,
  costBasis: 99.87, unrealizedPl: 0.17, unrealizedPlpc: 0.0017, currentPrice: 189.42, changeToday: 0.01
}

function input(overrides: Partial<ContextInput> = {}): ContextInput {
  return {
    symbol: 'AAPL',
    assetClass: 'us_equity',
    now: NOW,
    bars: bars(60),
    day: { high: 190.2, low: 186.1, lastPrice: 189.42 },
    position: null,
    heldSince: null,
    account,
    clock: openClock,
    openPositions: 3,
    news: [],
    config: JEV_DEFAULTS,
    ...overrides
  }
}

describe('buildContext', () => {
  it('describes the time and an open stock session', () => {
    const ctx = buildContext(input())
    expect(ctx.facts.time).toEqual(['It is Wednesday 14:05 ET.'])
    expect(ctx.facts.market).toEqual(['US stock market is open; it closes in 1 h 55 m.'])
  })

  it('flags an imminent close and a closed session', () => {
    const soon = buildContext(input({ clock: { ...openClock, nextClose: new Date(NOW + 12 * 60_000).toISOString() } }))
    expect(soon.facts.market[0]).toBe('US stock market is open; it closes in 12 m (closing soon).')
    const closed = buildContext(input({ clock: closedClock }))
    expect(closed.facts.market).toEqual(['US stock market is closed; it opens in 19 h 25 m. Stock orders cannot be executed now.'])
  })

  it('describes crypto as always open and mentions thin liquidity when equities are closed', () => {
    const ctx = buildContext(input({ symbol: 'BTC/USD', assetClass: 'crypto', clock: closedClock }))
    expect(ctx.facts.market).toEqual([
      'Crypto trades 24/7; no session close applies.',
      'US equities are closed, so crypto liquidity may be thinner.'
    ])
    expect(ctx.state.assetClass).toBe('crypto')
  })

  it('produces every price fact from sixty bars', () => {
    const ctx = buildContext(input())
    const price = ctx.facts.price
    expect(price[0]).toBe('Last price is 189.42 (1-minute bar ending 14:05 ET).')
    expect(price).toContainEqual(expect.stringMatching(/^Over the last 5 minutes the price moved/))
    expect(price).toContainEqual(expect.stringMatching(/^Over the last 15 minutes the price moved/))
    expect(price).toContainEqual(expect.stringMatching(/^Over the last 60 minutes the price moved/))
    expect(price).toContainEqual(expect.stringMatching(/20-bar simple moving average/))
    expect(price).toContainEqual(expect.stringMatching(/^RSI-14 is \d+ \(/))
    expect(price).toContainEqual(expect.stringMatching(/^Volatility over the last 15 bars is/))
    expect(price).toContainEqual(expect.stringMatching(/^Price sits at \d+% of today's range/))
    expect(price).toContainEqual(expect.stringMatching(/^Volume in the last 5 bars is/))
    expect(price).not.toContainEqual(expect.stringMatching(/stale/))
    expect(ctx.barCount).toBe(60)
    expect(ctx.stale).toBe(false)
    expect(ctx.lastPrice).toBe(189.42)
  })

  it('says which horizons cannot be computed with only twelve bars', () => {
    const ctx = buildContext(input({ bars: bars(12) }))
    expect(ctx.facts.price).toContainEqual(expect.stringMatching(/^Over the last 5 minutes the price moved/))
    expect(ctx.facts.price).toContain('Only 12 minutes of bars are available; the 15-minute change cannot be computed.')
    expect(ctx.facts.price).toContain('Only 12 minutes of bars are available; the 60-minute change cannot be computed.')
    expect(ctx.facts.price).toContain('Fewer than 20 bars are available, so the moving average cannot be computed.')
    expect(ctx.facts.price).not.toContainEqual(expect.stringMatching(/^RSI-14/))
  })

  it('falls back to the last close and flags stale data', () => {
    const old = bars(60).map(b => ({ ...b, timestamp: new Date(Date.parse(b.timestamp) - 30 * 60_000).toISOString() }))
    const ctx = buildContext(input({ bars: old, day: null }))
    expect(ctx.lastPrice).toBeCloseTo(105.9, 6)
    expect(ctx.stale).toBe(true)
    expect(ctx.facts.price).toContainEqual(expect.stringMatching(/^Data is stale: the newest bar is 3\d minutes old\.$/))
    expect(ctx.facts.price).not.toContainEqual(expect.stringMatching(/today's range/))
  })

  it('describes a flat book', () => {
    const ctx = buildContext(input())
    expect(ctx.hasPosition).toBe(false)
    expect(ctx.facts.position).toEqual(['No position is held in AAPL.'])
    expect(ctx.state.position).toEqual({ status: 'flat', facts: ['No position is held in AAPL.'] })
  })

  it('describes a long position with its P&L, age and protective rails', () => {
    const ctx = buildContext(input({ position, heldSince: new Date(NOW - (2 * 60 + 15) * 60_000).toISOString() }))
    expect(ctx.hasPosition).toBe(true)
    expect(ctx.facts.position).toEqual([
      'Holding 0.5281 shares bought at an average of 189.10 (about $99.87 at entry).',
      'Unrealized P&L is +0.17% (+$0.17) (about flat).',
      'Held for about 2 h 15 m.',
      'An automatic stop-loss at -2.00% and take-profit at +4.00% protect this position.'
    ])
    expect(ctx.state.position.status).toBe('long')
  })

  it('admits an unknown holding period and uses units for crypto', () => {
    const btc = { ...position, symbol: 'BTC/USD', assetClass: 'crypto' as const, qty: 0.0009, avgEntryPrice: 110_000, costBasis: 99 }
    const ctx = buildContext(input({ symbol: 'BTC/USD', assetClass: 'crypto', position: btc, heldSince: null }))
    expect(ctx.facts.position[0]).toBe('Holding 0.0009 units bought at an average of 110000.00 (about $99 at entry).')
    expect(ctx.facts.position[2]).toBe("Holding period is unknown (position predates the engine's records).")
  })

  it('describes the account, day P&L and position budget', () => {
    const ctx = buildContext(input())
    expect(ctx.facts.account).toEqual([
      'Buying power is $184,220 and cash is $92,110; a new buy would use $100.',
      'Day P&L is -$45.20 (daily loss limit is -$200).',
      '3 of 5 allowed positions are open.'
    ])
  })

  it('says when the daily loss limit has been hit', () => {
    const ctx = buildContext(input({ account: { ...account, equity: 99_750 } }))
    expect(ctx.facts.account[1]).toBe('Day P&L is -$250.00, which has hit the -$200 daily loss limit; new buys are halted for today.')
  })

  it('handles a missing account and clock', () => {
    const ctx = buildContext(input({ account: null, clock: null }))
    expect(ctx.facts.account).toEqual(['Account data is unavailable.', '3 of 5 allowed positions are open.'])
    expect(ctx.facts.market).toEqual(['Market session status is unknown.'])
  })

  it('adds a note when there is no news', () => {
    const ctx = buildContext(input())
    expect(ctx.news).toEqual([])
    expect(ctx.state.news).toEqual([])
    expect(ctx.state.newsNote).toBe('No news for AAPL in the last 6 hours.')
  })

  it('renders news with a relative age and a truncated summary', () => {
    const item: JevNewsItem = {
      headline: 'Apple beats expectations',
      summary: 'x'.repeat(400),
      source: 'benzinga',
      createdAt: new Date(NOW - 2 * 3_600_000).toISOString(),
      url: 'https://example.com'
    }
    const ctx = buildContext(input({ news: [item] }))
    expect(ctx.state.newsNote).toBeNull()
    expect(ctx.state.news).toEqual([
      { age: '2 h 00 m ago', source: 'benzinga', headline: 'Apple beats expectations', summary: `${'x'.repeat(299)}…` }
    ])
    expect(ctx.news).toEqual([item])
  })

  it('exposes the facts through the state object', () => {
    const ctx = buildContext(input())
    expect(ctx.state).toMatchObject({
      symbol: 'AAPL',
      assetClass: 'stock',
      time: ctx.facts.time,
      market: ctx.facts.market,
      price: ctx.facts.price,
      account: ctx.facts.account
    })
  })
})
