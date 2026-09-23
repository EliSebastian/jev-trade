import { describe, expect, it } from 'vitest'
import { parseClientMessage } from '~~/server/utils/ws-protocol'

describe('parseClientMessage', () => {
  it('parses a subscribe message and normalizes, dedupes symbols', () => {
    expect(parseClientMessage('{"type":"subscribe","symbols":["aapl","btc-usd","AAPL"]}'))
      .toEqual({ type: 'subscribe', symbols: ['AAPL', 'BTC/USD'] })
  })

  it('parses an unsubscribe message', () => {
    expect(parseClientMessage('{"type":"unsubscribe","symbols":["ETH/USD"]}'))
      .toEqual({ type: 'unsubscribe', symbols: ['ETH/USD'] })
  })

  it('parses a ping', () => {
    expect(parseClientMessage('{"type":"ping"}')).toEqual({ type: 'ping' })
  })

  it('returns null for invalid JSON', () => {
    expect(parseClientMessage('{nope')).toBeNull()
  })

  it('returns null for unknown message types', () => {
    expect(parseClientMessage('{"type":"hack"}')).toBeNull()
  })

  it('returns null when symbols are missing or too many', () => {
    expect(parseClientMessage('{"type":"subscribe"}')).toBeNull()
    const many = JSON.stringify({ type: 'subscribe', symbols: Array.from({ length: 101 }, (_, i) => `S${i}`) })
    expect(parseClientMessage(many)).toBeNull()
  })

  it('drops blank symbols', () => {
    expect(parseClientMessage('{"type":"subscribe","symbols":["", "  ", "spy"]}'))
      .toEqual({ type: 'subscribe', symbols: ['SPY'] })
  })
})
