import { describe, expect, it } from 'vitest'
import {
  classifySymbol,
  isCryptoSymbol,
  normalizeSymbol,
  toCanonicalSymbol,
  toPathSymbol
} from '#shared/utils/symbols'

describe('normalizeSymbol', () => {
  it('trims and uppercases stock tickers', () => {
    expect(normalizeSymbol('  aapl ')).toBe('AAPL')
  })

  it('keeps dotted share classes intact', () => {
    expect(normalizeSymbol('brk.b')).toBe('BRK.B')
  })

  it('turns a dash pair into a slash pair', () => {
    expect(normalizeSymbol('btc-usd')).toBe('BTC/USD')
  })

  it('expands compact crypto symbology using known quote currencies', () => {
    expect(normalizeSymbol('btcusd')).toBe('BTC/USD')
    expect(normalizeSymbol('ETHUSDT')).toBe('ETH/USDT')
    expect(normalizeSymbol('solusdc')).toBe('SOL/USDC')
  })

  it('leaves an already canonical crypto pair alone', () => {
    expect(normalizeSymbol('BTC/USD')).toBe('BTC/USD')
  })

  it('returns an empty string for blank input', () => {
    expect(normalizeSymbol('   ')).toBe('')
  })
})

describe('isCryptoSymbol / classifySymbol', () => {
  it('treats a slash pair as crypto', () => {
    expect(isCryptoSymbol('BTC/USD')).toBe(true)
    expect(classifySymbol('BTC/USD')).toBe('crypto')
  })

  it('treats a plain ticker as a US equity', () => {
    expect(isCryptoSymbol('AAPL')).toBe(false)
    expect(classifySymbol('AAPL')).toBe('us_equity')
  })
})

describe('toCanonicalSymbol', () => {
  it('rewrites compact crypto symbols from the positions API', () => {
    expect(toCanonicalSymbol('BTCUSD', 'crypto')).toBe('BTC/USD')
  })

  it('keeps slash crypto symbols as they are', () => {
    expect(toCanonicalSymbol('ETH/USD', 'crypto')).toBe('ETH/USD')
  })

  it('does not touch equities', () => {
    expect(toCanonicalSymbol('AAPL', 'us_equity')).toBe('AAPL')
  })
})

describe('toPathSymbol', () => {
  it('strips the slash so the symbol is safe in a URL path', () => {
    expect(toPathSymbol('BTC/USD')).toBe('BTCUSD')
  })

  it('leaves equities unchanged', () => {
    expect(toPathSymbol('AAPL')).toBe('AAPL')
  })
})
