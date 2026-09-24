import type { ServerMessage, StatusMessage, StreamName, StreamStatus, TickMessage } from '#shared/types/trading'
import { classifySymbol } from '#shared/utils/symbols'
import { getAlpaca } from './alpaca'
import { toOrderMessage, toTick } from './normalize'
import type { RawOrder, RawTrade } from './normalize'

/* ---------- the slice of the SDK streams the hub relies on (fakeable in tests) ---------- */

export interface AuthResultLike {
  authenticated: boolean
  message?: string
}

interface BaseStreamLike {
  onConnect(fn: () => void): unknown
  onDisconnect(fn: () => void): unknown
  onError(fn: (err: string) => void): unknown
  onReconnecting(fn: (attempt: number) => void): unknown
  onReconnected(fn: () => void): unknown
  connect(): void
  disconnect(): void
  waitForAuthenticationResult(timeoutMs?: number): Promise<AuthResultLike>
}

export interface DataStreamLike extends BaseStreamLike {
  onTrade(fn: (trade: RawTrade) => void): unknown
  subscribeForTrades(symbols: string[]): void
  unsubscribeFromTrades(symbols: string[]): void
}

export interface TradingStreamLike extends BaseStreamLike {
  onTradeUpdate(fn: (update: { event: string, order: RawOrder }) => void): unknown
  subscribeTradeUpdates(): void
}

export interface HubDeps {
  stocks: () => DataStreamLike
  crypto: () => DataStreamLike
  trading: () => TradingStreamLike
  log?: Pick<Console, 'warn' | 'error' | 'info'>
  /** Disconnect upstreams this long after the last browser leaves. */
  idleMs?: number
  /** Do not retry a stream this long after an authentication failure. */
  authBackoffMs?: number
  authTimeoutMs?: number
}

export interface HubPeer {
  id: string
  send(msg: ServerMessage): void
}

export interface StreamHub {
  addPeer(peer: HubPeer): void
  removePeer(id: string): void
  subscribe(peerId: string, symbols: string[]): void
  unsubscribe(peerId: string, symbols: string[]): void
  status(): Record<StreamName, StreamStatus>
  peerCount(): number
  subscriberCount(symbol: string): number
  /** Send a frame to every peer (used by the Jev engine for decisions and state). */
  broadcast(msg: ServerMessage): void
  shutdown(): void
}

type DataStreamName = 'stocks' | 'crypto'

const streamFor = (symbol: string): DataStreamName => (classifySymbol(symbol) === 'crypto' ? 'crypto' : 'stocks')

/**
 * One upstream Alpaca connection per stream type, shared by every browser tab.
 * Symbols are ref-counted across peers; ticks fan out only to the peers that asked for them.
 */
