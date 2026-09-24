import { jevWatchlistSchema } from '#shared/utils/jev-schema'
import { getJevEngine } from '../../utils/jev/engine'

/** The browser owns the watchlist; it mirrors it here so the engine can run headless. */
export default defineEventHandler(async (event) => {
  const engine = getJevEngine()
  if (!engine) throw createError({ statusCode: 503, statusMessage: 'Jev engine is not running (Alpaca keys not configured)' })
  const { symbols } = await readValidatedBody(event, jevWatchlistSchema.parse)
  return engine.setWatchlist(symbols)
})
