import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountDto, ClockDto, OrderDto, PositionDto, ServerMessage } from '#shared/types/trading'
import type { JevDecisionDto, JevMessage, JevNewsItem } from '#shared/types/jev'
import { JEV_DEFAULTS } from '#shared/utils/jev-config'
import type { JevBar, JevContext } from '~~/server/utils/jev/context'
import type { JevStorage } from '~~/server/utils/jev/decision-log'
import { createJevEngine } from '~~/server/utils/jev/engine'
import type { EngineHub, JevDeps, JevEngine } from '~~/server/utils/jev/engine'
import type { JevJudgment, JevOracle } from '~~/server/utils/jev/oracle'

// Wednesday 2026-09-23 14:05 ET, market open
const NOW = Date.parse('2026-09-23T18:05:00.000Z')
const INTERVAL = 60_000
const TICK = 1_000

/* ---------- fakes ---------- */

const openClock: ClockDto = { isOpen: true, nextOpen: '2026-09-24T13:30:00.000Z', nextClose: '2026-09-23T20:00:00.000Z', timestamp: new Date(NOW).toISOString() }
const closedClock: ClockDto = { isOpen: false, nextOpen: '2026-09-24T13:30:00.000Z', nextClose: '2026-09-24T20:00:00.000Z', timestamp: new Date(NOW).toISOString() }
const accountOf = (equity: number): AccountDto => ({ id: 'a', status: 'ACTIVE', currency: 'USD', cash: 50_000, buyingPower: 100_000, equity, lastEquity: 100_000, portfolioValue: equity })

function pos(symbol: string, overrides: Partial<PositionDto> = {}): PositionDto {
  return {
    symbol, assetClass: symbol.includes('/') ? 'crypto' : 'us_equity', side: 'long', qty: 1, avgEntryPrice: 100, marketValue: 100,
    costBasis: 100, unrealizedPl: 0, unrealizedPlpc: 0, currentPrice: 100, changeToday: 0, ...overrides
  }
}

function orderDto(symbol: string, side: 'buy' | 'sell', id = `o-${side}-${symbol}`): OrderDto {
  return {
    id, clientOrderId: null, symbol, assetClass: symbol.includes('/') ? 'crypto' : 'us_equity', side, type: 'market', status: 'accepted',
    qty: null, notional: side === 'buy' ? 100 : null, filledQty: 0, filledAvgPrice: null, limitPrice: null, stopPrice: null,
    timeInForce: 'day', createdAt: new Date(NOW).toISOString(), updatedAt: null, filledAt: null
  }
}

function fakeBroker(init: { account?: AccountDto, positions?: PositionDto[], clock?: ClockDto } = {}) {
  const state = { account: init.account ?? accountOf(100_000), positions: init.positions ?? [], clock: init.clock ?? openClock }
  const buys: { symbol: string, notional: number, clientOrderId: string }[] = []
  const closes: string[] = []
  const broker: JevDeps['broker'] = {
    account: vi.fn(async () => state.account),
    positions: vi.fn(async () => [...state.positions]),
    clock: vi.fn(async () => state.clock),
    buyNotional: vi.fn(async (symbol: string, notional: number, clientOrderId: string) => {
      buys.push({ symbol, notional, clientOrderId })
      return orderDto(symbol, 'buy')
    }),
    closePosition: vi.fn(async (symbol: string) => {
      closes.push(symbol)
      return orderDto(symbol, 'sell')
    })
  }
  return { broker, state, buys, closes }
}

function bars(n: number, close = 100): JevBar[] {
  return Array.from({ length: n }, (_, i) => {
    const ts = NOW - (n - i) * 60_000
    return { timestamp: new Date(ts).toISOString(), open: close, high: close + 0.1, low: close - 0.1, close, volume: 1000 }
  })
}

function fakeMarket(n = 60) {
  const market: JevDeps['market'] = {
    minuteBars: vi.fn(async () => bars(n)),
    daySnapshot: vi.fn(async () => ({ high: 101, low: 99, lastPrice: 100 }))
  }
  return market
}

