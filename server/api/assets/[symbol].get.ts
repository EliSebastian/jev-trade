import { findAsset } from '../../utils/assets'

/** Validates a watchlist candidate. 404 when unknown, 422 when Alpaca will not trade it. */
export default defineEventHandler(async (event) => {
  const asset = await findAsset(getRouterParam(event, 'symbol') ?? '')
  if (!asset.tradable || asset.status !== 'active') {
    throw createError({ statusCode: 422, statusMessage: `${asset.symbol} is not tradable on Alpaca` })
  }
  return asset
})
