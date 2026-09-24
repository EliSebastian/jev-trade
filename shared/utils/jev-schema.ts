import { z } from 'zod'
import { normalizeSymbol } from '#shared/utils/symbols'

const symbolList = z
  .array(z.string())
  .max(100)
  .transform(list => [...new Set(list.map(normalizeSymbol).filter(Boolean))])

/** Body of `PUT /api/jev/watchlist`. */
export const jevWatchlistSchema = z.object({ symbols: symbolList })

/** Body of `POST /api/jev/evaluate`. */
export const jevEvaluateSchema = z.object({
  symbol: z.string({ message: 'Symbol is required' }).transform(normalizeSymbol).refine(s => s.length > 0, 'Symbol is required')
})

/** Body of `PATCH /api/jev/state`. */
export const jevAutoSchema = z.object({ auto: z.boolean() })
