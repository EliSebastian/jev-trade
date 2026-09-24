import type { AssetClass } from '#shared/types/trading'
import type { JevNewsItem, JevStateDto } from '#shared/types/jev'
import { resolveJevConfig } from '#shared/utils/jev-config'
import { toPathSymbol } from '#shared/utils/symbols'
import { getAlpaca } from '../alpaca'
import { withAlpaca } from '../errors'
import { alpacaMarketData, fetchMinuteBars, fetchSnapshots } from '../market-data'
import { num, toAccountDto, toClockDto, toPositionDto } from '../normalize'
import { submitOrder } from '../orders'
import { closePosition } from '../positions'
import { getStreamHub } from '../stream-hub'
import { createJevEngine } from './engine'
import type { BrokerAdapter, JevEngine, MarketDataAdapter, NewsAdapter } from './engine'
import type { JevStorage } from './decision-log'
import { createGatewayModel, createJevOracle } from './oracle'

/**
 * Production wiring: the only Jev module that touches Nitro auto-imports and the live Alpaca client.
 * Everything it hands to the engine is an adapter the tests replace with fakes.
 */

const DAY = 86_400_000
const BARS = 90

const broker: BrokerAdapter = {
  account: () => withAlpaca(async () => toAccountDto(await getAlpaca().trading.account.getAccount())),
  positions: () => withAlpaca(async () => (await getAlpaca().trading.positions.getAllOpenPositions()).map(toPositionDto)),
  clock: () => withAlpaca(async () => toClockDto(await getAlpaca().trading.clock.legacyClock())),
  buyNotional: (symbol, notionalUsd, clientOrderId) =>
    submitOrder({ symbol, side: 'buy', type: 'market', notional: notionalUsd, clientOrderId }),
  closePosition: symbol => closePosition(symbol)
}

const market: MarketDataAdapter = {
  async minuteBars(symbol, assetClass) {
    const bars = await withAlpaca(() =>
      fetchMinuteBars(alpacaMarketData(), [symbol], assetClass, { limit: BARS, sinceMs: assetClass === 'crypto' ? DAY : 3 * DAY })
    )
    return bars[symbol] ?? []
  },
  async daySnapshot(symbol, assetClass) {
    const snap = (await withAlpaca(() => fetchSnapshots(alpacaMarketData(), [symbol], assetClass)))[symbol]
    const high = num(snap?.dailyBar?.h)
    const low = num(snap?.dailyBar?.l)
    const lastPrice = num(snap?.latestTrade?.p)
    if (high === null || low === null) return lastPrice === null ? null : { high: lastPrice, low: lastPrice, lastPrice }
    return { high, low, lastPrice }
  }
}

const news: NewsAdapter = {
  async recent(symbol, since, limit) {
    const resp = await getAlpaca().marketData.news.news({
      symbols: toPathSymbol(symbol),
      start: since,
      limit,
      excludeContentless: true
    })
    return (resp?.news ?? []).map<JevNewsItem>(n => ({
      headline: n.headline ?? '',
      summary: n.summary ?? '',
      source: n.source ?? '',
      createdAt: new Date(n.createdAt).toISOString(),
      url: n.url ?? null
    }))
  }
}

function nitroStorage(): JevStorage {
  const store = useStorage('jev')
  return {
    get: key => store.getItem(key) as Promise<never>,
    set: (key, value) => store.setItem(key, value as never)
  }
}

export function jevConfigFromRuntime() {
  return resolveJevConfig(useRuntimeConfig().jev)
}

/** What the API answers when the engine never started (no Alpaca keys). */
export function unavailableState(): JevStateDto {
  return {
    available: false,
    aiConfigured: Boolean(useRuntimeConfig().aiGatewayApiKey),
    auto: false,
    status: 'disabled',
    haltedUntil: null,
    haltReason: null,
    watchlist: [],
    universe: [],
    evaluating: [],
    cooldowns: {},
    nextDueAt: {},
    openPositions: 0,
    dayPl: null,
    marketOpen: null,
    config: jevConfigFromRuntime(),
    lastError: 'Alpaca keys not configured'
  }
}

export function createProductionJevEngine(): JevEngine {
  const { aiGatewayApiKey } = useRuntimeConfig()
  const oracle = aiGatewayApiKey ? createJevOracle({ model: createGatewayModel(aiGatewayApiKey) }) : null
  return createJevEngine({
    broker,
    market,
    news,
    oracle,
    hub: getStreamHub(),
    storage: nitroStorage(),
    config: jevConfigFromRuntime(),
    log: console
  })
}
