import { getAlpaca } from '../utils/alpaca'
import { withAlpaca } from '../utils/errors'
import { toOrderDto } from '../utils/normalize'

const STATUSES = new Set(['open', 'closed', 'all'])

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const status = STATUSES.has(String(query.status)) ? (String(query.status) as 'open' | 'closed' | 'all') : 'all'
  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500)
  const orders = await withAlpaca(() =>
    getAlpaca().trading.orders.getAllOrders({ status, limit, direction: 'desc', nested: false })
  )
  return orders.map(toOrderDto)
})
