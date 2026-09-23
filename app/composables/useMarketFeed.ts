import { useDebounceFn, useWebSocket } from '@vueuse/core'
import type { ServerMessage, StreamName, StreamStatus } from '#shared/types/trading'

let started = false

/** One WebSocket per tab. Call `connect()` once from the page setup. */
export function useMarketFeed() {
  const streams = useState<Record<StreamName, StreamStatus>>('feed-status', () => ({ stocks: 'idle', crypto: 'idle', trading: 'idle' }))
  const socket = useState<'CONNECTING' | 'OPEN' | 'CLOSED'>('feed-socket', () => 'CLOSED')
  const lastError = useState<string | null>('feed-error', () => null)

  function connect() {
    if (started || !import.meta.client) return
    started = true

    // Composables need the Nuxt context, which is gone inside socket callbacks: capture them now.
    const quotes = useQuotes()
    const orders = useOrders()
    const account = useAccount()
    const positions = usePositions()
    const watchlist = useWatchlist()
    const toast = useToast()

    const refreshAfterFill = useDebounceFn(() => {
      account.refresh()
      positions.refresh()
    }, 300)

    const desired = computed(() => [...new Set([...watchlist.symbols.value, ...positions.symbols.value])])
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

    const { status, send } = useWebSocket(url, {
      autoReconnect: { retries: -1, delay: 1000 },
      heartbeat: { message: '{"type":"ping"}', responseMessage: '{"type":"pong"}', interval: 25_000, pongTimeout: 10_000 },
      onConnected() {
        if (desired.value.length) send(JSON.stringify({ type: 'subscribe', symbols: desired.value }))
      },
      onMessage(_ws, event) {
        let msg: ServerMessage
        try {
          msg = JSON.parse(String(event.data))
        } catch {
          return
        }
        dispatch(msg)
      }
    })

    watch(status, s => (socket.value = s), { immediate: true })

    watch(desired, (next, prev) => {
      if (status.value !== 'OPEN') return
      const added = next.filter(s => !prev.includes(s))
      const removed = prev.filter(s => !next.includes(s))
      if (added.length) send(JSON.stringify({ type: 'subscribe', symbols: added }))
      if (removed.length) send(JSON.stringify({ type: 'unsubscribe', symbols: removed }))
    })

    function dispatch(msg: ServerMessage) {
      switch (msg.type) {
        case 'tick':
          quotes.applyTick(msg)
          break
        case 'order': {
          orders.applyUpdate(msg)
          const o = msg.order
          const label = `${o.side.toUpperCase()} ${o.qty ?? ''} ${o.symbol}`.replace(/\s+/g, ' ')
          if (msg.event === 'fill' || msg.event === 'partial_fill') {
            refreshAfterFill()
            toast.add({
              title: msg.event === 'fill' ? 'Filled' : 'Partially filled',
              description: `${label} @ ${fmtPrice(o.filledAvgPrice)}`,
              color: o.side === 'buy' ? 'gain' : 'loss'
            })
          } else if (msg.event === 'rejected') {
            toast.add({ title: 'Order rejected', description: label, color: 'error' })
          } else if (msg.event === 'canceled' || msg.event === 'expired') {
            toast.add({ title: msg.event === 'canceled' ? 'Order canceled' : 'Order expired', description: label, color: 'neutral' })
          }
          break
        }
        case 'status':
          streams.value = msg.streams
          break
        case 'error':
          lastError.value = msg.message
          toast.add({ title: 'Stream error', description: msg.message, color: 'error' })
          break
        case 'pong':
          break
      }
    }
  }

  return { connect, streams, socket, lastError }
}