export function createStreamHub(deps: HubDeps): StreamHub {
  const log = deps.log ?? console
  const idleMs = deps.idleMs ?? 60_000
  const authBackoffMs = deps.authBackoffMs ?? 30_000
  const authTimeoutMs = deps.authTimeoutMs ?? 15_000

  const peers = new Map<string, { peer: HubPeer, symbols: Set<string> }>()
  const subs = new Map<string, Set<string>>()
  const streams: Partial<Record<StreamName, BaseStreamLike>> = {}
  const status: Record<StreamName, StreamStatus> = { stocks: 'idle', crypto: 'idle', trading: 'idle' }
  const upstream: Record<DataStreamName, Set<string>> = { stocks: new Set(), crypto: new Set() }
  const blockedUntil: Record<StreamName, number> = { stocks: 0, crypto: 0, trading: 0 }
  const lastTick = new Map<string, TickMessage>()
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  /* ---------- peers ---------- */

  function safeSend(id: string, msg: ServerMessage) {
    const entry = peers.get(id)
    if (!entry) return
    try {
      entry.peer.send(msg)
    } catch (err) {
      log.warn(`[stream-hub] dropping peer ${id}: ${(err as Error).message}`)
      removePeer(id)
    }
  }

  function broadcast(msg: ServerMessage) {
    for (const id of [...peers.keys()]) safeSend(id, msg)
  }

  function statusMessage(): StatusMessage {
    return { type: 'status', streams: { ...status } }
  }

  function setStatus(name: StreamName, next: StreamStatus) {
    if (status[name] === next) return
    status[name] = next
    broadcast(statusMessage())
  }

  /* ---------- upstream streams ---------- */

  function desired(name: DataStreamName): string[] {
    return [...subs.keys()].filter(s => streamFor(s) === name)
  }

  function syncUpstream(name: DataStreamName) {
    const stream = streams[name] as DataStreamLike | undefined
    if (!stream || status[name] !== 'connected') return
    const want = new Set(desired(name))
    const have = upstream[name]
    const toAdd = [...want].filter(s => !have.has(s))
    const toRemove = [...have].filter(s => !want.has(s))
    if (toAdd.length) {
      stream.subscribeForTrades(toAdd)
      for (const s of toAdd) have.add(s)
    }
    if (toRemove.length) {
      stream.unsubscribeFromTrades(toRemove)
      for (const s of toRemove) have.delete(s)
    }
  }

  function onTrade(name: DataStreamName, trade: RawTrade) {
    const tick = toTick(trade, name === 'crypto' ? 'crypto' : 'us_equity')
    lastTick.set(tick.symbol, tick)
    for (const id of [...(subs.get(tick.symbol) ?? [])]) safeSend(id, tick)
  }

  function failStream(name: StreamName, message: string) {
    blockedUntil[name] = Date.now() + authBackoffMs
    if (status[name] === 'error') return
    setStatus(name, 'error')
    broadcast({ type: 'error', stream: name, message })
  }

  function wire(name: StreamName, stream: BaseStreamLike) {
    stream.onConnect(() => {
      setStatus(name, 'connected')
      if (name === 'trading') {
        (stream as TradingStreamLike).subscribeTradeUpdates()
      } else {
        upstream[name] = new Set()
        syncUpstream(name)
      }
    })
    stream.onReconnecting(() => setStatus(name, 'reconnecting'))
    stream.onReconnected(() => {
      // The SDK restores its own subscriptions; only send what changed meanwhile.
      setStatus(name, 'connected')
      if (name !== 'trading') syncUpstream(name)
    })
    stream.onDisconnect(() => {
      if (status[name] !== 'idle' && status[name] !== 'error') setStatus(name, 'disconnected')
    })
    stream.onError((err) => {
      log.warn(`[stream-hub] ${name} stream error: ${err}`)
      if (status[name] === 'connected') {
        broadcast({ type: 'error', stream: name, message: String(err) })
      } else {
        failStream(name, String(err))
      }
    })
    if (name === 'trading') {
      (stream as TradingStreamLike).onTradeUpdate(update => broadcast(toOrderMessage(update)))
    } else {
      (stream as DataStreamLike).onTrade(trade => onTrade(name, trade))
    }
  }

  async function awaitFirstAuth(name: StreamName, stream: BaseStreamLike) {
    let result: AuthResultLike
    try {
      result = await stream.waitForAuthenticationResult(authTimeoutMs)
    } catch (err) {
      result = { authenticated: false, message: (err as Error).message }
    }
    if (stopped || result.authenticated || status[name] === 'idle') return
    const message = `Alpaca ${name} stream authentication failed: ${result.message ?? 'unknown reason'}`
    log.error(`[stream-hub] ${message}`)
    failStream(name, message)
    stream.disconnect()
  }

  function ensureStream(name: StreamName) {
    if (stopped) return
    const existing = streams[name]
    if (existing) {
      const s = status[name]
      if (s === 'connecting' || s === 'connected' || s === 'reconnecting') return
      if (Date.now() < blockedUntil[name]) return
      setStatus(name, 'connecting')
      existing.connect()
      return
    }
    const stream = deps[name]()
    streams[name] = stream
    wire(name, stream)
    setStatus(name, 'connecting')
    stream.connect()
    void awaitFirstAuth(name, stream)
  }

  function disconnectAll() {
    for (const name of Object.keys(streams) as StreamName[]) {
      const stream = streams[name]
      if (!stream) continue
      setStatus(name, 'idle')
      stream.disconnect()
    }
    upstream.stocks = new Set()
    upstream.crypto = new Set()
    lastTick.clear()
  }

  function clearIdle() {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = undefined
  }

  function startIdle() {
    clearIdle()
    idleTimer = setTimeout(() => {
      idleTimer = undefined
      if (peers.size === 0) disconnectAll()
    }, idleMs)
  }

  /* ---------- public API ---------- */

  function addPeer(peer: HubPeer) {
    if (stopped) return
    peers.set(peer.id, { peer, symbols: new Set() })
    clearIdle()
    ensureStream('trading')
    safeSend(peer.id, statusMessage())
  }

  function release(symbol: string, peerId: string): DataStreamName | null {
    const set = subs.get(symbol)
    if (!set) return null
    set.delete(peerId)
    if (set.size === 0) subs.delete(symbol)
    return streamFor(symbol)
  }

  function removePeer(id: string) {
    const entry = peers.get(id)
    if (!entry) return
    peers.delete(id)
    const touched = new Set<DataStreamName>()
    for (const symbol of entry.symbols) {
      const name = release(symbol, id)
      if (name) touched.add(name)
    }
    for (const name of touched) syncUpstream(name)
    if (peers.size === 0) startIdle()
  }

  function subscribe(peerId: string, symbols: string[]) {
    const entry = peers.get(peerId)
    if (!entry) return
    const touched = new Set<DataStreamName>()
    for (const symbol of symbols) {
      if (!symbol) continue
      entry.symbols.add(symbol)
      let set = subs.get(symbol)
      if (!set) {
        set = new Set()
        subs.set(symbol, set)
      }
      set.add(peerId)
      touched.add(streamFor(symbol))
      const replay = lastTick.get(symbol)
      if (replay) safeSend(peerId, replay)
    }
    for (const name of touched) {
      ensureStream(name)
      syncUpstream(name)
    }
  }

  function unsubscribe(peerId: string, symbols: string[]) {
    const entry = peers.get(peerId)
    if (!entry) return
    const touched = new Set<DataStreamName>()
    for (const symbol of symbols) {
      entry.symbols.delete(symbol)
      const name = release(symbol, peerId)
      if (name) touched.add(name)
    }
    for (const name of touched) syncUpstream(name)
  }

  function shutdown() {
    stopped = true
    clearIdle()
    disconnectAll()
    peers.clear()
    subs.clear()
  }

  return {
    addPeer,
    removePeer,
    subscribe,
    unsubscribe,
    broadcast,
    shutdown,
    status: () => ({ ...status }),
    peerCount: () => peers.size,
    subscriberCount: symbol => subs.get(symbol)?.size ?? 0
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __jevTradeHub: StreamHub | undefined
}

/** Process-wide singleton so dev reloads never open a second Alpaca connection. */
export function getStreamHub(): StreamHub {
  if (globalThis.__jevTradeHub) return globalThis.__jevTradeHub
  const alpaca = getAlpaca()
  const hub = createStreamHub({
    stocks: () => alpaca.marketData.stockStream({ feed: 'iex' }),
    crypto: () => alpaca.marketData.cryptoStream(),
    trading: () => alpaca.trading.stream(),
    log: console
  })
  globalThis.__jevTradeHub = hub
  return hub
}