function fakeNews(items: JevNewsItem[] = []) {
  const news: JevDeps['news'] = { recent: vi.fn(async () => items) }
  return news
}

const strongBuy: JevJudgment = { verdict: 'buy', probabilities: { buy: 0.85, hold: 0.15 }, confidence: 0.75, trend: 3.4, newsTone: null, avoid: 0.1 }
const strongSell: JevJudgment = { verdict: 'sell', probabilities: { sell: 0.85, hold: 0.15 }, confidence: 0.75, trend: 0.8, newsTone: null, avoid: 0.2 }
const holdJ: JevJudgment = { verdict: 'hold', probabilities: { buy: 0.2, hold: 0.8 }, confidence: 0.6, trend: 2, newsTone: null, avoid: 0.1 }

function fakeOracle(judge: (ctx: JevContext) => JevJudgment | Promise<JevJudgment> = () => holdJ) {
  const asked: JevContext[] = []
  const oracle: JevOracle = {
    ask: vi.fn(async (ctx: JevContext) => {
      asked.push(ctx)
      return judge(ctx)
    })
  }
  return { oracle, asked }
}

function fakeHub() {
  const peers = new Map<string, { id: string, send(msg: ServerMessage): void }>()
  const subscribed: string[][] = []
  const unsubscribed: string[][] = []
  const broadcasts: ServerMessage[] = []
  const hub: EngineHub = {
    addPeer(peer) { peers.set(peer.id, peer) },
    removePeer(id) { peers.delete(id) },
    subscribe(_id, symbols) { subscribed.push([...symbols]) },
    unsubscribe(_id, symbols) { unsubscribed.push([...symbols]) },
    broadcast(msg) { broadcasts.push(msg) }
  }
  const jev = () => broadcasts.filter((m): m is JevMessage => m.type === 'jev')
  const decisions = () => jev().flatMap(m => (m.event === 'decision' ? [m.decision] : []))
  const states = () => jev().flatMap(m => (m.event === 'state' ? [m.state] : []))
  return { hub, peers, subscribed, unsubscribed, broadcasts, decisions, states }
}

function memoryStorage(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial))
  const storage: JevStorage = {
    async get<T>(key: string) { return (data.has(key) ? structuredClone(data.get(key)) : null) as T | null },
    async set(key, value) { data.set(key, structuredClone(value)) }
  }
  return { storage, data }
}

const silent = { info() {}, warn() {}, error() {} }

interface SetupOptions {
  watchlist?: string[]
  persisted?: Record<string, unknown>
  broker?: ReturnType<typeof fakeBroker>
  oracle?: ReturnType<typeof fakeOracle> | null
  market?: JevDeps['market']
  news?: JevDeps['news']
  config?: Partial<JevDeps['config']>
  deps?: Partial<JevDeps>
}

let engine: JevEngine | undefined

function setup(opts: SetupOptions = {}) {
  const broker = opts.broker ?? fakeBroker()
  const oracle = opts.oracle === undefined ? fakeOracle() : opts.oracle
  const hub = fakeHub()
  const store = memoryStorage(opts.persisted ?? {})
  engine = createJevEngine({
    broker: broker.broker,
    market: opts.market ?? fakeMarket(),
    news: opts.news ?? fakeNews(),
    oracle: oracle?.oracle ?? null,
    hub: hub.hub,
    storage: store.storage,
    config: { ...JEV_DEFAULTS, intervalMs: INTERVAL, ...opts.config },
    log: silent,
    schedulerTickMs: TICK,
    fillReevalDelayMs: 5_000,
    defaultWatchlist: opts.watchlist ?? ['AAPL'],
    ...opts.deps
  })
  return { engine, broker, oracle, hub, store }
}

const tick = (symbol: string, price: number): ServerMessage => ({ type: 'tick', symbol, assetClass: symbol.includes('/') ? 'crypto' : 'us_equity', price, size: 1, ts: new Date(Date.now()).toISOString() })
const fill = (symbol: string, side: 'buy' | 'sell'): ServerMessage => ({ type: 'order', event: 'fill', order: { ...orderDto(symbol, side), status: 'filled', filledQty: 1, filledAvgPrice: 100, filledAt: new Date(Date.now()).toISOString() } })

