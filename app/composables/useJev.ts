import type { JevDecisionDto, JevMessage, JevStateDto } from '#shared/types/jev'

const LOG_CAP = 300

/** Engine state and decision log, kept live by the WebSocket `jev` frames. */
export function useJev() {
  const state = useState<JevStateDto | null>('jev-state', () => null)
  const decisions = useState<JevDecisionDto[]>('jev-decisions', () => [])
  const loaded = useState<boolean>('jev-loaded', () => false)
  const asking = useState<string[]>('jev-asking', () => [])
  const switching = useState<boolean>('jev-switching', () => false)
  const toast = useToast()

  /** Latest decision per symbol, for row badges. */
  const latest = computed(() => {
    const out: Record<string, JevDecisionDto> = {}
    for (const d of decisions.value) out[d.symbol] ??= d
    return out
  })

  const available = computed(() => state.value?.available ?? false)
  const auto = computed(() => state.value?.auto ?? false)

  async function refresh() {
    try {
      const [s, list] = await Promise.all([
        $fetch<JevStateDto>('/api/jev/state'),
        $fetch<JevDecisionDto[]>('/api/jev/decisions', { query: { limit: LOG_CAP } })
      ])
      state.value = s
      decisions.value = list
      loaded.value = true
    } catch {
      // keep what we have; the account alert already explains missing keys
    }
  }

  function applyMessage(msg: JevMessage) {
    if (msg.event === 'state') {
      state.value = msg.state
      return
    }
    const d = msg.decision
    decisions.value = [d, ...decisions.value.filter(x => x.id !== d.id)].slice(0, LOG_CAP)
  }

  async function setAuto(on: boolean) {
    if (switching.value) return
    switching.value = true
    try {
      state.value = await $fetch<JevStateDto>('/api/jev/state', { method: 'PATCH', body: { auto: on } })
      toast.add({ title: on ? 'Jev auto-trading ON' : 'Jev auto-trading OFF', color: on ? 'primary' : 'neutral' })
    } catch (err) {
      toast.add({ title: 'Could not change the Jev switch', description: errorMessage(err), color: 'error' })
    } finally {
      switching.value = false
    }
  }

  async function ask(symbol: string) {
    if (asking.value.includes(symbol)) return
    asking.value = [...asking.value, symbol]
    try {
      const d = await $fetch<JevDecisionDto>('/api/jev/evaluate', { method: 'POST', body: { symbol } })
      applyMessage({ type: 'jev', event: 'decision', decision: d })
    } catch (err) {
      toast.add({ title: `Jev could not evaluate ${symbol}`, description: errorMessage(err), color: 'error' })
    } finally {
      asking.value = asking.value.filter(s => s !== symbol)
    }
  }

  /** Mirror the browser watchlist so the engine keeps running with the tab closed. */
  async function syncWatchlist(symbols: string[]) {
    try {
      state.value = await $fetch<JevStateDto>('/api/jev/watchlist', { method: 'PUT', body: { symbols } })
    } catch {
      // engine not running (no keys); nothing to sync
    }
  }

  return { state, decisions, latest, loaded, available, auto, asking, switching, refresh, applyMessage, setAuto, ask, syncWatchlist }
}
