import { jevAutoSchema } from '#shared/utils/jev-schema'
import { getJevEngine } from '../../utils/jev/engine'

/** Flip the auto-trade switch. */
export default defineEventHandler(async (event) => {
  const engine = getJevEngine()
  if (!engine) throw createError({ statusCode: 503, statusMessage: 'Jev engine is not running (Alpaca keys not configured)' })
  const { auto } = await readValidatedBody(event, jevAutoSchema.parse)
  return engine.setAuto(auto)
})
