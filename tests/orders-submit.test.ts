import { describe, expect, it, vi } from 'vitest'
import type { AssetDto } from '#shared/types/trading'
import { submitOrder } from '~~/server/utils/orders'

const asset = (overrides: Partial<AssetDto> = {}): AssetDto => ({
  symbol: 'AAPL',
  name: 'Apple Inc.',
  assetClass: 'us_equity',
  exchange: 'NASDAQ',
  status: 'active',
  tradable: true,
  fractionable: true,
  minOrderSize: null,
  ...overrides
})

function deps(a: AssetDto = asset()) {
  const raw = { id: 'o1', symbol: a.symbol, assetClass: a.assetClass, side: 'buy', type: 'market', status: 'accepted', qty: null, notional: '100', filledQty: '0', createdAt: '2026-09-23T18:00:00Z' }
  const orders = {
    market: vi.fn(async () => raw),
    limit: vi.fn(async () => raw),
    stop: vi.fn(async () => raw),
    stopLimit: vi.fn(async () => raw)
  }
  return { findAsset: vi.fn(async () => a), orders: () => orders, builders: orders }
}

async function statusOf(promise: Promise<unknown>) {
  try {
    await promise
    return null
  } catch (err) {
    return err as { statusCode?: number, statusMessage?: string, data?: { issues?: { path: string, message: string }[] } }
  }
}

describe('submitOrder', () => {
  it('validates the body and reports issues with a 400', async () => {
    const d = deps()
    const err = await statusOf(submitOrder({ symbol: 'AAPL', side: 'buy', type: 'market' }, d))
    expect(err?.statusCode).toBe(400)
    expect(err?.data?.issues).toContainEqual({ path: 'qty', message: 'Enter a quantity or a dollar amount' })
    expect(d.builders.market).not.toHaveBeenCalled()
  })

  it('rejects assets that are not tradable', async () => {
    const d = deps(asset({ tradable: false }))
    const err = await statusOf(submitOrder({ symbol: 'AAPL', side: 'buy', type: 'market', notional: 100 }, d))
    expect(err?.statusCode).toBe(422)
    expect(err?.statusMessage).toMatch(/not tradable/)
  })

  it('rejects fractional quantities on non-fractionable assets', async () => {
    const d = deps(asset({ fractionable: false }))
    const err = await statusOf(submitOrder({ symbol: 'AAPL', side: 'buy', type: 'market', qty: 0.5 }, d))
    expect(err?.statusCode).toBe(422)
    expect(err?.statusMessage).toMatch(/fractional/)
  })

  it('rejects quantities below the minimum order size', async () => {
    const d = deps(asset({ symbol: 'BTC/USD', assetClass: 'crypto', minOrderSize: 0.001 }))
    const err = await statusOf(submitOrder({ symbol: 'BTC/USD', side: 'buy', type: 'market', qty: 0.0001 }, d))
    expect(err?.statusCode).toBe(422)
    expect(err?.statusMessage).toMatch(/Minimum order size/)
  })

  it('places a notional market order with the default time in force and returns a DTO', async () => {
    const d = deps()
    const order = await submitOrder({ symbol: 'aapl', side: 'buy', type: 'market', notional: 100, clientOrderId: 'jev-1' }, d)
    expect(d.findAsset).toHaveBeenCalledWith('AAPL')
    expect(d.builders.market).toHaveBeenCalledWith({ symbol: 'AAPL', side: 'buy', notional: 100, timeInForce: 'day', clientOrderId: 'jev-1' })
    expect(order).toMatchObject({ id: 'o1', symbol: 'AAPL', side: 'buy', notional: 100, status: 'accepted' })
  })

  it('uses the asset symbol spelling and gtc for crypto', async () => {
    const d = deps(asset({ symbol: 'BTC/USD', assetClass: 'crypto' }))
    await submitOrder({ symbol: 'btcusd', side: 'buy', type: 'market', notional: 25 }, d)
    expect(d.builders.market).toHaveBeenCalledWith({ symbol: 'BTC/USD', side: 'buy', notional: 25, timeInForce: 'gtc' })
  })
})