async function settle(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  engine?.shutdown()
  engine = undefined
  vi.useRealTimers()
})

/* ---------- boot and universe ---------- */

describe('engine: boot', () => {
  it('registers as a hub peer, subscribes the universe and broadcasts an idle state with auto armed', async () => {
    const b = fakeBroker({ positions: [pos('MSFT')] })
    const { engine, hub } = setup({ watchlist: ['AAPL', 'BTC/USD'], broker: b })
    await engine.start()

    expect([...hub.peers.keys()]).toEqual(['jev-engine'])
    expect(hub.subscribed).toEqual([['AAPL', 'BTC/USD', 'MSFT']])
    const state = engine.state()
    expect(state).toMatchObject({ available: true, aiConfigured: true, auto: true, status: 'idle', watchlist: ['AAPL', 'BTC/USD'], universe: ['AAPL', 'BTC/USD', 'MSFT'], openPositions: 1, marketOpen: true, dayPl: 0 })
    expect(hub.states().at(-1)).toMatchObject({ auto: true, universe: ['AAPL', 'BTC/USD', 'MSFT'] })
  })

  it('restores the persisted watchlist and always boots with the auto switch on, even if it was left off', async () => {
    const { engine, store } = setup({ watchlist: ['AAPL'], persisted: { state: { version: 1, auto: false, watchlist: ['TSLA'], cooldowns: {}, heldSince: {}, haltedUntil: null, haltReason: null } } })
    await engine.start()
    expect(engine.state()).toMatchObject({ auto: true, watchlist: ['TSLA'], universe: ['TSLA'] })
    await engine.setAuto(false)
    expect(engine.state().auto).toBe(false)
    expect((await store.storage.get<{ auto: boolean }>('state'))?.auto).toBe(false)
  })

  it('staggers the first evaluations across the interval', async () => {
    const { engine } = setup({ watchlist: ['AAPL', 'MSFT', 'TSLA'] })
    await engine.start()
    const due = engine.state().nextDueAt
    expect(Date.parse(due.AAPL!)).toBe(NOW)
    expect(Date.parse(due.MSFT!)).toBe(NOW + INTERVAL / 3)
    expect(Date.parse(due.TSLA!)).toBe(NOW + (2 * INTERVAL) / 3)
  })

  it('reports disabled when there is no oracle and refuses manual evaluations', async () => {
    const { engine } = setup({ oracle: null })
    await engine.start()
    expect(engine.state()).toMatchObject({ aiConfigured: false, status: 'disabled' })
    await expect(engine.evaluate('AAPL', 'manual')).rejects.toMatchObject({ statusCode: 503 })
  })

  it('keeps booting when the broker is unavailable and records the error', async () => {
    const b = fakeBroker()
    ;(b.broker.account as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('alpaca down'))
    const { engine, hub } = setup({ broker: b })
    await engine.start()
    expect(engine.state().lastError).toContain('alpaca down')
    expect(hub.subscribed).toEqual([['AAPL']])
  })
})

/* ---------- scheduling ---------- */

