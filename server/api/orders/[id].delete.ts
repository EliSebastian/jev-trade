import { getAlpaca } from '../../utils/alpaca'
import { withAlpaca } from '../../utils/errors'

export default defineEventHandler(async (event) => {
  const orderId = getRouterParam(event, 'id')
  if (!orderId) throw createError({ statusCode: 400, statusMessage: 'Order id is required' })
  await withAlpaca(() => getAlpaca().trading.orders.deleteOrderByOrderID({ orderId }))
  return { id: orderId, status: 'pending_cancel' }
})
