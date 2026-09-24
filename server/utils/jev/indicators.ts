/**
 * Pure indicator math over oldest-first one-minute closes/volumes.
 * Every function returns `null` when the input cannot support the calculation,
 * so the fact builder can say "cannot be computed" instead of guessing.
 */

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1))
}

/** Ratio change from the close `n` bars ago to the last close. */
export function returnOver(closes: number[], n: number): number | null {
  if (n < 1 || closes.length < n + 1) return null
  const last = closes[closes.length - 1]!
  const base = closes[closes.length - 1 - n]!
  return base === 0 ? null : last / base - 1
}

/** Simple moving average of the last `n` closes. */
export function sma(closes: number[], n: number): number | null {
  if (n < 1 || closes.length < n) return null
  return mean(closes.slice(-n))
}

/** Wilder RSI over `period` changes. Needs `period + 1` closes. */
export function rsi(closes: number[], period = 14): number | null {
  if (period < 1 || closes.length < period + 1) return null
  const changes: number[] = []
  for (let i = 1; i < closes.length; i++) changes.push(closes[i]! - closes[i - 1]!)

  let avgGain = mean(changes.slice(0, period).map(c => Math.max(c, 0)))
  let avgLoss = mean(changes.slice(0, period).map(c => Math.max(-c, 0)))
  for (const c of changes.slice(period)) {
    avgGain = (avgGain * (period - 1) + Math.max(c, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-c, 0)) / period
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

/**
 * Standard deviation of one-minute log returns over the last `recent` returns,
 * divided by the same measure over the `earlier` returns that precede them.
 */
export function realizedVolRatio(closes: number[], recent = 15, earlier = 30): number | null {
  if (closes.length < recent + earlier + 1) return null
  const rets: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1]!
    const b = closes[i]!
    if (a <= 0 || b <= 0) return null
    rets.push(Math.log(b / a))
  }
  const recentRets = rets.slice(-recent)
  const earlierRets = rets.slice(-(recent + earlier), -recent)
  const base = stdev(earlierRets)
  if (base === 0) return null
  return stdev(recentRets) / base
}

/** Mean of the last `n` volumes over the mean of everything before them. Needs `2n` volumes. */
export function volumeRatio(volumes: number[], n = 5): number | null {
  if (n < 1 || volumes.length < 2 * n) return null
  const base = mean(volumes.slice(0, -n))
  if (base <= 0) return null
  return mean(volumes.slice(-n)) / base
}

/** Where `price` sits between `low` and `high`, clamped to 0..1. */
export function rangePosition(price: number | null, low: number | null, high: number | null): number | null {
  if (price === null || low === null || high === null) return null
  if (![price, low, high].every(Number.isFinite) || high <= low) return null
  return Math.min(1, Math.max(0, (price - low) / (high - low)))
}

/** Milliseconds between the newest bar's timestamp and `now`. */
export function barAgeMs(lastBarTs: string | null | undefined, now: number): number | null {
  if (!lastBarTs) return null
  const t = Date.parse(lastBarTs)
  return Number.isFinite(t) ? Math.max(0, now - t) : null
}
