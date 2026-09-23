import { z } from 'zod'
import type { TimeInForce } from '#shared/types/trading'
import { isCryptoSymbol, normalizeSymbol } from '#shared/utils/symbols'

const amount = z.number({ message: 'Enter a number' }).positive('Must be greater than zero')

export const placeOrderSchema = z
  .object({
    symbol: z.string({ message: 'Symbol is required' }).trim().min(1, 'Symbol is required').transform(normalizeSymbol),
    side: z.enum(['buy', 'sell']),
    type: z.enum(['market', 'limit', 'stop', 'stop_limit']),
    qty: amount.optional(),
    notional: amount.optional(),
    limitPrice: amount.optional(),
    stopPrice: amount.optional(),
    timeInForce: z.enum(['day', 'gtc']).optional(),
    clientOrderId: z.string().max(128).optional()
  })
  .superRefine((v, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })

    const hasQty = v.qty !== undefined
    const hasNotional = v.notional !== undefined
    if (hasQty && hasNotional) add('notional', 'Use either a quantity or a dollar amount, not both')
    if (!hasQty && !hasNotional) add('qty', 'Enter a quantity or a dollar amount')
    if (hasNotional && v.type !== 'market') add('notional', 'Dollar amounts are only allowed on market orders')

    const needsLimit = v.type === 'limit' || v.type === 'stop_limit'
    const needsStop = v.type === 'stop' || v.type === 'stop_limit'
    if (needsLimit && v.limitPrice === undefined) add('limitPrice', 'Limit price is required')
    if (needsStop && v.stopPrice === undefined) add('stopPrice', 'Stop price is required')
    if (!needsLimit && v.limitPrice !== undefined) add('limitPrice', `${labelFor(v.type)} orders cannot have a limit price`)
    if (!needsStop && v.stopPrice !== undefined) add('stopPrice', `${labelFor(v.type)} orders cannot have a stop price`)

    const crypto = isCryptoSymbol(v.symbol)
    if (crypto && v.timeInForce !== undefined && v.timeInForce !== 'gtc') {
      add('timeInForce', 'Crypto orders must be good till canceled')
    }
    if (!crypto && hasQty && v.type !== 'market' && !Number.isInteger(v.qty)) {
      add('qty', 'Fractional quantity requires a market order')
    }
  })

function labelFor(type: string): string {
  return type === 'stop_limit' ? 'Stop-limit' : type.charAt(0).toUpperCase() + type.slice(1)
}

export type PlaceOrderInput = z.input<typeof placeOrderSchema>
export type PlaceOrder = z.output<typeof placeOrderSchema>

export function applyTifDefault<T extends { symbol: string, timeInForce?: TimeInForce }>(v: T): T & { timeInForce: TimeInForce } {
  return { ...v, timeInForce: v.timeInForce ?? (isCryptoSymbol(v.symbol) ? 'gtc' : 'day') }
}