describe('engine: scheduler', () => {
  it('evaluates due crypto immediately and re-arms a stock to the next open while the market is closed', async () => {
    const b = fakeBroker({ clock: closedClock })
    const { engine, oracle } = setup({ watchlist: ['AAPL', 'BTC/USD'], broker: b })
    await engine.start()
    await settle(TICK)
    expect(oracle!.asked.map(c => c.symbol)).toEqual([])
    expect(engine.state().nextDueAt.AAPL).toBe(closedClock.nextOpen)

    await settle(INTERVAL / 2 + TICK)
    expect(oracle!.asked.map(c => c.symbol)).toEqual(['BTC/USD'])
    const decision = engine.decisions()[0]!
    expect(decision).toMatchObject({ symbol: 'BTC/USD', trigger: 'boot', verdict: 'hold', action: 'skipped', skipReason: 'hold' })
  })

  it('re-evaluates each symbol once per interval with the schedule trigger', async () => {
    const { engine, oracle } = setup({ watchlist: ['AAPL'] })
    await engine.start()
    await settle(TICK)
    expect(oracle!.asked).toHaveLength(1)
    await settle(INTERVAL / 2)
    expect(oracle!.asked).toHaveLength(1)
    await settle(INTERVAL / 2 + TICK)
    expect(oracle!.asked).toHaveLength(2)
    expect(engine.decisions().map(d => d.trigger)).toEqual(['schedule', 'boot'])
  })

  it('stops the scheduler on shutdown and removes the peer', async () => {
    const { engine, oracle, hub } = setup({ watchlist: ['AAPL'] })
    await engine.start()
    engine.shutdown()
    await settle(INTERVAL * 3)
    expect(oracle!.asked).toHaveLength(0)
    expect(hub.peers.size).toBe(0)
  })

  it('updates the universe and subscriptions when the watchlist changes', async () => {
    const { engine, hub } = setup({ watchlist: ['AAPL', 'MSFT'] })
    await engine.start()
    await engine.setWatchlist(['MSFT', 'ETH/USD'])
    expect(hub.subscribed.at(-1)).toEqual(['ETH/USD'])
    expect(hub.unsubscribed.at(-1)).toEqual(['AAPL'])
    expect(engine.state()).toMatchObject({ watchlist: ['MSFT', 'ETH/USD'], universe: ['ETH/USD', 'MSFT'] })
    expect(engine.state().nextDueAt.AAPL).toBeUndefined()
  })
})

/* ---------- execution ---------- */

