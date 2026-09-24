import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ServerMessage } from '#shared/types/trading'
import { createStreamHub } from '~~/server/utils/stream-hub'

type Handler = (...args: unknown[]) => void

function fakeDataStream() {
  const handlers = new Map<string, Handler[]>()
  const on = (name: string) => (fn: Handler) => {
    handlers.set(name, [...(handlers.get(name) ?? []), fn])
    return s
  }
  const s = {
    connectCalls: 0,
    disconnectCalls: 0,
    subscribed: [] as string[][],
    unsubscribed: [] as string[][],
    authResult: { authenticated: true, status: 'AUTHENTICATED', message: 'ok' },
    onTrade: on('trade'),
    onConnect: on('connect'),
    onDisconnect: on('disconnect'),
    onError: on('error'),
    onReconnecting: on('reconnecting'),
    onReconnected: on('reconnected'),
    subscribeForTrades(symbols: string[]) { s.subscribed.push([...symbols]) },
    unsubscribeFromTrades(symbols: string[]) { s.unsubscribed.push([...symbols]) },
    connect() { s.connectCalls++ },
    disconnect() { s.disconnectCalls++ },
    waitForAuthenticationResult: async () => s.authResult,
    emit(name: string, ...args: unknown[]) { for (const fn of handlers.get(name) ?? []) fn(...args) }
  }
  return s
}

function fakeTradingStream() {
  const handlers = new Map<string, Handler[]>()
  const on = (name: string) => (fn: Handler) => {
    handlers.set(name, [...(handlers.get(name) ?? []), fn])
    return s
  }
  const s = {
    connectCalls: 0,
    disconnectCalls: 0,
    subscribeCalls: 0,
    authResult: { authenticated: true, status: 'AUTHENTICATED', message: 'ok' },
    onTradeUpdate: on('tradeUpdate'),
    onConnect: on('connect'),
    onDisconnect: on('disconnect'),
    onError: on('error'),
    onReconnecting: on('reconnecting'),
    onReconnected: on('reconnected'),
    subscribeTradeUpdates() { s.subscribeCalls++ },
    connect() { s.connectCalls++ },
    disconnect() { s.disconnectCalls++ },
    waitForAuthenticationResult: async () => s.authResult,
    emit(name: string, ...args: unknown[]) { for (const fn of handlers.get(name) ?? []) fn(...args) }
  }
  return s
}

function fakePeer(id: string, opts: { throws?: boolean } = {}) {
  const p = {
    id,
    received: [] as ServerMessage[],
    send(msg: ServerMessage) {
      if (opts.throws) throw new Error('socket closed')
      p.received.push(msg)
    }
  }
  return p
}

const silent = { warn() {}, error() {}, info() {} }

function setup(extra: Record<string, unknown> = {}) {
  const stocks = fakeDataStream()
  const crypto = fakeDataStream()
  const trading = fakeTradingStream()
  const hub = createStreamHub({ stocks: () => stocks, crypto: () => crypto, trading: () => trading, log: silent, ...extra })
  return { hub, stocks, crypto, trading }
}

const trade = (symbol: string, price: number) => ({ symbol, price, size: 1, timestamp: new Date('2026-09-23T14:00:00Z') })
const ticksFor = (peer: ReturnType<typeof fakePeer>, symbol: string) =>
  peer.received.filter(m => m.type === 'tick' && m.symbol === symbol)

afterEach(() => {
  vi.useRealTimers()
})

