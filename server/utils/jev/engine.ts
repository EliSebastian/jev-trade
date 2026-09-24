import { randomUUID } from 'node:crypto'
import { createError, isError } from 'h3'
import type { AccountDto, AssetClass, ClockDto, OrderDto, PositionDto, ServerMessage, TickMessage } from '#shared/types/trading'
import type { JevConfig, JevDecisionDto, JevFacts, JevNewsItem, JevStateDto, JevTrigger } from '#shared/types/jev'
import { classifySymbol, normalizeSymbol, WATCHLIST_DEFAULTS } from '#shared/utils/symbols'
import type { StreamHub } from '../stream-hub'
import { buildContext } from './context'
import type { JevBar } from './context'
import { createDecisionLog } from './decision-log'
import type { JevStorage } from './decision-log'
import { fmtPctSigned, fmtUsd, fmtUsdSigned } from './facts'
import type { JevOracle } from './oracle'
import { decide } from './policy'

/* ---------- injected dependencies ---------- */

export interface BrokerAdapter {
  account(): Promise<AccountDto>
  positions(): Promise<PositionDto[]>
  clock(): Promise<ClockDto>
  buyNotional(symbol: string, notionalUsd: number, clientOrderId: string): Promise<OrderDto>
  closePosition(symbol: string): Promise<OrderDto>
}

export interface MarketDataAdapter {
  /** Oldest-first one-minute bars. */
  minuteBars(symbol: string, assetClass: AssetClass): Promise<JevBar[]>
  daySnapshot(symbol: string, assetClass: AssetClass): Promise<{ high: number, low: number, lastPrice: number | null } | null>
}

export interface NewsAdapter {
  recent(symbol: string, since: Date, limit: number): Promise<JevNewsItem[]>
}

export type EngineHub = Pick<StreamHub, 'addPeer' | 'removePeer' | 'subscribe' | 'unsubscribe' | 'broadcast'>

export interface JevDeps {
  broker: BrokerAdapter
  market: MarketDataAdapter
  news: NewsAdapter
  /** Null when no gateway key is configured: the engine still boots and runs rail exits. */
  oracle: JevOracle | null
  hub: EngineHub
  storage: JevStorage
  config: JevConfig
  now?: () => number
  log?: Pick<Console, 'info' | 'warn' | 'error'>
  schedulerTickMs?: number
  fillReevalDelayMs?: number
  snapshotTtlMs?: number
  clockTtlMs?: number
  exitTimeoutMs?: number
  peerId?: string
  defaultWatchlist?: string[]
}

export interface JevEngine {
  start(): Promise<void>
  shutdown(): void
  state(): JevStateDto
  decisions(opts?: { symbol?: string, limit?: number }): JevDecisionDto[]
  latestBySymbol(): Record<string, JevDecisionDto>
  setAuto(on: boolean): Promise<JevStateDto>
  setWatchlist(symbols: string[]): Promise<JevStateDto>
  /** Manual or fill-triggered evaluation. Throws 503 without an oracle and 409 while the symbol is in flight. */
  evaluate(symbol: string, trigger: JevTrigger): Promise<JevDecisionDto>
  /** The hub peer's `send`: ticks feed the stop-loss / take-profit rails, order events feed fills. Never throws. */
  onHubMessage(msg: ServerMessage): void
}

interface PersistedState {
  version: 1
  auto: boolean
  watchlist: string[]
  cooldowns: Record<string, string>
  heldSince: Record<string, string>
  haltedUntil: string | null
  haltReason: string | null
}

const STATE_KEY = 'state'
const ET = 'America/New_York'
const etParts = new Intl.DateTimeFormat('en-US', { timeZone: ET, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })

function nyClockOf(ms: number) {
  const p: Record<string, number> = {}
  for (const part of etParts.formatToParts(new Date(ms))) if (part.type !== 'literal') p[part.type] = Number(part.value)
  return p as { year: number, month: number, day: number, hour: number, minute: number, second: number }
}

