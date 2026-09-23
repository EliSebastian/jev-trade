import type { AssetDto } from '#shared/types/trading'
import { normalizeSymbol, toPathSymbol } from '#shared/utils/symbols'

export const WATCHLIST_DEFAULTS = ['AAPL', 'MSFT', 'TSLA', 'SPY', 'BTC/USD', 'ETH/USD']
const STORAGE_KEY = 'jev.watchlist.v1'

export function useWatchlist() {
  const symbols = useState<string[]>('watchlist', () => [...WATCHLIST_DEFAULTS])
  const loaded = useState<boolean>('watchlist-loaded', () => false)
  const adding = useState<boolean>('watchlist-adding', () => false)
  const toast = useToast()
  const { seed } = useQuotes()

  /** Read the persisted list once and keep localStorage in sync afterwards. */
  function load() {
    if (loaded.value || !import.meta.client) return
    loaded.value = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) symbols.value = parsed.filter((s): s is string => typeof s === 'string')
      }
    } catch {
      // storage unavailable: defaults stay
    }
    watch(symbols, (value) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch {
        // ignore quota / private mode
      }
    }, { deep: true })
  }

  async function add(raw: string): Promise<boolean> {
    const symbol = normalizeSymbol(raw)
    if (!symbol) return false
    if (symbols.value.includes(symbol)) {
      toast.add({ title: `${symbol} is already on the watchlist`, color: 'neutral' })
      return false
    }
    adding.value = true
    try {
      const asset = await $fetch<AssetDto>(`/api/assets/${encodeURIComponent(toPathSymbol(symbol))}`)
      if (symbols.value.includes(asset.symbol)) {
        toast.add({ title: `${asset.symbol} is already on the watchlist`, color: 'neutral' })
        return false
      }
      symbols.value = [...symbols.value, asset.symbol]
      seed([asset.symbol]).catch(() => {})
      return true
    } catch (err) {
      toast.add({ title: `Cannot add ${symbol}`, description: errorMessage(err), color: 'error' })
      return false
    } finally {
      adding.value = false
    }
  }

  function remove(symbol: string) {
    symbols.value = symbols.value.filter(s => s !== symbol)
  }

  return { symbols, adding, load, add, remove }
}
