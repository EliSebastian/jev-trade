import { createError } from 'h3'
import type { OrderDto } from '#shared/types/trading'
import { normalizeSymbol, toPathSymbol } from '#shared/utils/symbols'
import { getAlpaca } from './alpaca'
import { withAlpaca } from './errors'
import { toOrderDto } from './normalize'
import type { RawOrder } from './normalize'

export interface PositionCloser {
  deleteOpenPosition(params: { symbolOrAssetId: string }): Promise<RawOrder>
}

export interface ClosePositionDeps {
  positions(): PositionCloser
}

const productionDeps = (): ClosePositionDeps => ({ positions: () => getAlpaca().trading.positions })

/** Close the whole position at market. Alpaca answers with the closing order. */
export async function closePosition(symbol: string, deps: ClosePositionDeps = productionDeps()): Promise<OrderDto> {
  const key = toPathSymbol(normalizeSymbol(symbol))
  if (!key) throw createError({ statusCode: 400, statusMessage: 'Symbol is required' })
  const order = await withAlpaca(() => deps.positions().deleteOpenPosition({ symbolOrAssetId: key }))
  return toOrderDto(order)
}
