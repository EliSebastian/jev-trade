import { applyTifDefault, placeOrderSchema } from '#shared/utils/order-schema'
import { getAlpaca } from '../utils/alpaca'
import { findAsset } from '../utils/assets'
import { withAlpaca } from '../utils/errors'
import { toOrderDto } from '../utils/normalize'
import { placeOrder } from '../utils/order-builder'

export default defineEventHandler(async (event) => {
  const parsed = placeOrderSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Invalid order',
      data: { issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) }
    })
  }

  const input = applyTifDefault(parsed.data)
  const asset = await findAsset(input.symbol)
  if (!asset.tradable) {
    throw createError({ statusCode: 422, statusMessage: `${asset.symbol} is not tradable on Alpaca` })
  }
  if (input.qty !== undefined && !Number.isInteger(input.qty) && !asset.fractionable) {
    throw createError({ statusCode: 422, statusMessage: `${asset.symbol} does not support fractional quantities` })
  }
  if (input.qty !== undefined && asset.minOrderSize && input.qty < asset.minOrderSize) {
    throw createError({ statusCode: 422, statusMessage: `Minimum order size for ${asset.symbol} is ${asset.minOrderSize}` })
  }

  const order = await withAlpaca(() => placeOrder(getAlpaca().trading.orders, { ...input, symbol: asset.symbol }))
  setResponseStatus(event, 201)
  return toOrderDto(order)
})