describe('stream hub: subscriptions', () => {
  it('connects the stock stream lazily and defers the upstream subscribe until connected', () => {
    const { hub, stocks } = setup()
    hub.addPeer(fakePeer('p1'))
    hub.subscribe('p1', ['AAPL'])
    expect(stocks.connectCalls).toBe(1)
    expect(stocks.subscribed).toEqual([])
    stocks.emit('connect')
    expect(stocks.subscribed).toEqual([['AAPL']])
  })

  it('routes crypto symbols to the crypto stream only', () => {
    const { hub, stocks, crypto } = setup()
    hub.addPeer(fakePeer('p1'))
    hub.subscribe('p1', ['BTC/USD'])
    expect(crypto.connectCalls).toBe(1)
    expect(stocks.connectCalls).toBe(0)
  })

  it('shares one upstream subscription between peers and releases it with the last one', () => {
    const { hub, stocks } = setup()
    hub.addPeer(fakePeer('p1'))
    hub.addPeer(fakePeer('p2'))
    hub.subscribe('p1', ['AAPL'])
    stocks.emit('connect')
    hub.subscribe('p2', ['AAPL'])
    expect(stocks.subscribed).toEqual([['AAPL']])
    hub.unsubscribe('p1', ['AAPL'])
    expect(stocks.unsubscribed).toEqual([])
    hub.unsubscribe('p2', ['AAPL'])
    expect(stocks.unsubscribed).toEqual([['AAPL']])
    expect(hub.subscriberCount('AAPL')).toBe(0)
  })

  it('releases a departing peer\'s symbols', () => {
    const { hub, stocks } = setup()
    hub.addPeer(fakePeer('p1'))
    hub.subscribe('p1', ['AAPL', 'MSFT'])
    stocks.emit('connect')
    hub.removePeer('p1')
    expect(stocks.unsubscribed.flat().sort()).toEqual(['AAPL', 'MSFT'])
    expect(hub.peerCount()).toBe(0)
  })

  it('sends only the delta after a reconnect', () => {
    const { hub, stocks } = setup()
    hub.addPeer(fakePeer('p1'))
    hub.subscribe('p1', ['AAPL'])
    stocks.emit('connect')
    stocks.emit('reconnecting', 1)
    hub.subscribe('p1', ['MSFT'])
    expect(stocks.subscribed).toEqual([['AAPL']])
    stocks.emit('reconnected')
    expect(stocks.subscribed).toEqual([['AAPL'], ['MSFT']])
  })
})

describe('stream hub: fan-out', () => {
  it('forwards ticks only to peers subscribed to that symbol', () => {
    const { hub, stocks } = setup()
    const p1 = fakePeer('p1')
    const p2 = fakePeer('p2')
    hub.addPeer(p1)
    hub.addPeer(p2)
    hub.subscribe('p1', ['AAPL'])
    hub.subscribe('p2', ['MSFT'])
    stocks.emit('connect')
    stocks.emit('trade', trade('AAPL', 189.42))
    expect(ticksFor(p1, 'AAPL')).toHaveLength(1)
    expect(ticksFor(p1, 'AAPL')[0]).toMatchObject({ price: 189.42, assetClass: 'us_equity' })
    expect(ticksFor(p2, 'AAPL')).toHaveLength(0)
  })

  it('replays the last tick to a late subscriber', () => {
    const { hub, stocks } = setup()
    const p1 = fakePeer('p1')
    hub.addPeer(p1)
    hub.subscribe('p1', ['AAPL'])
    stocks.emit('connect')
    stocks.emit('trade', trade('AAPL', 190))
    const p2 = fakePeer('p2')
    hub.addPeer(p2)
    hub.subscribe('p2', ['AAPL'])
    expect(ticksFor(p2, 'AAPL')[0]).toMatchObject({ price: 190 })
  })

  it('broadcasts trade updates to every peer', () => {
    const { hub, trading } = setup()
    const p1 = fakePeer('p1')
    const p2 = fakePeer('p2')
    hub.addPeer(p1)
    hub.addPeer(p2)
    expect(trading.connectCalls).toBe(1)
    trading.emit('connect')
    expect(trading.subscribeCalls).toBe(1)
    trading.emit('tradeUpdate', { event: 'fill', order: { id: 'o1', symbol: 'AAPL', side: 'buy', type: 'market', status: 'filled', qty: '1', filledQty: '1', timeInForce: 'day' } })
    for (const p of [p1, p2]) {
      const msg = p.received.find(m => m.type === 'order')
      expect(msg).toMatchObject({ type: 'order', event: 'fill', order: { id: 'o1', symbol: 'AAPL', status: 'filled' } })
    }
  })

  it('drops a peer whose socket throws on send', () => {
    const { hub, stocks } = setup()
    const bad = fakePeer('bad', { throws: true })
    hub.addPeer(bad)
    hub.subscribe('bad', ['AAPL'])
    stocks.emit('connect')
    expect(() => stocks.emit('trade', trade('AAPL', 1))).not.toThrow()
    expect(hub.peerCount()).toBe(0)
  })

  it('lets callers broadcast their own frames to every peer and still drops a throwing one', () => {
    const { hub } = setup()
    const p1 = fakePeer('p1')
    const bad = fakePeer('bad', { throws: true })
    hub.addPeer(p1)
    hub.addPeer(bad)
    const frame = { type: 'error' as const, message: 'engine says hi' }
    expect(() => hub.broadcast(frame)).not.toThrow()
    expect(p1.received).toContainEqual(frame)
    expect(hub.peerCount()).toBe(1)
  })
})

