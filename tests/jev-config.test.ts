import { describe, expect, it } from 'vitest'
import { JEV_DEFAULTS, resolveJevConfig } from '#shared/utils/jev-config'

describe('resolveJevConfig', () => {
  it('returns the documented defaults for an empty input', () => {
    expect(resolveJevConfig({})).toEqual(JEV_DEFAULTS)
    expect(JEV_DEFAULTS).toMatchObject({
      notionalUsd: 100,
      maxPositions: 5,
      cooldownMs: 900_000,
      stopLossPct: -0.02,
      takeProfitPct: 0.04,
      dailyLossLimitUsd: 200,
      intervalMs: 300_000,
      minProbability: 0.75,
      minConfidence: 0.6,
      maxAvoid: 0.7
    })
  })

  it('coerces numeric strings coming from environment variables', () => {
    const cfg = resolveJevConfig({ notionalUsd: '150', stopLossPct: '-0.03', maxPositions: '3' })
    expect(cfg.notionalUsd).toBe(150)
    expect(cfg.stopLossPct).toBe(-0.03)
    expect(cfg.maxPositions).toBe(3)
    expect(cfg.takeProfitPct).toBe(JEV_DEFAULTS.takeProfitPct)
  })

  it('falls back to the default for values that are not finite numbers', () => {
    const cfg = resolveJevConfig({ notionalUsd: 'lots', intervalMs: '', minProbability: null })
    expect(cfg.notionalUsd).toBe(JEV_DEFAULTS.notionalUsd)
    expect(cfg.intervalMs).toBe(JEV_DEFAULTS.intervalMs)
    expect(cfg.minProbability).toBe(JEV_DEFAULTS.minProbability)
  })

  it('treats a non-object input as empty', () => {
    expect(resolveJevConfig(undefined)).toEqual(JEV_DEFAULTS)
    expect(resolveJevConfig('nope')).toEqual(JEV_DEFAULTS)
  })
})
