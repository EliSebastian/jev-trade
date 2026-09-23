import { createError, isError } from 'h3'
import type { AssetDto } from '#shared/types/trading'
import { normalizeSymbol, toPathSymbol } from '#shared/utils/symbols'
import { getAlpaca } from './alpaca'
import { withAlpaca } from './errors'
import { toAssetDto } from './normalize'

const TTL_MS = 10 * 60_000
const cache = new Map<string, { at: number, asset: AssetDto }>()

/** Look up an asset by symbol (any accepted spelling). 404 with a friendly message when unknown. */
export async function findAsset(symbol: string): Promise<AssetDto> {
  const canonical = normalizeSymbol(symbol)
  const key = toPathSymbol(canonical)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.asset

  try {
    const raw = await withAlpaca(() => getAlpaca().trading.assets.getV2AssetsSymbolOrAssetId({ symbolOrAssetId: key }))
    const asset = toAssetDto(raw)
    cache.set(key, { at: Date.now(), asset })
    return asset
  } catch (err) {
    if (isError(err) && err.statusCode === 404) {
      throw createError({ statusCode: 404, statusMessage: `Unknown symbol ${canonical || symbol}` })
    }
    throw err
  }
}
