import { describe, expect, it } from 'vitest'
import {
  num,
  toAccountDto,
  toAssetDto,
  toClockDto,
  toOrderDto,
  toOrderMessage,
  toPositionDto,
  toTick
} from '~~/server/utils/normalize'

describe('num', () => {
  it('parses numeric strings and passes numbers through', () => {
    expect(num('12.5')).toBe(12.5)
    expect(num(3)).toBe(3)
  })

  it('returns null for null, undefined, empty and garbage', () => {
    expect(num(null)).toBeNull()
    expect(num(undefined)).toBeNull()
    expect(num('')).toBeNull()
    expect(num('abc')).toBeNull()
  })
})

describe('toTick', () => {
  it('builds a tick message with an ISO timestamp', () => {
    const tick = toTick({ symbol: 'BTC/USD', price: 64210.5, size: 0.01, timestamp: new Date('2026-09-23T14:00:00Z') }, 'crypto')
    expect(tick).toEqual({ type: 'tick', symbol: 'BTC/USD', assetClass: 'crypto', price: 64210.5, size: 0.01, ts: '2026-09-23T14:00:00.000Z' })
  })
})

describe('toOrderDto', () => {
  const raw = {
    id: 'o1',
    clientOrderId: 'c1',
    symbol: 'AAPL',
    assetClass: 'us_equity',
    side: 'buy',
    type: 'limit',
    status: 'new',
    qty: '10',
    notional: null,
    filledQty: '0',
    filledAvgPrice: null,
    limitPrice: '150.25',
    stopPrice: null,
    timeInForce: 'day',
    createdAt: new Date('2026-09-23T14:02:11Z'),
    updatedAt: new Date('2026-09-23T14:02:12Z'),
    filledAt: null
  }

  it('converts string amounts to numbers and dates to ISO strings', () => {
    const dto = toOrderDto(raw as never)
    expect(dto.qty).toBe(10)
    expect(dto.filledQty).toBe(0)
    expect(dto.limitPrice).toBe(150.25)
    expect(dto.notional).toBeNull()
    expect(dto.filledAvgPrice).toBeNull()
    expect(dto.createdAt).toBe('2026-09-23T14:02:11.000Z')
    expect(dto.filledAt).toBeNull()
  })

  it('canonicalizes compact crypto symbols', () => {
    const dto = toOrderDto({ ...raw, symbol: 'BTCUSD', assetClass: 'crypto' } as never)
    expect(dto.symbol).toBe('BTC/USD')
    expect(dto.assetClass).toBe('crypto')
  })

  it('wraps into an order message with the event', () => {
    const msg = toOrderMessage({ event: 'fill', order: raw as never })
    expect(msg.type).toBe('order')
    expect(msg.event).toBe('fill')
    expect(msg.order.id).toBe('o1')
  })
})

describe('toPositionDto', () => {
  it('converts a crypto position into canonical numeric form', () => {
    const dto = toPositionDto({
      symbol: 'BTCUSD',
      assetClass: 'crypto',
      side: 'long',
      qty: '0.05',
      avgEntryPrice: '63900',
      marketValue: '3210.5',
      costBasis: '3195',
      unrealizedPl: '15.5',
      unrealizedPlpc: '0.0048',
      currentPrice: '64210',
      changeToday: '-0.002'
    } as never)
    expect(dto).toEqual({
      symbol: 'BTC/USD',
      assetClass: 'crypto',
      side: 'long',
      qty: 0.05,
      avgEntryPrice: 63900,
      marketValue: 3210.5,
      costBasis: 3195,
      unrealizedPl: 15.5,
      unrealizedPlpc: 0.0048,
      currentPrice: 64210,
      changeToday: -0.002
    })
  })
})

describe('toAccountDto', () => {
  it('maps balances to numbers', () => {
    const dto = toAccountDto({ id: 'a', status: 'ACTIVE', currency: 'USD', cash: '92110', buyingPower: '184220', equity: '100412.2', lastEquity: '100000', portfolioValue: '100412.2' } as never)
    expect(dto.cash).toBe(92110)
    expect(dto.equity).toBe(100412.2)
    expect(dto.lastEquity).toBe(100000)
    expect(dto.status).toBe('ACTIVE')
  })
})

describe('toAssetDto', () => {
  it('maps the SDK _class field and canonicalizes crypto symbols', () => {
    const dto = toAssetDto({ symbol: 'BTC/USD', name: 'Bitcoin', _class: 'crypto', exchange: 'CRYPTO', status: 'active', tradable: true, fractionable: true, minOrderSize: '0.0001' } as never)
    expect(dto.assetClass).toBe('crypto')
    expect(dto.minOrderSize).toBe(0.0001)
    expect(dto.symbol).toBe('BTC/USD')
  })

  it('reports null min order size for equities', () => {
    const dto = toAssetDto({ symbol: 'AAPL', name: 'Apple', _class: 'us_equity', exchange: 'NASDAQ', status: 'active', tradable: true, fractionable: true } as never)
    expect(dto.minOrderSize).toBeNull()
    expect(dto.assetClass).toBe('us_equity')
  })
})

describe('toClockDto', () => {
  it('serializes the legacy clock', () => {
    const dto = toClockDto({ isOpen: false, nextOpen: new Date('2026-09-24T13:30:00Z'), nextClose: new Date('2026-09-24T20:00:00Z'), timestamp: new Date('2026-09-23T22:00:00Z') })
    expect(dto).toEqual({ isOpen: false, nextOpen: '2026-09-24T13:30:00.000Z', nextClose: '2026-09-24T20:00:00.000Z', timestamp: '2026-09-23T22:00:00.000Z' })
  })
})
