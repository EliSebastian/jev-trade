import type { OrderDto } from '#shared/types/trading'
import { isOpenOrderStatus, isTerminalStatus } from '#shared/utils/order-status'

export function useOrders() {
  const orders = useState<Record<string, OrderDto>>('orders', () => ({}))
  const loaded = useState<boolean>('orders-loaded', () => false)
  const cancelling = useState<string[]>('orders-cancelling', () => [])
  const toast = useToast()

  async function refresh() {
    try {
      const list = await $fetch<OrderDto[]>('/api/orders', { query: { status: 'all', limit: 100 } })
      const next: Record<string, OrderDto> = {}
      for (const o of list) next[o.id] = { ...o, lastEvent: orders.value[o.id]?.lastEvent }
      orders.value = next
      loaded.value = true
    } catch {
      // keep what we have
    }
  }

  /** Upsert from the trade_updates stream (or a POST response). Never regress a finished order. */
  function applyUpdate(msg: { event: string, order: OrderDto }) {
    const prev = orders.value[msg.order.id]
    if (prev && isTerminalStatus(prev.status) && !isTerminalStatus(msg.order.status)) return
    orders.value = { ...orders.value, [msg.order.id]: { ...prev, ...msg.order, lastEvent: msg.event } }
  }

  const list = computed(() => Object.values(orders.value).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  const open = computed(() => list.value.filter(o => isOpenOrderStatus(o.status)))

  async function cancel(id: string) {
    if (cancelling.value.includes(id)) return
    cancelling.value = [...cancelling.value, id]
    try {
      await $fetch(`/api/orders/${encodeURIComponent(id)}`, { method: 'DELETE' })
      toast.add({ title: 'Cancel requested', color: 'neutral' })
    } catch (err) {
      toast.add({ title: 'Could not cancel order', description: errorMessage(err), color: 'error' })
    } finally {
      cancelling.value = cancelling.value.filter(x => x !== id)
    }
  }

  return { orders, list, open, loaded, cancelling, refresh, applyUpdate, cancel }
}