describe('engine: execution', () => {
  it('logs a strong buy as auto_off while the switch is off and places nothing', async () => {
    const b = fakeBroker()
    const { engine, hub } = setup({ broker: b, oracle: fakeOracle(() => strongBuy) })
    await engine.start()
    await engine.setAuto(false)
    await settle(TICK)
    expect(b.buys).toEqual([])
    const decision = engine.decisions()[0]!
    expect(decision).toMatchObject({ symbol: 'AAPL', verdict: 'buy', probability: 0.85, confidence: 0.75, action: 'skipped', skipReason: 'auto_off', orderId: null })
    expect(hub.decisions().map(d => d.id)).toEqual([decision.id])
  })

  it('buys the configured notional when the switch is on, then starts the cooldown', async () => {
    const b = fakeBroker()
    const { engine, hub, store } = setup({ broker: b, oracle: fakeOracle(() => strongBuy) })
    await engine.start()
    await engine.setAuto(true)
    await settle(TICK)

    expect(b.buys).toEqual([{ symbol: 'AAPL', notional: 100, clientOrderId: expect.stringMatching(/^jev-/) }])
    const decision = engine.decisions()[0]!
    expect(decision).toMatchObject({ action: 'executed', orderId: 'o-buy-AAPL', skipReason: null, trigger: 'boot' })
    expect(Date.parse(engine.state().cooldowns.AAPL!)).toBe(Date.now() + JEV_DEFAULTS.cooldownMs)
    expect(hub.states().at(-1)!.cooldowns.AAPL).toBeDefined()
    const persisted = await store.storage.get<{ auto: boolean, cooldowns: Record<string, string> }>('state')
    expect(persisted?.auto).toBe(true)
    expect(persisted?.cooldowns.AAPL).toBeDefined()
  })

  it('blocks a second buy inside the cooldown but still lets a sell through', async () => {
    const b = fakeBroker()
    const { engine } = setup({ broker: b, oracle: fakeOracle(ctx => (ctx.hasPosition ? strongSell : strongBuy)) })
    await engine.start()
    await engine.setAuto(true)
    await settle(TICK)
    expect(b.buys).toHaveLength(1)

    await engine.evaluate('AAPL', 'manual')
    expect(b.buys).toHaveLength(1)
    expect(engine.decisions()[0]).toMatchObject({ trigger: 'manual', skipReason: 'cooldown' })

    b.state.positions = [pos('AAPL')]
    engine.onHubMessage(fill('AAPL', 'buy'))
    await settle(0)
    await engine.evaluate('AAPL', 'manual')
    expect(b.closes).toEqual(['AAPL'])
    expect(engine.decisions()[0]).toMatchObject({ verdict: 'sell', action: 'executed', orderId: 'o-sell-AAPL' })
  })

  it('records a failed decision when the oracle throws and keeps scheduling', async () => {
    const { engine, oracle } = setup({ oracle: fakeOracle(() => { throw new Error('gateway 500') }) })
    await engine.start()
    await settle(TICK)
    expect(engine.decisions()[0]).toMatchObject({ action: 'failed', verdict: 'hold', error: 'gateway 500' })
    expect(engine.state().status).toBe('idle')
    await settle(INTERVAL + TICK)
    expect(oracle!.asked).toHaveLength(2)
  })

  it('records a failed decision when the broker rejects the order', async () => {
    const b = fakeBroker()
    ;(b.broker.buyNotional as ReturnType<typeof vi.fn>).mockRejectedValue(Object.assign(new Error('not fractionable'), { statusCode: 422 }))
    const { engine } = setup({ broker: b, oracle: fakeOracle(() => strongBuy) })
    await engine.start()
    await engine.setAuto(true)
    await settle(TICK)
    expect(engine.decisions()[0]).toMatchObject({ verdict: 'buy', action: 'failed', error: 'not fractionable', orderId: null })
    expect(engine.state().cooldowns.AAPL).toBeUndefined()
  })

  it('rejects a manual evaluation while the same symbol is already being evaluated', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { engine } = setup({ oracle: fakeOracle(async () => { await gate; return holdJ }) })
    await engine.start()
    const first = engine.evaluate('AAPL', 'manual')
    await settle(0)
    expect(engine.state()).toMatchObject({ status: 'evaluating', evaluating: ['AAPL'] })
    await expect(engine.evaluate('AAPL', 'manual')).rejects.toMatchObject({ statusCode: 409 })
    release()
    await expect(first).resolves.toMatchObject({ symbol: 'AAPL', trigger: 'manual' })
  })

  it('feeds the oracle a context built from the broker, market and news adapters', async () => {
    const item: JevNewsItem = { headline: 'h', summary: 's', source: 'x', createdAt: new Date(NOW - 3_600_000).toISOString(), url: null }
    const b = fakeBroker({ positions: [pos('AAPL', { qty: 2, avgEntryPrice: 95 })] })
    const { engine, oracle } = setup({ broker: b, news: fakeNews([item]), oracle: fakeOracle(() => holdJ) })
    await engine.start()
    await settle(TICK)
    const ctx = oracle!.asked[0]!
    expect(ctx).toMatchObject({ symbol: 'AAPL', hasPosition: true, barCount: 60, news: [item] })
    expect(ctx.facts.position[0]).toContain('Holding 2 shares')
    expect(engine.decisions()[0]!.facts).toEqual(ctx.facts)
    expect(engine.decisions()[0]!.news).toEqual([item])
  })

  it('treats a news failure as no news rather than a failed decision', async () => {
    const news: JevDeps['news'] = { recent: vi.fn(async () => { throw new Error('news 403') }) }
    const { engine, oracle } = setup({ news })
    await engine.start()
    await settle(TICK)
    expect(oracle!.asked[0]!.news).toEqual([])
    expect(engine.decisions()[0]!.action).toBe('skipped')
    expect(engine.state().lastError).toContain('news 403')
  })
})

/* ---------- stop-loss / take-profit ---------- */

