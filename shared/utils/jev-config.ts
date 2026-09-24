// Relative path on purpose: nuxt.config.ts imports this file outside the `#shared` alias.
import type { JevConfig } from '../types/jev'

export const JEV_DEFAULTS: Readonly<JevConfig> = Object.freeze({
  notionalUsd: 100,
  maxPositions: 5,
  cooldownMs: 15 * 60_000,
  stopLossPct: -0.02,
  takeProfitPct: 0.04,
  dailyLossLimitUsd: 200,
  intervalMs: 5 * 60_000,
  minProbability: 0.75,
  minConfidence: 0.6,
  maxAvoid: 0.7,
  minBars: 20,
  newsMaxAgeMs: 6 * 3_600_000,
  newsLimit: 5,
  decisionLogCap: 500
})

const KEYS = Object.keys(JEV_DEFAULTS) as (keyof JevConfig)[]

function finite(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * Merge runtime config (possibly env strings) over the defaults.
 * Anything that is not a finite number keeps its default.
 */
export function resolveJevConfig(raw: unknown): JevConfig {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out = { ...JEV_DEFAULTS } as JevConfig
  for (const key of KEYS) {
    const n = finite(source[key])
    if (n !== null) out[key] = n
  }
  return out
}
