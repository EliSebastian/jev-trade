import type { AssetClass } from './trading'

/* ---------- decisions ---------- */

export type JevVerdict = 'buy' | 'sell' | 'hold'

/** What caused an evaluation or a rail exit. */
export type JevTrigger = 'boot' | 'schedule' | 'fill' | 'manual' | 'stop_loss' | 'take_profit'

/** Why a verdict was logged instead of executed. */
export type JevSkipReason =
  | 'hold'
  | 'low_probability'
  | 'low_confidence'
  | 'avoid'
  | 'auto_off'
  | 'halted'
  | 'cooldown'
  | 'market_closed'
  | 'insufficient_data'
  | 'max_positions'
  | 'insufficient_buying_power'
  | 'no_position'
  | 'in_flight'

export type JevAction = 'executed' | 'skipped' | 'failed'

/** Rails and thresholds. Every field can be overridden through `NUXT_JEV_*` env vars. */
export interface JevConfig {
  /** Dollar amount of each market buy. */
  notionalUsd: number
  maxPositions: number
  /** Minimum time between buys of the same symbol after any order on it. */
  cooldownMs: number
  /** Ratio, negative (`-0.02` = -2%). */
  stopLossPct: number
  /** Ratio, positive (`0.04` = +4%). */
  takeProfitPct: number
  /** Positive dollars; buys halt for the day once day P&L <= -limit. */
  dailyLossLimitUsd: number
  /** Scheduler period per symbol. */
  intervalMs: number
  minProbability: number
  minConfidence: number
  /** `avoid` probability at or above this vetoes execution. */
  maxAvoid: number
  /** Minimum one-minute bars before a buy is considered. */
  minBars: number
  newsMaxAgeMs: number
  newsLimit: number
  decisionLogCap: number
}

export interface JevNewsItem {
  headline: string
  summary: string
  source: string
  createdAt: string
  url: string | null
}

/** Sentences the engine wrote for the model, grouped for display. */
export interface JevFacts {
  time: string[]
  market: string[]
  price: string[]
  position: string[]
  account: string[]
}

export interface JevDecisionDto {
  id: string
  ts: string
  symbol: string
  assetClass: AssetClass
  trigger: JevTrigger
  verdict: JevVerdict
  /** Probability of the verdict; 1 for rail exits. */
  probability: number
  probabilities: Record<string, number>
  /** Concentration of the action distribution; null for rail exits or when the provider omitted it. */
  confidence: number | null
  /** Expected trend level 0..4, null for rail exits. */
  trend: number | null
  /** Expected news tone level 0..4, null when there was no news. */
  newsTone: number | null
  avoid: number | null
  action: JevAction
  skipReason: JevSkipReason | null
  orderId: string | null
  error: string | null
  price: number | null
  facts: JevFacts
  news: JevNewsItem[]
}

/* ---------- engine state ---------- */

export type JevStatus = 'disabled' | 'idle' | 'evaluating' | 'halted'

export interface JevStateDto {
  /** Alpaca keys present and the engine booted. */
  available: boolean
  /** Gateway key present, so evaluations can run. */
  aiConfigured: boolean
  auto: boolean
  status: JevStatus
  haltedUntil: string | null
  haltReason: string | null
  watchlist: string[]
  universe: string[]
  evaluating: string[]
  /** symbol -> ISO time the buy cooldown ends */
  cooldowns: Record<string, string>
  /** symbol -> ISO time of the next scheduled evaluation */
  nextDueAt: Record<string, string>
  openPositions: number
  dayPl: number | null
  marketOpen: boolean | null
  config: JevConfig
  lastError: string | null
}

/* ---------- WebSocket frames (server -> browser) ---------- */

export interface JevDecisionMessage {
  type: 'jev'
  event: 'decision'
  decision: JevDecisionDto
}

export interface JevStateMessage {
  type: 'jev'
  event: 'state'
  state: JevStateDto
}

export type JevMessage = JevDecisionMessage | JevStateMessage
