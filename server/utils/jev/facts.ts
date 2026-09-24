/**
 * Numbers -> short sentences with a qualitative label.
 * Jev reads these; it is not a calculator, so every comparison is spelled out here.
 */

/* ---------- formatting ---------- */

const pct2 = (r: number) => `${r >= 0 ? '+' : '-'}${(Math.abs(r) * 100).toFixed(2)}%`
const pct1abs = (r: number) => `${(Math.abs(r) * 100).toFixed(1)}%`
const price2 = (v: number) => v.toFixed(2)

/** `$184,220`, `$100`, `$99.87`, `-$200`: whole dollars when large or round, cents otherwise. */
export function fmtUsd(v: number): string {
  const abs = Math.abs(v)
  const digits = abs >= 1000 || Number.isInteger(abs) ? 0 : 2
  const body = abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return `${v < 0 ? '-' : ''}$${body}`
}

export function fmtUsdSigned(v: number): string {
  const body = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${v < 0 ? '-' : '+'}$${body}`
}

export function fmtPctSigned(r: number): string {
  return pct2(r)
}

/** `12 m`, `1 h 55 m`, `2 d 2 h`. */
export function fmtDurationShort(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${minutes} m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h ${String(minutes % 60).padStart(2, '0')} m`
  const days = Math.floor(hours / 24)
  return `${days} d ${hours % 24} h`
}

/* ---------- labels ---------- */

export function returnLabel(r: number): string {
  const a = Math.abs(r)
  if (a < 0.0015) return 'essentially flat'
  const dir = r > 0 ? 'up' : 'down'
  if (a < 0.0075) return `slightly ${dir}`
  if (a < 0.02) return `${dir} noticeably`
  return `${dir} sharply`
}

export function smaLabel(gap: number): string {
  const a = Math.abs(gap)
  if (a < 0.0025) return 'at its 20-bar average'
  const dir = gap > 0 ? 'above' : 'below'
  if (a < 0.01) return `slightly ${dir}`
  return `well ${dir}`
}

export function rsiLabel(v: number): string {
  if (v < 30) return 'oversold'
  if (v < 45) return 'weak'
  if (v <= 55) return 'neutral'
  if (v <= 70) return 'strong'
  return 'overbought'
}

export function volLabel(v: number): string {
  if (v < 0.7) return 'calmer than earlier'
  if (v <= 1.5) return 'similar to earlier'
  if (v <= 2.5) return 'more volatile than earlier'
  return 'much more volatile, spiking'
}

export function rangeLabel(p: number): string {
  if (p < 0.2) return "near the day's low"
  if (p < 0.4) return "in the lower part of the day's range"
  if (p <= 0.6) return 'mid-range'
  if (p <= 0.8) return "in the upper part of the day's range"
  return "near the day's high"
}

export function volumeLabel(v: number): string {
  if (v < 0.5) return 'light'
  if (v <= 1.5) return 'normal'
  if (v <= 3) return 'elevated'
  return 'very heavy'
}

export function plLabel(pl: number): string {
  if (pl < -0.02) return 'sizable loss'
  if (pl < -0.005) return 'small loss'
  if (pl <= 0.005) return 'about flat'
  if (pl <= 0.02) return 'small gain'
  return 'sizable gain'
}

/* ---------- sentences ---------- */

export function returnFact(minutes: number, r: number): string {
  return `Over the last ${minutes} minutes the price moved ${pct2(r)} (${returnLabel(r)}).`
}

export function returnUnavailableFact(minutes: number, availableMinutes: number): string {
  return `Only ${availableMinutes} minutes of bars are available; the ${minutes}-minute change cannot be computed.`
}

export function smaFact(gap: number): string {
  const label = smaLabel(gap)
  if (label === 'at its 20-bar average') return 'Price is at its 20-bar simple moving average.'
  const dir = gap > 0 ? 'above' : 'below'
  return `Price is ${pct1abs(gap)} ${dir} its 20-bar simple moving average (${label}).`
}

export function rsiFact(v: number): string {
  return `RSI-14 is ${Math.round(v)} (${rsiLabel(v)}).`
}

export function volFact(ratio: number): string {
  return `Volatility over the last 15 bars is ${ratio.toFixed(1)}x the earlier volatility (${volLabel(ratio)}).`
}

export function volumeFact(ratio: number): string {
  return `Volume in the last 5 bars is ${ratio.toFixed(1)}x the average of the earlier bars (${volumeLabel(ratio)}).`
}

export function rangeFact(pos: number, low: number, high: number): string {
  return `Price sits at ${Math.round(pos * 100)}% of today's range between ${price2(low)} and ${price2(high)} (${rangeLabel(pos)}).`
}

const STALE_AFTER_MS = 10 * 60_000

export function stalenessFact(ageMs: number | null): string | null {
  if (ageMs === null || ageMs <= STALE_AFTER_MS) return null
  return `Data is stale: the newest bar is ${Math.round(ageMs / 60_000)} minutes old.`
}