/** UTC offset of New York at `ms` (negative). */
function nyOffsetMs(ms: number): number {
  const c = nyClockOf(ms)
  return Date.UTC(c.year, c.month - 1, c.day, c.hour % 24, c.minute, c.second) - Math.floor(ms / 1000) * 1000
}

/** The first instant of the next New York calendar day. */
export function nextNyMidnight(ms: number): number {
  const c = nyClockOf(ms)
  const guess = Date.UTC(c.year, c.month - 1, c.day + 1)
  const first = guess - nyOffsetMs(guess)
  return guess - nyOffsetMs(first)
}

const emptyFacts = (): JevFacts => ({ time: [], market: [], price: [], position: [], account: [] })
const errorText = (err: unknown) => (isError(err) ? err.statusMessage ?? err.message : err instanceof Error ? err.message : String(err))
const unique = (symbols: string[]) => [...new Set(symbols)]
const sortedUnique = (symbols: string[]) => unique(symbols).sort()

/* ---------- engine ---------- */

export function createJevEngine(deps: JevDeps): JevEngine {
  const { broker, market, news, oracle, hub, storage, config } = deps
  const now = deps.now ?? (() => Date.now())
  const log = deps.log ?? console
  const tickMs = deps.schedulerTickMs ?? 10_000
  const fillReevalDelayMs = deps.fillReevalDelayMs ?? 5_000
  const snapshotTtlMs = deps.snapshotTtlMs ?? 10_000
  const clockTtlMs = deps.clockTtlMs ?? 60_000
  const exitTimeoutMs = deps.exitTimeoutMs ?? 120_000
  const peerId = deps.peerId ?? 'jev-engine'
  const defaultWatchlist = deps.defaultWatchlist ?? WATCHLIST_DEFAULTS

  const decisionLog = createDecisionLog({ storage, cap: config.decisionLogCap })

  /* persisted */
  let auto = false
  let watchlist: string[] = []
  const cooldowns = new Map<string, number>()
  const heldSince = new Map<string, string>()
  let haltedUntil: number | null = null
  let haltReason: string | null = null

  /* live */
  let account: AccountDto | null = null
  let clock: ClockDto | null = null
  let positions: PositionDto[] = []
  const positionsBySymbol = new Map<string, PositionDto>()
  let snapshotAt = Number.NEGATIVE_INFINITY
  let clockAt = Number.NEGATIVE_INFINITY
  let universe: string[] = []
  const slots = new Map<string, number>()
  const seen = new Set<string>()
  const evaluating = new Set<string>()
  const exitInFlight = new Map<string, ReturnType<typeof setTimeout>>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let interval: ReturnType<typeof setInterval> | undefined
  let ticking = false
  let booted = false
  let stopped = false
  let lastError: string | null = null

  const fail = (context: string, err: unknown) => {
    lastError = `${context}: ${errorText(err)}`
    log.warn(`[jev] ${lastError}`)
  }

  /* ---------- persistence and broadcast ---------- */

  async function persist() {
    const snapshot: PersistedState = {
      version: 1,
      auto,
      watchlist,
      cooldowns: Object.fromEntries([...cooldowns].map(([s, until]) => [s, new Date(until).toISOString()])),
      heldSince: Object.fromEntries(heldSince),
      haltedUntil: haltedUntil === null ? null : new Date(haltedUntil).toISOString(),
      haltReason
    }
    try {
      await storage.set(STATE_KEY, snapshot)
    } catch (err) {
      fail('persist', err)
    }
  }

  async function restore() {
    let raw: Partial<PersistedState> | null = null
    try {
      raw = await storage.get<Partial<PersistedState>>(STATE_KEY)
    } catch (err) {
      fail('restore', err)
    }
    // User's choice: every boot starts ARMED (auto-trading on), whatever was persisted. The panel switch can turn it off for the session.
    auto = true
    watchlist = Array.isArray(raw?.watchlist) ? unique(raw.watchlist.map(normalizeSymbol).filter(Boolean)) : [...defaultWatchlist]
    for (const [s, iso] of Object.entries(raw?.cooldowns ?? {})) {
      const t = Date.parse(iso)
      if (Number.isFinite(t) && t > now()) cooldowns.set(s, t)
    }
    for (const [s, iso] of Object.entries(raw?.heldSince ?? {})) if (typeof iso === 'string') heldSince.set(s, iso)
    const halt = raw?.haltedUntil ? Date.parse(raw.haltedUntil) : Number.NaN
    if (Number.isFinite(halt) && halt > now()) {
      haltedUntil = halt
      haltReason = raw?.haltReason ?? null
    }
  }

  function state(): JevStateDto {
    const t = now()
    const halted = haltedUntil !== null && t < haltedUntil
    return {
      available: true,
      aiConfigured: oracle !== null,
      auto,
      status: !oracle ? 'disabled' : halted ? 'halted' : evaluating.size ? 'evaluating' : 'idle',
      haltedUntil: halted ? new Date(haltedUntil!).toISOString() : null,
      haltReason: halted ? haltReason : null,
      watchlist: [...watchlist],
      universe: [...universe],
      evaluating: [...evaluating],
      cooldowns: Object.fromEntries([...cooldowns].filter(([, until]) => until > t).map(([s, until]) => [s, new Date(until).toISOString()])),
      nextDueAt: Object.fromEntries([...slots].map(([s, due]) => [s, new Date(due).toISOString()])),
      openPositions: positions.length,
      dayPl: account ? account.equity - account.lastEquity : null,
      marketOpen: clock?.isOpen ?? null,
      config: { ...config },
      lastError
    }
  }

  function broadcastState() {
    hub.broadcast({ type: 'jev', event: 'state', state: state() })
  }

  async function record(decision: JevDecisionDto) {
    try {
      await decisionLog.append(decision)
    } catch (err) {
      fail('decision log', err)
    }
    hub.broadcast({ type: 'jev', event: 'decision', decision })
    broadcastState()
  }

  /* ---------- broker snapshot ---------- */

  async function refreshClock() {
    try {
      clock = await broker.clock()
      clockAt = now()
    } catch (err) {
      fail('clock', err)
    }
  }

  async function maybeRefreshClock() {
    const t = now()
    const boundary = clock ? Date.parse(clock.isOpen ? clock.nextClose : clock.nextOpen) : Number.NaN
    if (!clock || t - clockAt > clockTtlMs || (Number.isFinite(boundary) && t >= boundary)) await refreshClock()
  }

  function checkDailyLoss() {
    if (!account) return
    const t = now()
    const dayPl = account.equity - account.lastEquity
    const halted = haltedUntil !== null && t < haltedUntil
    if (halted || dayPl > -config.dailyLossLimitUsd) return
    haltedUntil = nextNyMidnight(t)
    haltReason = `Day P&L ${fmtUsdSigned(dayPl)} hit the ${fmtUsd(-config.dailyLossLimitUsd)} daily loss limit; buys halted until ${new Date(haltedUntil).toISOString()}`
    log.warn(`[jev] ${haltReason}`)
    void persist()
    broadcastState()
  }

  function clearHaltIfExpired() {
    if (haltedUntil === null || now() < haltedUntil) return
    haltedUntil = null
    haltReason = null
    log.info('[jev] daily loss halt lifted')
    void persist()
    broadcastState()
  }

  async function refreshSnapshot() {
    const [acc, pos] = await Promise.allSettled([broker.account(), broker.positions()])
    await maybeRefreshClock()
    if (acc.status === 'fulfilled') account = acc.value
    else fail('account', acc.reason)
    if (pos.status === 'fulfilled') {
      positions = pos.value
      positionsBySymbol.clear()
      for (const p of positions) positionsBySymbol.set(p.symbol, p)
    } else {
      fail('positions', pos.reason)
    }
    snapshotAt = now()
    checkDailyLoss()
    if (booted) syncUniverse()
  }

  async function snapshot() {
    if (now() - snapshotAt > snapshotTtlMs) await refreshSnapshot()
  }

  /* ---------- universe and scheduling ---------- */

  function syncUniverse(stagger = false) {
    const next = sortedUnique([...watchlist, ...positions.map(p => p.symbol)])
    const added = next.filter(s => !universe.includes(s))
    const removed = universe.filter(s => !next.includes(s))
    universe = next
    if (added.length) hub.subscribe(peerId, added)
    if (removed.length) hub.unsubscribe(peerId, removed)
    for (const s of removed) slots.delete(s)
    const t = now()
    added.forEach((s) => {
      const i = stagger ? universe.indexOf(s) : 0
      slots.set(s, t + Math.round((i * config.intervalMs) / Math.max(1, universe.length)))
    })
  }

  async function tick() {
    if (stopped || ticking) return
    ticking = true
    try {
      await maybeRefreshClock()
      clearHaltIfExpired()
      const due = [...slots].filter(([, at]) => at <= now()).map(([s]) => s)
      for (const symbol of due) {
        if (stopped) break
        const t = now()
        if (classifySymbol(symbol) !== 'crypto' && clock && !clock.isOpen) {
          const open = Date.parse(clock.nextOpen)
          slots.set(symbol, Math.max(Number.isFinite(open) ? open : 0, t + tickMs))
          continue
        }
        if (!oracle) {
          slots.set(symbol, t + config.intervalMs)
          continue
        }
        await evaluateSymbol(symbol, seen.has(symbol) ? 'schedule' : 'boot')
        slots.set(symbol, now() + config.intervalMs)
      }
    } catch (err) {
      fail('scheduler', err)
    } finally {
      ticking = false
    }
  }

  /* ---------- evaluation ---------- */

  function baseDecision(symbol: string, trigger: JevTrigger): JevDecisionDto {
    return {
      id: randomUUID(),
      ts: new Date(now()).toISOString(),
      symbol,
      assetClass: classifySymbol(symbol),
      trigger,
      verdict: 'hold',
      probability: 0,
      probabilities: {},
      confidence: null,
      trend: null,
      newsTone: null,
      avoid: null,
      action: 'skipped',
      skipReason: null,
      orderId: null,
      error: null,
      price: null,
      facts: emptyFacts(),
      news: []
    }
  }

  async function evaluateSymbol(symbol: string, trigger: JevTrigger): Promise<JevDecisionDto | null> {
    if (!oracle || evaluating.has(symbol)) return null
    evaluating.add(symbol)
    broadcastState()
    const decision = baseDecision(symbol, trigger)
    try {
      await snapshot()
      const assetClass = classifySymbol(symbol)
      const position = positionsBySymbol.get(symbol) ?? null
      const t = now()
      const [bars, day, items] = await Promise.all([
        market.minuteBars(symbol, assetClass),
        market.daySnapshot(symbol, assetClass),
        news.recent(symbol, new Date(t - config.newsMaxAgeMs), config.newsLimit).catch((err: unknown) => {
          fail(`news ${symbol}`, err)
          return [] as JevNewsItem[]
        })
      ])
      const ctx = buildContext({
        symbol,
        assetClass,
        now: t,
        bars,
        day,
        position,
        heldSince: heldSince.get(symbol) ?? null,
        account,
        clock,
        openPositions: positions.length,
        news: items,
        config
      })
      decision.facts = ctx.facts
      decision.news = ctx.news
      decision.price = ctx.lastPrice

      const judgment = await oracle.ask(ctx)
      decision.verdict = judgment.verdict
      decision.probabilities = judgment.probabilities
      decision.probability = judgment.probabilities[judgment.verdict] ?? 0
      decision.confidence = judgment.confidence
      decision.trend = judgment.trend
      decision.newsTone = judgment.newsTone
      decision.avoid = judgment.avoid

      const policy = decide({
        judgment,
        ctx: { assetClass, hasPosition: ctx.hasPosition, barCount: ctx.barCount },
        engine: {
          auto,
          haltedUntil,
          cooldownUntil: cooldowns.get(symbol) ?? null,
          openPositions: positions.length,
          buyingPower: account?.buyingPower ?? null,
          marketOpen: clock?.isOpen ?? null
        },
        config,
        now: t
      })

      if (!policy.execute) {
        decision.skipReason = policy.skipReason
      } else {
        try {
          const order = policy.intent.kind === 'buy'
            ? await broker.buyNotional(symbol, policy.intent.notionalUsd, `jev-${randomUUID().slice(0, 8)}`)
            : await broker.closePosition(symbol)
          decision.action = 'executed'
          decision.orderId = order.id
          cooldowns.set(symbol, now() + config.cooldownMs)
          log.info(`[jev] ${policy.intent.kind === 'buy' ? 'BUY' : 'SELL'} ${symbol} (${trigger}) p=${decision.probability} c=${decision.confidence}`)
          await persist()
        } catch (err) {
          decision.action = 'failed'
          decision.error = errorText(err)
          fail(`order ${symbol}`, err)
        }
      }
    } catch (err) {
      decision.action = 'failed'
      decision.error = errorText(err)
      fail(`evaluate ${symbol}`, err)
    } finally {
      evaluating.delete(symbol)
      seen.add(symbol)
    }
    await record(decision)
    return decision
  }

  /* ---------- rails on ticks ---------- */

  function releaseExit(symbol: string) {
    const timer = exitInFlight.get(symbol)
    if (timer) clearTimeout(timer)
    exitInFlight.delete(symbol)
  }

  async function railExit(symbol: string, trigger: 'stop_loss' | 'take_profit', price: number, position: PositionDto, pl: number) {
    releaseExit(symbol)
    exitInFlight.set(symbol, setTimeout(() => exitInFlight.delete(symbol), exitTimeoutMs))
    const decision = baseDecision(symbol, trigger)
    decision.verdict = 'sell'
    decision.probability = 1
    decision.probabilities = { sell: 1 }
    decision.price = price
    const label = trigger === 'stop_loss' ? 'Stop-loss' : 'Take-profit'
    decision.facts.position = [`${label}: price ${price.toFixed(2)} is ${fmtPctSigned(pl)} versus entry ${position.avgEntryPrice.toFixed(2)}; closing the whole position.`]
    try {
      const order = await broker.closePosition(symbol)
      decision.action = 'executed'
      decision.orderId = order.id
      cooldowns.set(symbol, now() + config.cooldownMs)
      log.info(`[jev] ${label} exit ${symbol} at ${price}`)
      await persist()
    } catch (err) {
      decision.action = 'failed'
      decision.error = errorText(err)
      releaseExit(symbol)
      fail(`${label} ${symbol}`, err)
    }
    await record(decision)
  }

  function handleTick(tick: TickMessage) {
    if (!auto || typeof tick.symbol !== 'string' || !Number.isFinite(tick.price)) return
    const position = positionsBySymbol.get(tick.symbol)
    if (!position || position.avgEntryPrice <= 0 || exitInFlight.has(tick.symbol)) return
    if (classifySymbol(tick.symbol) !== 'crypto' && clock?.isOpen !== true) return
    const pl = tick.price / position.avgEntryPrice - 1
    const trigger = pl <= config.stopLossPct ? 'stop_loss' : pl >= config.takeProfitPct ? 'take_profit' : null
    if (!trigger) return
    void railExit(tick.symbol, trigger, tick.price, position, pl)
  }

  /* ---------- fills ---------- */

  function later(ms: number, fn: () => void) {
    const timer = setTimeout(() => {
      timers.delete(timer)
      if (!stopped) fn()
    }, ms)
    timers.add(timer)
  }

  function handleOrder(event: string, order: OrderDto) {
    const symbol = order.symbol
    if (typeof symbol !== 'string') return
    if (event === 'fill' || event === 'canceled' || event === 'rejected' || event === 'expired') releaseExit(symbol)
    if (event !== 'fill' && event !== 'partial_fill') return

    if (order.side === 'buy' && !heldSince.has(symbol)) heldSince.set(symbol, order.filledAt ?? new Date(now()).toISOString())
    snapshotAt = Number.NEGATIVE_INFINITY
    void refreshSnapshot().then(() => {
      if (!positionsBySymbol.has(symbol)) heldSince.delete(symbol)
      return persist()
    })

    if (event === 'fill' && oracle) {
      later(fillReevalDelayMs, () => {
        if (universe.includes(symbol)) void evaluateSymbol(symbol, 'fill')
      })
    }
  }

  function onHubMessage(msg: ServerMessage) {
    try {
      if (!msg || typeof msg !== 'object') return
      if (msg.type === 'tick') handleTick(msg)
      else if (msg.type === 'order' && msg.order) handleOrder(msg.event, msg.order)
    } catch (err) {
      fail('hub message', err)
    }
  }

  /* ---------- public API ---------- */

  return {
    async start() {
      if (booted || stopped) return
      await restore()
      await decisionLog.load()
      hub.addPeer({ id: peerId, send: onHubMessage })
      await refreshSnapshot()
      syncUniverse(true)
      booted = true
      interval = setInterval(() => void tick(), tickMs)
      log.info(`[jev] engine started: auto=${auto ? 'on' : 'off'} ai=${oracle ? 'ready' : 'missing key'} universe=${universe.join(',') || '(empty)'}`)
      broadcastState()
    },

    shutdown() {
      if (stopped) return
      stopped = true
      if (interval) clearInterval(interval)
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      for (const symbol of [...exitInFlight.keys()]) releaseExit(symbol)
      if (booted) hub.removePeer(peerId)
    },

    state,
    decisions: opts => decisionLog.list(opts),
    latestBySymbol: () => decisionLog.latestBySymbol(),

    async setAuto(on) {
      auto = on
      log.info(`[jev] auto ${on ? 'ON' : 'OFF'}`)
      await persist()
      broadcastState()
      return state()
    },

    async setWatchlist(symbols) {
      // Keep the user's order; only the universe is sorted.
      watchlist = unique(symbols.map(normalizeSymbol).filter(Boolean))
      await persist()
      syncUniverse()
      broadcastState()
      return state()
    },

    async evaluate(symbol, trigger) {
      if (!oracle) throw createError({ statusCode: 503, statusMessage: 'Jev is disabled: set NUXT_AI_GATEWAY_API_KEY to enable evaluations' })
      const s = normalizeSymbol(symbol)
      if (!s) throw createError({ statusCode: 400, statusMessage: 'Symbol is required' })
      if (evaluating.has(s)) throw createError({ statusCode: 409, statusMessage: `${s} is already being evaluated` })
      const decision = await evaluateSymbol(s, trigger)
      if (!decision) throw createError({ statusCode: 409, statusMessage: `${s} is already being evaluated` })
      return decision
    },

    onHubMessage
  }
}

/* ---------- process-wide singleton (mirrors the stream hub) ---------- */

declare global {
  // eslint-disable-next-line no-var
  var __jevTradeEngine: JevEngine | undefined
}

export function getJevEngine(): JevEngine | undefined {
  return globalThis.__jevTradeEngine
}

export function setJevEngine(engine: JevEngine | undefined) {
  globalThis.__jevTradeEngine = engine
}
