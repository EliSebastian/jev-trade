import { createError } from 'h3'
import type { AssetDto, OrderDto } from '#shared/types/trading'
import { applyTifDefault, placeOrderSchema } from '#shared/utils/order-schema'
import { getAlpaca } from './alpaca'
import { findAsset } from './assets'
import { withAlpaca } from './errors'
import { toOrderDto } from './normalize'
import { placeOrder } from './order-builder'
import type { OrderBuilders } from './order-builder'

export interface SubmitOrderDeps {
  findAsset(symbol: string): Promise<AssetDto>
  orders(): OrderBuilders
}

const productionDeps = (): SubmitOrderDeps => ({ findAsset, orders: () => getAlpaca().trading.orders })

/**
 * Validate an order body, check the asset, and send it to Alpaca.
 * Shared by the REST route and the Jev engine so both obey the same rules.
 * Throws h3 errors: 400 (schema, with `data.issues`), 422 (asset rules), or whatever Alpaca answered.
 */
export async function submitOrder(body: unknown, deps: SubmitOrderDeps = productionDeps()): Promise<OrderDto> {
  const parsed = placeOrderSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Invalid order',
      data: { issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) }
    })
  }

  const input = applyTifDefault(parsed.data)
  const asset = await deps.findAsset(input.symbol)
  if (!asset.tradable) {
    throw createError({ statusCode: 422, statusMessage: `${asset.symbol} is not tradable on Alpaca` })
  }
  if (input.qty !== undefined && !Number.isInteger(input.qty) && !asset.fractionable) {
    throw createError({ statusCode: 422, statusMessage: `${asset.symbol} does not support fractional quantities` })
  }
  if (input.qty !== undefined && asset.minOrderSize && input.qty < asset.minOrderSize) {
    throw createError({ statusCode: 422, statusMessage: `Minimum order size for ${asset.symbol} is ${asset.minOrderSize}` })
  }

  const order = await withAlpaca(() => placeOrder(deps.orders(), { ...input, symbol: asset.symbol }))
  return toOrderDto(order)
}
