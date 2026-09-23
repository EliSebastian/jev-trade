import { normalizeSymbol, toPathSymbol } from '#shared/utils/symbols'
import { getAlpaca } from '../../utils/alpaca'
import { withAlpaca } from '../../utils/errors'
import { toOrderDto } from '../../utils/normalize'

/** Close the whole position at market. Alpaca answers with the closing order. */
export default defineEventHandler(async (event) => {
  const symbol = toPathSymbol(normalizeSymbol(getRouterParam(event, 'symbol') ?? ''))
  if (!symbol) throw createError({ statusCode: 400, statusMessage: 'Symbol is required' })
  const order = await withAlpaca(() => getAlpaca().trading.positions.deleteOpenPosition({ symbolOrAssetId: symbol }))
  return toOrderDto(order)
})
