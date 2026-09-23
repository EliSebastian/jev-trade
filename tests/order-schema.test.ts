import { describe, expect, it } from 'vitest'
import { applyTifDefault, placeOrderSchema } from '#shared/utils/order-schema'

function issuesAt(result: ReturnType<typeof placeOrderSchema.safeParse>) {
  if (result.success) return []
  return result.error.issues.map(i => i.path.join('.'))
}

describe('placeOrderSchema', () => {
  it('accepts a market order sized by quantity', () => {
    const r = placeOrderSchema.safeParse({ symbol: 'AAPL', side: 'buy', type: 'market', qty: 1 })
    expect(r.success).toBe(true)
  })

  it('accepts a market order sized by notional dollars', () => {
    const r = placeOrderSchema.safeParse({ symbol: 'BTC/USD', side: 'buy', type: 'market', notional: 25 })
    expect(r.success).toBe(true)
  })

  it('normalizes the symbol', () => {
    const r = placeOrderSchema.safeParse({ symbol: ' btc-usd ', side: 'sell', type: 'market', qty: 0.01 })
    expect(r.success && r.data.symbol).toBe('BTC/USD')
  })

  it('rejects when both qty and notional are given', () => {
    const r = placeOrderSchema.safeParse({ symbol: 'AAPL', side: 'buy', type: 'market', qty: 1, notional: 10 })
    expect(r.success).toBe(false)
    expect(issuesAt(r)).toContain('notional')
  })

  it('rejects when neither qty nor notional is given', () => {
    const r = placeOrderSchema.safeParse({ symbol: 'AAPL', side: 'buy', type: 'market' })
    expect(r.success).toBe(false)
    expect(issuesAt(r)).toContain('qty')
  })

  it('rejects notional on non-market orders', () => {
    const r = placeOrderSchema.safeParse({ symbol: 'AAPL', side: 'buy', type: 'limit', notional: 10, limitPrice: 100 })
    expect(r.success).toBe(false)
    expect(issuesAt(r)).toContain('notional')
  })

  it('requires a limit price for limit orders', () => {
    const r = placeOrderSchema.safeParse({ symbol: 'AAPL', side: 'buy', type: 'limit', qty: 1 })
    expect(r.success).toBe(false)
    expect(issuesAt(r)).toContain('limitPrice')
  })

  it('requires a stop price for stop orders', () => {
    const r = placeOrderSchema.safeParse({ symbol: 'AAPL', side: 'sell', type: 'stop', qty: 1 })
    expect(r.success).toBe(false)
    expect(issuesAt(r)).toContain('stopPrice')
  })

  it('requires both prices for stop-limit orders', () => {
    const r = placeOrderSchema.safeParse({ symbol: 'AAPL', side: 'sell', type: 'stop_limit', qty: 1, stopPrice: 90 })
    expect(r.success).toBe(false)
    expect(issuesAt(r)).toContain('limitPrice')
  })

  it('rejects prices on a market order', () => {
    const r = placeOrderSchema.safeParse({ symbol: 'AAPL', side: 'buy', type: 'market', qty: 1, limitPrice: 100 })
    expect(r.success).toBe(false)
    expect(issuesAt(r)).toContain('limitPrice')
  })

  it('rejects a non-gtc time in force on crypto', () => {
    const r = placeOrderSchema.safeParse({ symbol: 'BTC/USD', side: 'buy', type: 'market', qty: 0.01, timeInForce: 'day' })
    expect(r.success).toBe(false)
    expect(issuesAt(r)).toContain('timeInForce')
  })

  it('rejects fractional quantity on a stock limit order', () => {
    const r = placeOrderSchema.safeParse({ symbol: 'AAPL', side: 'buy', type: 'limit', qty: 1.5, limitPrice: 100 })
    expect(r.success).toBe(false)
    expect(issuesAt(r)).toContain('qty')
  })

  it('allows fractional quantity on a stock market order', () => {
    const r = placeOrderSchema.safeParse({ symbol: 'AAPL', side: 'buy', type: 'market', qty: 1.5 })
    expect(r.success).toBe(true)
  })

  it('rejects non-positive amounts', () => {
    const r = placeOrderSchema.safeParse({ symbol: 'AAPL', side: 'buy', type: 'market', qty: 0 })
    expect(r.success).toBe(false)
    expect(issuesAt(r)).toContain('qty')
  })
})

describe('applyTifDefault', () => {
  it('defaults crypto to gtc', () => {
    expect(applyTifDefault({ symbol: 'BTC/USD', side: 'buy', type: 'market', qty: 1 }).timeInForce).toBe('gtc')
  })

  it('defaults stocks to day', () => {
    expect(applyTifDefault({ symbol: 'AAPL', side: 'buy', type: 'market', qty: 1 }).timeInForce).toBe('day')
  })

  it('keeps an explicit time in force', () => {
    expect(applyTifDefault({ symbol: 'AAPL', side: 'buy', type: 'limit', qty: 1, limitPrice: 1, timeInForce: 'gtc' }).timeInForce).toBe('gtc')
  })
})
