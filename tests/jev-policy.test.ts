import { describe, expect, it } from 'vitest'
import { JEV_DEFAULTS } from '#shared/utils/jev-config'
import type { JevJudgment } from '~~/server/utils/jev/oracle'
import { decide } from '~~/server/utils/jev/policy'
import type { PolicyInput } from '~~/server/utils/jev/policy'

const NOW = Date.parse('2026-09-23T18:05:00.000Z')

const buy: JevJudgment = { verdict: 'buy', probabilities: { buy: 0.82, hold: 0.18 }, confidence: 0.7, trend: 3.2, newsTone: null, avoid: 0.1 }
const sell: JevJudgment = { verdict: 'sell', probabilities: { sell: 0.8, hold: 0.2 }, confidence: 0.65, trend: 1, newsTone: null, avoid: 0.2 }
const hold: JevJudgment = { verdict: 'hold', probabilities: { buy: 0.3, hold: 0.7 }, confidence: 0.4, trend: 2, newsTone: null, avoid: 0.1 }

function input(overrides: { judgment?: JevJudgment, ctx?: Partial<PolicyInput['ctx']>, engine?: Partial<PolicyInput['engine']>, config?: Partial<PolicyInput['config']> } = {}): PolicyInput {
  return {
    judgment: overrides.judgment ?? buy,
    ctx: { assetClass: 'us_equity', hasPosition: false, barCount: 60, ...overrides.ctx },
    engine: { auto: true, haltedUntil: null, cooldownUntil: null, openPositions: 2, buyingPower: 50_000, marketOpen: true, ...overrides.engine },
    config: { ...JEV_DEFAULTS, ...overrides.config },
    now: NOW
  }
}

const skip = (reason: string) => ({ execute: false, skipReason: reason })

describe('decide: signal quality', () => {
  it('executes a clean buy with the configured notional', () => {
    expect(decide(input())).toEqual({ execute: true, intent: { kind: 'buy', notionalUsd: 100 } })
  })

  it('executes a clean sell when a position is held', () => {
    expect(decide(input({ judgment: sell, ctx: { hasPosition: true } }))).toEqual({ execute: true, intent: { kind: 'sell' } })
  })

  it('skips hold verdicts', () => {
    expect(decide(input({ judgment: hold }))).toEqual(skip('hold'))
  })

  it('requires the verdict probability to reach the floor', () => {
    expect(decide(input({ judgment: { ...buy, probabilities: { buy: 0.74, hold: 0.26 } } }))).toEqual(skip('low_probability'))
    expect(decide(input({ judgment: { ...buy, probabilities: { buy: 0.75, hold: 0.25 } } })).execute).toBe(true)
  })

  it('requires confidence and treats a missing one as too low', () => {
    expect(decide(input({ judgment: { ...buy, confidence: 0.59 } }))).toEqual(skip('low_confidence'))
    expect(decide(input({ judgment: { ...buy, confidence: null } }))).toEqual(skip('low_confidence'))
    expect(decide(input({ judgment: { ...buy, confidence: 0.6 } })).execute).toBe(true)
  })

  it('vetoes when the avoid probability reaches the ceiling', () => {
    expect(decide(input({ judgment: { ...buy, avoid: 0.7 } }))).toEqual(skip('avoid'))
    expect(decide(input({ judgment: { ...buy, avoid: 0.69 } })).execute).toBe(true)
  })

  it('reports signal problems before the auto switch so the log stays informative', () => {
    expect(decide(input({ judgment: hold, engine: { auto: false } }))).toEqual(skip('hold'))
    expect(decide(input({ judgment: { ...buy, confidence: 0.1 }, engine: { auto: false } }))).toEqual(skip('low_confidence'))
  })
})

describe('decide: rails', () => {
  it('skips everything while auto is off', () => {
    expect(decide(input({ engine: { auto: false } }))).toEqual(skip('auto_off'))
    expect(decide(input({ judgment: sell, ctx: { hasPosition: true }, engine: { auto: false } }))).toEqual(skip('auto_off'))
  })

  it('blocks stocks when the market is closed or unknown, but not crypto', () => {
    expect(decide(input({ engine: { marketOpen: false } }))).toEqual(skip('market_closed'))
    expect(decide(input({ engine: { marketOpen: null } }))).toEqual(skip('market_closed'))
    expect(decide(input({ judgment: sell, ctx: { hasPosition: true }, engine: { marketOpen: false } }))).toEqual(skip('market_closed'))
    expect(decide(input({ ctx: { assetClass: 'crypto' }, engine: { marketOpen: false } })).execute).toBe(true)
  })

  it('halts buys but not sells while the daily loss halt is active', () => {
    const halted = { haltedUntil: NOW + 3_600_000 }
    expect(decide(input({ engine: halted }))).toEqual(skip('halted'))
    expect(decide(input({ judgment: sell, ctx: { hasPosition: true }, engine: halted })).execute).toBe(true)
    expect(decide(input({ engine: { haltedUntil: NOW - 1 } })).execute).toBe(true)
  })

  it('applies the cooldown to buys only', () => {
    const cooling = { cooldownUntil: NOW + 60_000 }
    expect(decide(input({ engine: cooling }))).toEqual(skip('cooldown'))
    expect(decide(input({ judgment: sell, ctx: { hasPosition: true }, engine: cooling })).execute).toBe(true)
    expect(decide(input({ engine: { cooldownUntil: NOW } })).execute).toBe(true)
  })

  it('needs enough bars to buy', () => {
    expect(decide(input({ ctx: { barCount: 19 } }))).toEqual(skip('insufficient_data'))
    expect(decide(input({ ctx: { barCount: 20 } })).execute).toBe(true)
  })

  it('never buys into an existing position', () => {
    expect(decide(input({ ctx: { hasPosition: true } }))).toEqual(skip('hold'))
  })

  it('respects the position cap', () => {
    expect(decide(input({ engine: { openPositions: 5 } }))).toEqual(skip('max_positions'))
    expect(decide(input({ engine: { openPositions: 4 } })).execute).toBe(true)
  })

  it('requires buying power for the notional, treating unknown as insufficient', () => {
    expect(decide(input({ engine: { buyingPower: 99.99 } }))).toEqual(skip('insufficient_buying_power'))
    expect(decide(input({ engine: { buyingPower: null } }))).toEqual(skip('insufficient_buying_power'))
    expect(decide(input({ engine: { buyingPower: 100 } })).execute).toBe(true)
  })

  it('cannot sell what is not held', () => {
    expect(decide(input({ judgment: sell, ctx: { hasPosition: false } }))).toEqual(skip('no_position'))
  })
})
