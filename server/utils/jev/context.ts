import type { AccountDto, AssetClass, ClockDto, PositionDto } from '#shared/types/trading'
import type { JevConfig, JevFacts, JevNewsItem } from '#shared/types/jev'
import {
  fmtDurationShort,
  fmtPctSigned,
  fmtUsd,
  fmtUsdSigned,
  plLabel,
  rangeFact,
  returnFact,
  returnUnavailableFact,
  rsiFact,
  smaFact,
  stalenessFact,
  volFact,
  volumeFact
} from './facts'
import { barAgeMs, rangePosition, realizedVolRatio, returnOver, rsi, sma, volumeRatio } from './indicators'

/** One-minute bar, oldest-first in arrays. */
export interface JevBar {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface ContextInput {
  symbol: string
  assetClass: AssetClass
  now: number
  bars: JevBar[]
  day: { high: number, low: number, lastPrice: number | null } | null
  position: PositionDto | null
  /** ISO time the engine saw the position open, or null when unknown. */
  heldSince: string | null
  account: AccountDto | null
  clock: ClockDto | null
  openPositions: number
  news: JevNewsItem[]
  config: JevConfig
}

/** What the model receives as `state`. */
export interface JevStateJson {
  symbol: string
  assetClass: 'stock' | 'crypto'
  time: string[]
  market: string[]
  price: string[]
  position: { status: 'flat' | 'long', facts: string[] }
  account: string[]
  news: { age: string, source: string, headline: string, summary: string }[]
  newsNote: string | null
}

export interface JevContext {
  symbol: string
  assetClass: AssetClass
  hasPosition: boolean
  barCount: number
  lastPrice: number | null
  stale: boolean
  facts: JevFacts
  news: JevNewsItem[]
  state: JevStateJson
}

const ET = 'America/New_York'
const CLOSING_SOON_MS = 30 * 60_000
const SUMMARY_MAX = 300
const RETURN_HORIZONS = [5, 15, 60]

const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'long' })
const clockFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

const etClock = (ms: number) => clockFmt.format(new Date(ms))
const qtyText = (qty: number) => Number(Math.abs(qty).toFixed(8)).toString()
const truncate = (s: string) => (s.length > SUMMARY_MAX ? `${s.slice(0, SUMMARY_MAX - 1)}…` : s)

/* ---------- fact groups ---------- */

function timeFacts(now: number): string[] {
  return [`It is ${weekdayFmt.format(new Date(now))} ${etClock(now)} ET.`]
}

function marketFacts(assetClass: AssetClass, clock: ClockDto | null, now: number): string[] {
  if (!clock) return ['Market session status is unknown.']
  if (assetClass === 'crypto') {
    const facts = ['Crypto trades 24/7; no session close applies.']
    if (!clock.isOpen) facts.push('US equities are closed, so crypto liquidity may be thinner.')
    return facts
  }
  if (clock.isOpen) {
    const untilClose = Math.max(0, Date.parse(clock.nextClose) - now)
    const soon = untilClose < CLOSING_SOON_MS ? ' (closing soon)' : ''
    return [`US stock market is open; it closes in ${fmtDurationShort(untilClose)}${soon}.`]
  }
  const untilOpen = Math.max(0, Date.parse(clock.nextOpen) - now)
  return [`US stock market is closed; it opens in ${fmtDurationShort(untilOpen)}. Stock orders cannot be executed now.`]
}

/** Change over `n` minutes; with exactly `n` bars the first bar's open stands in for the missing close. */
function changeOver(bars: JevBar[], closes: number[], n: number): number | null {
  const r = returnOver(closes, n)
  if (r !== null) return r
  if (bars.length === n && bars[0]!.open > 0) return closes[closes.length - 1]! / bars[0]!.open - 1
  return null
}

