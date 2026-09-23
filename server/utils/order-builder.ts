import type { OrdersApi } from '@alpacahq/alpaca-trade-api'
import type { TimeInForce } from '#shared/types/trading'
import type { PlaceOrder } from '#shared/utils/order-schema'

export type OrderBuilders = Pick<OrdersApi, 'market' | 'limit' | 'stop' | 'stopLimit'>
export type ValidatedOrder = PlaceOrder & { timeInForce: TimeInForce }

/** Map a validated order onto exactly one of the SDK's typed order builders. */
export function placeOrder(orders: OrderBuilders, input: ValidatedOrder) {
  const common = {
    symbol: input.symbol,
    side: input.side,
    timeInForce: input.timeInForce,
    ...(input.clientOrderId ? { clientOrderId: input.clientOrderId } : {})
  }

  switch (input.type) {
    case 'market':
      return input.notional !== undefined
        ? orders.market({ ...common, notional: input.notional })
        : orders.market({ ...common, qty: input.qty as number })
    case 'limit':
      return orders.limit({ ...common, qty: input.qty as number, limitPrice: input.limitPrice as number })
    case 'stop':
      return orders.stop({ ...common, qty: input.qty as number, stopPrice: input.stopPrice as number })
    case 'stop_limit':
      return orders.stopLimit({
        ...common,
        qty: input.qty as number,
        stopPrice: input.stopPrice as number,
        limitPrice: input.limitPrice as number
      })
  }
}
