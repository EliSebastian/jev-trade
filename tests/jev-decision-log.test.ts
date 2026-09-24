import { describe, expect, it } from 'vitest'
import type { JevDecisionDto } from '#shared/types/jev'
import { createDecisionLog } from '~~/server/utils/jev/decision-log'
import type { JevStorage } from '~~/server/utils/jev/decision-log'

function memoryStorage(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial))
  const writes: { key: string, value: unknown }[] = []
  const storage: JevStorage = {
    async get<T>(key: string) { return (data.has(key) ? data.get(key) : null) as T | null },
    async set(key, value) {
      data.set(key, JSON.parse(JSON.stringify(value)))
      writes.push({ key, value })
    }
  }
  return { storage, data, writes }
}

let seq = 0
function decision(symbol: string, overrides: Partial<JevDecisionDto> = {}): JevDecisionDto {
  seq += 1
  return {
    id: `d${seq}`,
    ts: new Date(Date.parse('2026-09-23T18:00:00.000Z') + seq * 60_000).toISOString(),
    symbol,
    assetClass: symbol.includes('/') ? 'crypto' : 'us_equity',
    trigger: 'schedule',
    verdict: 'hold',
    probability: 0.7,
    probabilities: { buy: 0.3, hold: 0.7 },
    confidence: 0.4,
    trend: 2,
    newsTone: null,
    avoid: 0.1,
    action: 'skipped',
    skipReason: 'hold',
    orderId: null,
    error: null,
    price: 100,
    facts: { time: [], market: [], price: [], position: [], account: [] },
    news: [],
    ...overrides
  }
}

describe('createDecisionLog', () => {
  it('lists newest first and filters by symbol and limit', async () => {
    const { storage } = memoryStorage()
    const log = createDecisionLog({ storage, cap: 10 })
    await log.load()
    const a = decision('AAPL')
    const b = decision('BTC/USD')
    const c = decision('AAPL')
    await log.append(a)
    await log.append(b)
    await log.append(c)

    expect(log.list().map(d => d.id)).toEqual([c.id, b.id, a.id])
    expect(log.list({ symbol: 'AAPL' }).map(d => d.id)).toEqual([c.id, a.id])
    expect(log.list({ limit: 2 }).map(d => d.id)).toEqual([c.id, b.id])
    expect(log.size()).toBe(3)
  })

  it('keeps the latest decision per symbol', async () => {
    const { storage } = memoryStorage()
    const log = createDecisionLog({ storage, cap: 10 })
    await log.load()
    const first = decision('AAPL')
    const second = decision('AAPL', { verdict: 'buy' })
    const other = decision('ETH/USD')
    for (const d of [first, second, other]) await log.append(d)

    expect(log.latestBySymbol()).toEqual({ 'AAPL': second, 'ETH/USD': other })
  })

  it('drops the oldest entries beyond the cap', async () => {
    const { storage } = memoryStorage()
    const log = createDecisionLog({ storage, cap: 3 })
    await log.load()
    const ds = [decision('A'), decision('B'), decision('C'), decision('D')]
    for (const d of ds) await log.append(d)

    expect(log.list().map(d => d.id)).toEqual([ds[3]!.id, ds[2]!.id, ds[1]!.id])
    expect(log.size()).toBe(3)
  })

  it('persists every append and restores on load', async () => {
    const { storage, writes, data } = memoryStorage()
    const log = createDecisionLog({ storage, cap: 10 })
    await log.load()
    const d = decision('AAPL')
    await log.append(d)
    expect(writes).toEqual([{ key: 'decisions', value: [d] }])

    const reloaded = createDecisionLog({ storage, cap: 10 })
    await reloaded.load()
    expect(reloaded.list()).toEqual([d])
    expect(data.get('decisions')).toEqual([d])
  })

  it('starts empty when storage is missing or malformed', async () => {
    const empty = createDecisionLog({ storage: memoryStorage().storage, cap: 10 })
    await empty.load()
    expect(empty.list()).toEqual([])

    const bad = createDecisionLog({ storage: memoryStorage({ decisions: { not: 'a list' } }).storage, cap: 10 })
    await bad.load()
    expect(bad.list()).toEqual([])
  })

  it('counts decisions made today in New York time', async () => {
    const { storage } = memoryStorage()
    const log = createDecisionLog({ storage, cap: 10 })
    await log.load()
    await log.append(decision('AAPL', { ts: '2026-09-23T18:00:00.000Z' }))
    await log.append(decision('AAPL', { ts: '2026-09-22T18:00:00.000Z' }))
    await log.append(decision('AAPL', { ts: '2026-09-24T03:30:00.000Z' })) // still 23 Sep 23:30 ET

    expect(log.countOnDay(Date.parse('2026-09-23T20:00:00.000Z'))).toBe(2)
  })
})