function priceFacts(input: ContextInput, lastPrice: number | null, ageMs: number | null): string[] {
  const { bars } = input
  const facts: string[] = []
  if (lastPrice === null) return ['No price data is available.']

  const last = bars[bars.length - 1]
  const ending = last ? ` (1-minute bar ending ${etClock(Date.parse(last.timestamp) + 60_000)} ET)` : ''
  facts.push(`Last price is ${lastPrice.toFixed(2)}${ending}.`)
  const stale = stalenessFact(ageMs)
  if (stale) facts.push(stale)

  const closes = bars.map(b => b.close)
  for (const n of RETURN_HORIZONS) {
    const r = changeOver(bars, closes, n)
    facts.push(r === null ? returnUnavailableFact(n, bars.length) : returnFact(n, r))
  }

  const avg = sma(closes, 20)
  facts.push(avg === null || avg === 0
    ? 'Fewer than 20 bars are available, so the moving average cannot be computed.'
    : smaFact(lastPrice / avg - 1))

  const strength = rsi(closes, 14)
  if (strength !== null) facts.push(rsiFact(strength))

  const vol = realizedVolRatio(closes, 15, 30)
  if (vol !== null) facts.push(volFact(vol))

  if (input.day) {
    const pos = rangePosition(lastPrice, input.day.low, input.day.high)
    if (pos !== null) facts.push(rangeFact(pos, input.day.low, input.day.high))
  }

  const volume = volumeRatio(bars.map(b => b.volume), 5)
  if (volume !== null) facts.push(volumeFact(volume))

  return facts
}

function positionFacts(input: ContextInput): string[] {
  const { position, symbol, assetClass, config, heldSince, now } = input
  if (!position) return [`No position is held in ${symbol}.`]
  const unit = assetClass === 'crypto' ? 'units' : 'shares'
  const facts = [
    `Holding ${qtyText(position.qty)} ${unit} bought at an average of ${position.avgEntryPrice.toFixed(2)} (about ${fmtUsd(Math.abs(position.costBasis))} at entry).`,
    `Unrealized P&L is ${fmtPctSigned(position.unrealizedPlpc)} (${fmtUsdSigned(position.unrealizedPl)}) (${plLabel(position.unrealizedPlpc)}).`
  ]
  const since = heldSince ? Date.parse(heldSince) : Number.NaN
  facts.push(Number.isFinite(since)
    ? `Held for about ${fmtDurationShort(Math.max(0, now - since))}.`
    : "Holding period is unknown (position predates the engine's records).")
  facts.push(`An automatic stop-loss at ${fmtPctSigned(config.stopLossPct)} and take-profit at ${fmtPctSigned(config.takeProfitPct)} protect this position.`)
  return facts
}

function accountFacts(input: ContextInput): string[] {
  const { account, config, openPositions } = input
  const facts: string[] = []
  if (!account) {
    facts.push('Account data is unavailable.')
  } else {
    facts.push(`Buying power is ${fmtUsd(account.buyingPower)} and cash is ${fmtUsd(account.cash)}; a new buy would use ${fmtUsd(config.notionalUsd)}.`)
    const dayPl = account.equity - account.lastEquity
    const limit = fmtUsd(-config.dailyLossLimitUsd)
    facts.push(dayPl <= -config.dailyLossLimitUsd
      ? `Day P&L is ${fmtUsdSigned(dayPl)}, which has hit the ${limit} daily loss limit; new buys are halted for today.`
      : `Day P&L is ${fmtUsdSigned(dayPl)} (daily loss limit is ${limit}).`)
  }
  facts.push(`${openPositions} of ${config.maxPositions} allowed positions are open.`)
  return facts
}

/* ---------- entry point ---------- */

export function buildContext(input: ContextInput): JevContext {
  const { bars, now } = input
  const last = bars[bars.length - 1]
  const lastPrice = input.day?.lastPrice ?? last?.close ?? null
  const ageMs = barAgeMs(last?.timestamp, now)
  const stale = stalenessFact(ageMs) !== null

  const facts: JevFacts = {
    time: timeFacts(now),
    market: marketFacts(input.assetClass, input.clock, now),
    price: priceFacts(input, lastPrice, ageMs),
    position: positionFacts(input),
    account: accountFacts(input)
  }

  const hours = Math.round(input.config.newsMaxAgeMs / 3_600_000)
  const state: JevStateJson = {
    symbol: input.symbol,
    assetClass: input.assetClass === 'crypto' ? 'crypto' : 'stock',
    time: facts.time,
    market: facts.market,
    price: facts.price,
    position: { status: input.position ? 'long' : 'flat', facts: facts.position },
    account: facts.account,
    news: input.news.map(n => ({
      age: `${fmtDurationShort(Math.max(0, now - Date.parse(n.createdAt)))} ago`,
      source: n.source,
      headline: n.headline,
      summary: truncate(n.summary)
    })),
    newsNote: input.news.length ? null : `No news for ${input.symbol} in the last ${hours} hours.`
  }

  return {
    symbol: input.symbol,
    assetClass: input.assetClass,
    hasPosition: Boolean(input.position),
    barCount: bars.length,
    lastPrice,
    stale,
    facts,
    news: input.news,
    state
  }
}
