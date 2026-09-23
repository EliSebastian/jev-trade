import { describe, expect, it, vi } from 'vitest'
import { placeOrder } from '~~/server/utils/order-builder'

function mockOrders() {
  const fake = { id: 'o1' }
  return {
    market: vi.fn(async () => fake),
    limit: vi.fn(async () => fake),
    stop: vi.fn(async () => fake),
    stopLimit: vi.fn(async () => fake)
  }
}

describe('placeOrder', () => {
  it('routes a quantity market order to the market builder without a notional key', async () => {
    const orders = mockOrders()
    const result = await placeOrder(orders, { symbol: 'AAPL', side: 'buy', type: 'market', qty: 2, timeInForce: 'day' })
    expect(orders.market).toHaveBeenCalledWith({ symbol: 'AAPL', side: 'buy', qty: 2, timeInForce: 'day' })
    expect(result).toEqual({ id: 'o1' })
  })

  it('routes a notional market order with the notional amount', async () => {
    const orders = mockOrders()
    await placeOrder(orders, { symbol: 'BTC/USD', side: 'buy', type: 'market', notional: 25, timeInForce: 'gtc', clientOrderId: 'abc' })
    expect(orders.market).toHaveBeenCalledWith({ symbol: 'BTC/USD', side: 'buy', notional: 25, timeInForce: 'gtc', clientOrderId: 'abc' })
  })

  it('routes limit orders to the limit builder', async () => {
    const orders = mockOrders()
    await placeOrder(orders, { symbol: 'AAPL', side: 'sell', type: 'limit', qty: 1, limitPrice: 210, timeInForce: 'day' })
    expect(orders.limit).toHaveBeenCalledWith({ symbol: 'AAPL', side: 'sell', qty: 1, limitPrice: 210, timeInForce: 'day' })
    expect(orders.market).not.toHaveBeenCalled()
  })

  it('routes stop orders to the stop builder', async () => {
    const orders = mockOrders()
    await placeOrder(orders, { symbol: 'AAPL', side: 'sell', type: 'stop', qty: 1, stopPrice: 180, timeInForce: 'day' })
    expect(orders.stop).toHaveBeenCalledWith({ symbol: 'AAPL', side: 'sell', qty: 1, stopPrice: 180, timeInForce: 'day' })
  })

  it('routes stop-limit orders with both prices', async () => {
    const orders = mockOrders()
    await placeOrder(orders, { symbol: 'AAPL', side: 'sell', type: 'stop_limit', qty: 1, stopPrice: 180, limitPrice: 179, timeInForce: 'day' })
    expect(orders.stopLimit).toHaveBeenCalledWith({ symbol: 'AAPL', side: 'sell', qty: 1, stopPrice: 180, limitPrice: 179, timeInForce: 'day' })
  })
})
