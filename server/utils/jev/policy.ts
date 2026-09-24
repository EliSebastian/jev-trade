import type { AssetClass } from '#shared/types/trading'
import type { JevConfig, JevSkipReason } from '#shared/types/jev'
import type { JevJudgment } from './oracle'

/**
 * Pure policy: turns a judgment plus the engine's view of the world into
 * "place this order" or "log it with this reason". Rails live here, not in the model.
 */

export interface PolicyInput {
  judgment: JevJudgment
  ctx: {
    assetClass: AssetClass
    hasPosition: boolean
    barCount: number
  }
  engine: {
    auto: boolean
    haltedUntil: number | null
    cooldownUntil: number | null
    openPositions: number
    buyingPower: number | null
    marketOpen: boolean | null
  }
  config: JevConfig
  now: number
}

export type TradeIntent = { kind: 'buy', notionalUsd: number } | { kind: 'sell' }

export type PolicyDecision =
  | { execute: true, intent: TradeIntent }
  | { execute: false, skipReason: JevSkipReason }

const skip = (skipReason: JevSkipReason): PolicyDecision => ({ execute: false, skipReason })

/** First matching rule wins. Signal quality comes first so the log distinguishes weak signals from rails. */
export function decide({ judgment, ctx, engine, config, now }: PolicyInput): PolicyDecision {
  const { verdict } = judgment
  if (verdict === 'hold') return skip('hold')
  if ((judgment.probabilities[verdict] ?? 0) < config.minProbability) return skip('low_probability')
  if (judgment.confidence === null || judgment.confidence < config.minConfidence) return skip('low_confidence')
  if (judgment.avoid >= config.maxAvoid) return skip('avoid')

  if (!engine.auto) return skip('auto_off')
  if (ctx.assetClass !== 'crypto' && engine.marketOpen !== true) return skip('market_closed')

  if (verdict === 'buy') {
    if (engine.haltedUntil !== null && now < engine.haltedUntil) return skip('halted')
    if (engine.cooldownUntil !== null && now < engine.cooldownUntil) return skip('cooldown')
    if (ctx.barCount < config.minBars) return skip('insufficient_data')
    if (ctx.hasPosition) return skip('hold')
    if (engine.openPositions >= config.maxPositions) return skip('max_positions')
    if (engine.buyingPower === null || engine.buyingPower < config.notionalUsd) return skip('insufficient_buying_power')
    return { execute: true, intent: { kind: 'buy', notionalUsd: config.notionalUsd } }
  }

  if (!ctx.hasPosition) return skip('no_position')
  return { execute: true, intent: { kind: 'sell' } }
}
