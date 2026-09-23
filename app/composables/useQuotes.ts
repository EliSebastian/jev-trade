import type { AssetClass, SeedDto, TickMessage } from '#shared/types/trading'
import { classifySymbol } from '#shared/utils/symbols'

export interface Quote {
  symbol: string
  assetClass: AssetClass
  price: number | null
  prevPrice: number | null
  ts: string | null
  /** Previous session close (stocks) or 24h-ago close (crypto); basis for the change column. */
  prevClose: number | null
  closes: number[]
  lastMinute: number | null
  flashAt: number
  flashDir: 'up' | 'down' | null
  seeded: boolean
}

const RING = 120

function blank(symbol: string, assetClass?: AssetClass): Quote {
  return {
    symbol,
    assetClass: assetClass ?? classifySymbol(symbol),
    price: null,
    prevPrice: null,
    ts: null,
    prevClose: null,
    closes: [],
    lastMinute: null,
    flashAt: 0,
    flashDir: null,
    seeded: false
  }
}

export function useQuotes() {
  const quotes = useState<Record<string, Quote>>('quotes', () => ({}))

  function ensure(symbol: string, assetClass?: AssetClass): Quote {
    return quotes.value[symbol] ?? blank(symbol, assetClass)
  }

  function applySeed(seed: SeedDto) {
    const q = ensure(seed.symbol, seed.assetClass)
    quotes.value = {
      ...quotes.value,
      [seed.symbol]: {
        ...q,
        closes: seed.closes.slice(-RING),
        price: q.price ?? seed.lastPrice,
        ts: q.ts ?? seed.lastTs,
        prevClose: seed.prevClose,
        seeded: true
      }
    }
  }

  async function seed(symbols: string[]) {
    const missing = symbols.filter(s => !quotes.value[s]?.seeded)
    if (!missing.length) return
    const data = await $fetch<Record<string, SeedDto>>('/api/market/seed', { query: { symbols: missing.join(',') } })
    for (const s of Object.values(data)) applySeed(s)
  }

  function applyTick(tick: TickMessage) {
    const q = ensure(tick.symbol, tick.assetClass)
    const prev = q.price
    const dir = prev === null || tick.price === prev ? null : tick.price > prev ? 'up' : 'down'
    const minute = Math.floor(new Date(tick.ts).getTime() / 60_000)
    const closes = q.lastMinute === minute && q.closes.length
      ? [...q.closes.slice(0, -1), tick.price]
      : [...q.closes, tick.price].slice(-RING)
    quotes.value = {
      ...quotes.value,
      [tick.symbol]: {
        ...q,
        price: tick.price,
        prevPrice: prev,
        ts: tick.ts,
        closes,
        lastMinute: minute,
        flashAt: dir ? Date.now() : q.flashAt,
        flashDir: dir ?? q.flashDir
      }
    }
  }

  /** Change versus previous close as a ratio, or null when unknown. */
  function changeOf(q: Quote | undefined): number | null {
    if (!q || q.price === null || !q.prevClose) return null
    return (q.price - q.prevClose) / q.prevClose
  }

  return { quotes, ensure, seed, applyTick, changeOf }
}
