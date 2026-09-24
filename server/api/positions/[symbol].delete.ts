import { closePosition } from '../../utils/positions'

/** Close the whole position at market. Alpaca answers with the closing order. */
export default defineEventHandler(event => closePosition(getRouterParam(event, 'symbol') ?? ''))
