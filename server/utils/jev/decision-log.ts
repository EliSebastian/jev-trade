import type { JevDecisionDto } from '#shared/types/jev'

/** The slice of Nitro's storage the engine needs; tests use an in-memory map. */
export interface JevStorage {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<void>
}

export interface DecisionLog {
  load(): Promise<void>
  append(decision: JevDecisionDto): Promise<void>
  /** Newest first. */
  list(opts?: { symbol?: string, limit?: number }): JevDecisionDto[]
  latestBySymbol(): Record<string, JevDecisionDto>
  size(): number
  /** Decisions whose New York calendar day matches `nowMs`. */
  countOnDay(nowMs: number): number
}

const KEY = 'decisions'
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
const dayOf = (ms: number) => dayFmt.format(new Date(ms))

const looksLikeDecision = (v: unknown): v is JevDecisionDto =>
  typeof v === 'object' && v !== null && typeof (v as JevDecisionDto).id === 'string' && typeof (v as JevDecisionDto).symbol === 'string'

/** Capped, persisted, append-only log kept oldest-first in memory. */
export function createDecisionLog(opts: { storage: JevStorage, cap: number, key?: string }): DecisionLog {
  const key = opts.key ?? KEY
  const cap = Math.max(1, Math.floor(opts.cap))
  let entries: JevDecisionDto[] = []

  return {
    async load() {
      const raw = await opts.storage.get<unknown>(key)
      entries = Array.isArray(raw) ? raw.filter(looksLikeDecision).slice(-cap) : []
    },
    async append(decision) {
      entries.push(decision)
      if (entries.length > cap) entries = entries.slice(-cap)
      await opts.storage.set(key, entries)
    },
    list({ symbol, limit } = {}) {
      let out = [...entries].reverse()
      if (symbol) out = out.filter(d => d.symbol === symbol)
      if (limit !== undefined) out = out.slice(0, Math.max(0, limit))
      return out
    },
    latestBySymbol() {
      const out: Record<string, JevDecisionDto> = {}
      for (const d of entries) out[d.symbol] = d
      return out
    },
    size: () => entries.length,
    countOnDay(nowMs) {
      const today = dayOf(nowMs)
      return entries.filter(d => dayOf(Date.parse(d.ts)) === today).length
    }
  }
}
