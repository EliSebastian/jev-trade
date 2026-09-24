import { normalizeSymbol } from '#shared/utils/symbols'
import { getJevEngine } from '../../utils/jev/engine'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

/** Newest first. `?symbol=AAPL&limit=50` */
export default defineEventHandler((event) => {
  const engine = getJevEngine()
  if (!engine) return []
  const q = getQuery(event)
  const symbol = normalizeSymbol(typeof q.symbol === 'string' ? q.symbol : '') || undefined
  const parsed = Number(q.limit)
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), MAX_LIMIT) : DEFAULT_LIMIT
  return engine.decisions({ symbol, limit })
})