describe('engine: rail exits on ticks', () => {
  async function held(opts: { auto?: boolean, clock?: ClockDto, symbol?: string } = {}) {
    const symbol = opts.symbol ?? 'AAPL'
    const b = fakeBroker({ positions: [pos(symbol, { avgEntryPrice: 100 })], clock: opts.clock })
    const { engine, hub } = setup({ broker: b, watchlist: [symbol] })
    await engine.start()
    await engine.setAuto(opts.auto ?? true)
    return { engine, b, hub, symbol }
  }

  it('closes the position once when the stop-loss level prints', async () => {
    const { engine, b, hub } = await held()
    engine.onHubMessage(tick('AAPL', 97.9))
    engine.onHubMessage(tick('AAPL', 97.5))
    await settle(0)
    expect(b.closes).toEqual(['AAPL'])
    const decision = engine.decisions()[0]!
    expect(decision).toMatchObject({ trigger: 'stop_loss', verdict: 'sell', probability: 1, confidence: null, action: 'executed', orderId: 'o-sell-AAPL', price: 97.9 })
    expect(decision.facts.position[0]).toMatch(/^Stop-loss: price 97\.90 is -2\.10% versus entry 100\.00/)
    expect(hub.decisions()[0]!.id).toBe(decision.id)
  })

  it('takes profit at the configured gain', async () => {
    const { engine, b } = await held()
    engine.onHubMessage(tick('AAPL', 104.1))
    await settle(0)
    expect(b.closes).toEqual(['AAPL'])
    expect(engine.decisions()[0]).toMatchObject({ trigger: 'take_profit', verdict: 'sell', action: 'executed' })
  })

  it('does nothing inside the band, when auto is off, or for symbols not held', async () => {
    const { engine, b } = await held({ auto: false })
    engine.onHubMessage(tick('AAPL', 97))
    await settle(0)
    expect(b.closes).toEqual([])
    await engine.setAuto(true)
    engine.onHubMessage(tick('AAPL', 99))
    engine.onHubMessage(tick('MSFT', 1))
    await settle(0)
    expect(b.closes).toEqual([])
  })

  it('waits for the market to open for stocks but exits crypto around the clock', async () => {
    const stock = await held({ clock: closedClock })
    stock.engine.onHubMessage(tick('AAPL', 97))
    await settle(0)
    expect(stock.b.closes).toEqual([])
    stock.engine.shutdown()

    const crypto = await held({ clock: closedClock, symbol: 'BTC/USD' })
    crypto.engine.onHubMessage(tick('BTC/USD', 97))
    await settle(0)
    expect(crypto.b.closes).toEqual(['BTC/USD'])
  })

  it('arms again after the closing order fills', async () => {
    const { engine, b } = await held()
    engine.onHubMessage(tick('AAPL', 97))
    await settle(0)
    engine.onHubMessage(tick('AAPL', 96))
    await settle(0)
    expect(b.closes).toEqual(['AAPL'])
    engine.onHubMessage(fill('AAPL', 'sell'))
    await settle(0)
    engine.onHubMessage(tick('AAPL', 96))
    await settle(0)
    expect(b.closes).toEqual(['AAPL', 'AAPL'])
  })

  it('still fires while buys are halted by the daily loss limit', async () => {
    const b = fakeBroker({ positions: [pos('AAPL')], account: accountOf(99_700) })
    const { engine } = setup({ broker: b })
    await engine.start()
    await engine.setAuto(true)
    expect(engine.state().status).toBe('halted')
    engine.onHubMessage(tick('AAPL', 97))
    await settle(0)
    expect(b.closes).toEqual(['AAPL'])
  })
})

/* ---------- fills ---------- */