describe('stream hub: status and failures', () => {
  it('sends a status snapshot on join and status changes as streams connect', () => {
    const { hub, stocks } = setup()
    const p1 = fakePeer('p1')
    hub.addPeer(p1)
    const first = p1.received.find(m => m.type === 'status')
    expect(first).toMatchObject({ type: 'status', streams: { stocks: 'idle', crypto: 'idle', trading: 'connecting' } })
    hub.subscribe('p1', ['AAPL'])
    stocks.emit('connect')
    const latest = [...p1.received].reverse().find(m => m.type === 'status')
    expect(latest).toMatchObject({ streams: { stocks: 'connected' } })
  })

  it('surfaces an authentication failure and backs off before retrying', async () => {
    const { hub, stocks } = setup({ authBackoffMs: 30_000 })
    stocks.authResult = { authenticated: false, status: 'REJECTED', message: 'connection limit exceeded' }
    const p1 = fakePeer('p1')
    hub.addPeer(p1)
    hub.subscribe('p1', ['AAPL'])
    await vi.waitFor(() => expect(hub.status().stocks).toBe('error'))
    expect(stocks.disconnectCalls).toBe(1)
    expect(p1.received.find(m => m.type === 'error')).toMatchObject({ message: expect.stringContaining('connection limit exceeded') })
    hub.subscribe('p1', ['MSFT'])
    expect(stocks.connectCalls).toBe(1)
  })

  it('reconnects after the backoff window has passed', async () => {
    vi.useFakeTimers()
    const { hub, stocks } = setup({ authBackoffMs: 1000 })
    stocks.authResult = { authenticated: false, status: 'REJECTED', message: 'nope' }
    hub.addPeer(fakePeer('p1'))
    hub.subscribe('p1', ['AAPL'])
    await vi.waitFor(() => expect(hub.status().stocks).toBe('error'))
    stocks.authResult = { authenticated: true, status: 'AUTHENTICATED', message: 'ok' }
    vi.advanceTimersByTime(1500)
    hub.subscribe('p1', ['MSFT'])
    expect(stocks.connectCalls).toBe(2)
  })

  it('disconnects all upstreams after the last peer has been gone for the idle window', () => {
    vi.useFakeTimers()
    const { hub, stocks, trading } = setup({ idleMs: 60_000 })
    hub.addPeer(fakePeer('p1'))
    hub.subscribe('p1', ['AAPL'])
    stocks.emit('connect')
    hub.removePeer('p1')
    expect(stocks.disconnectCalls).toBe(0)
    vi.advanceTimersByTime(60_000)
    expect(stocks.disconnectCalls).toBe(1)
    expect(trading.disconnectCalls).toBe(1)
    expect(hub.status().stocks).toBe('idle')
  })

  it('cancels the idle disconnect when a peer returns in time', () => {
    vi.useFakeTimers()
    const { hub, stocks } = setup({ idleMs: 60_000 })
    hub.addPeer(fakePeer('p1'))
    hub.subscribe('p1', ['AAPL'])
    stocks.emit('connect')
    hub.removePeer('p1')
    vi.advanceTimersByTime(30_000)
    hub.addPeer(fakePeer('p2'))
    vi.advanceTimersByTime(60_000)
    expect(stocks.disconnectCalls).toBe(0)
  })
})
