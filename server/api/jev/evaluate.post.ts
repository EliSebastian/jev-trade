import { jevEvaluateSchema } from '#shared/utils/jev-schema'
import { getJevEngine } from '../../utils/jev/engine'

/** "Ask Jev" now. Rails still apply; 409 while the symbol is already being evaluated. */
export default defineEventHandler(async (event) => {
  const engine = getJevEngine()
  if (!engine) throw createError({ statusCode: 503, statusMessage: 'Jev engine is not running (Alpaca keys not configured)' })
  const { symbol } = await readValidatedBody(event, jevEvaluateSchema.parse)
  return engine.evaluate(symbol, 'manual')
})