describe('engine: fills', () => {
  it('refreshes positions, records the holding start and re-evaluates after the delay', async () => {
    const b = fakeBroker()
    const { engine, oracle, hub } = setup({ broker: b, watchlist: ['AAPL'] })
    await engine.start()
    await settle(TICK)
    expect(oracle!.asked).toHaveLength(1)

    b.state.positions = [pos('AAPL')]
    engine.onHubMessage(fill('AAPL', 'buy'))
    await settle(0)
    expect(engine.state().openPositions).toBe(1)
    expect(oracle!.asked).toHaveLength(1)

    await settle(5_000)
    expect(oracle!.asked).toHaveLength(2)
    expect(oracle!.asked[1]!.facts.position).toContainEqual(expect.stringMatching(/^Held for about/))
    expect(engine.decisions()[0]!.trigger).toBe('fill')
    expect(hub.subscribed.flat()).toContain('AAPL')
  })

  it('drops a symbol from the universe once its position is gone and it is not on the watchlist', async () => {
    const b = fakeBroker({ positions: [pos('MSFT')] })
    const { engine, hub } = setup({ broker: b, watchlist: ['AAPL'] })
    await engine.start()
    expect(engine.state().universe).toEqual(['AAPL', 'MSFT'])
    b.state.positions = []
    engine.onHubMessage(fill('MSFT', 'sell'))
    await settle(0)
    expect(engine.state().universe).toEqual(['AAPL'])
    expect(hub.unsubscribed.at(-1)).toEqual(['MSFT'])
  })

  it('ignores frames it does not understand', () => {
    const { engine } = setup()
    expect(() => engine.onHubMessage({ type: 'pong' })).not.toThrow()
    expect(() => engine.onHubMessage({ type: 'tick' } as unknown as ServerMessage)).not.toThrow()
    expect(() => engine.onHubMessage(null as unknown as ServerMessage)).not.toThrow()
  })
})

/* ---------- daily loss halt ---------- */

describe('engine: daily loss halt', () => {
  it('halts buys until the next New York day, keeps sells, and lifts the halt after midnight', async () => {
    const b = fakeBroker({ account: accountOf(99_750) })
    const { engine, hub } = setup({ broker: b, oracle: fakeOracle(ctx => (ctx.hasPosition ? strongSell : strongBuy)) })
    await engine.start()
    await engine.setAuto(true)
    expect(engine.state()).toMatchObject({ status: 'halted', haltedUntil: '2026-09-24T04:00:00.000Z', dayPl: -250 })
    expect(engine.state().haltReason).toMatch(/-\$250\.00/)
    expect(hub.states().at(-1)!.status).toBe('halted')

    await settle(TICK)
    expect(b.buys).toEqual([])
    expect(engine.decisions()[0]).toMatchObject({ verdict: 'buy', skipReason: 'halted' })

    b.state.positions = [pos('AAPL')]
    engine.onHubMessage(fill('AAPL', 'buy'))
    await settle(0)
    await engine.evaluate('AAPL', 'manual')
    expect(b.closes).toEqual(['AAPL'])

    // A new session: Alpaca resets lastEquity, so the day P&L is small again.
    b.state.account = accountOf(99_900)
    vi.setSystemTime(Date.parse('2026-09-24T04:00:01.000Z'))
    await settle(TICK)
    expect(engine.state().status).not.toBe('halted')
    expect(engine.state().haltedUntil).toBeNull()
  })

  it('remembers the halt across restarts', async () => {
    const persisted = { state: { version: 1, auto: true, watchlist: ['AAPL'], cooldowns: {}, heldSince: {}, haltedUntil: '2026-09-24T04:00:00.000Z', haltReason: 'Day P&L -$250.00' } }
    const { engine } = setup({ persisted, oracle: fakeOracle(() => strongBuy) })
    await engine.start()
    expect(engine.state().status).toBe('halted')
    await engine.setAuto(true)
    await settle(TICK)
    expect(engine.decisions()[0]).toMatchObject({ skipReason: 'halted' })
  })
})

/* ---------- decisions API ---------- */

describe('engine: decisions', () => {
  it('lists newest first with the latest per symbol and restores the log from storage', async () => {
    const first = setup({ watchlist: ['AAPL', 'BTC/USD'], config: { intervalMs: 2_000 } })
    await first.engine.start()
    await settle(TICK * 2)
    const logged = first.engine.decisions()
    expect(logged.map(d => d.symbol)).toEqual(['BTC/USD', 'AAPL'])
    expect(Object.keys(first.engine.latestBySymbol()).sort()).toEqual(['AAPL', 'BTC/USD'])
    first.engine.shutdown()

    const second = setup({ persisted: Object.fromEntries(first.store.data), oracle: null })
    await second.engine.start()
    expect(second.engine.decisions().map((d: JevDecisionDto) => d.id)).toEqual(logged.map(d => d.id))
    expect(second.engine.decisions({ symbol: 'AAPL', limit: 1 })).toHaveLength(1)
  })
})
