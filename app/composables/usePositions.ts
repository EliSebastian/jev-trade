import type { PositionDto } from '#shared/types/trading'
import { toPathSymbol } from '#shared/utils/symbols'

export function usePositions() {
  const positions = useState<PositionDto[]>('positions', () => [])
  const loaded = useState<boolean>('positions-loaded', () => false)
  const closing = useState<string[]>('positions-closing', () => [])
  const { quotes } = useQuotes()
  const toast = useToast()

  async function refresh() {
    try {
      positions.value = await $fetch<PositionDto[]>('/api/positions')
      loaded.value = true
    } catch {
      // keep the last snapshot
    }
  }

  /** Positions re-priced with the latest tick; Alpaca's numbers win again after each REST refresh. */
  const live = computed(() =>
    positions.value.map((p) => {
      const last = quotes.value[p.symbol]?.price ?? p.currentPrice
      const unrealizedPl = (last - p.avgEntryPrice) * p.qty
      const basis = Math.abs(p.costBasis)
      return {
        ...p,
        currentPrice: last,
        marketValue: last * p.qty,
        unrealizedPl,
        unrealizedPlpc: basis ? unrealizedPl / basis : 0
      }
    })
  )

  const symbols = computed(() => positions.value.map(p => p.symbol))

  async function close(symbol: string) {
    if (closing.value.includes(symbol)) return
    closing.value = [...closing.value, symbol]
    try {
      await $fetch(`/api/positions/${encodeURIComponent(toPathSymbol(symbol))}`, { method: 'DELETE' })
      toast.add({ title: `Closing ${symbol}`, description: 'Market order submitted', color: 'neutral' })
    } catch (err) {
      toast.add({ title: `Could not close ${symbol}`, description: errorMessage(err), color: 'error' })
    } finally {
      closing.value = closing.value.filter(s => s !== symbol)
      refresh()
    }
  }

  return { positions, live, symbols, loaded, closing, refresh, close }
}
