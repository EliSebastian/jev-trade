<script setup lang="ts">
import type { OrderDto } from '#shared/types/trading'
import { isCancellableStatus, isTerminalStatus } from '#shared/utils/order-status'

const props = defineProps<{ order: OrderDto }>()
const { cancel, cancelling } = useOrders()

const isCancelling = computed(() => cancelling.value.includes(props.order.id))
const cancellable = computed(() => isCancellableStatus(props.order.status))
const statusClass = computed(() => {
  const s = props.order.status
  if (s === 'filled') return 'text-highlighted'
  if (s === 'rejected') return 'text-error'
  if (isTerminalStatus(s)) return 'text-dimmed'
  return 'text-primary'
})
const priceLabel = computed(() => {
  const o = props.order
  if (o.type === 'limit') return `@ ${fmtPrice(o.limitPrice)}`
  if (o.type === 'stop') return `stop ${fmtPrice(o.stopPrice)}`
  if (o.type === 'stop_limit') return `stop ${fmtPrice(o.stopPrice)} · lmt ${fmtPrice(o.limitPrice)}`
  return o.filledAvgPrice ? `@ ${fmtPrice(o.filledAvgPrice)}` : ''
})
const amount = computed(() => {
  const o = props.order
  return o.qty !== null ? fmtQty(o.qty) : o.notional !== null ? fmtMoney(o.notional) : ''
})
const fillLabel = computed(() => {
  const o = props.order
  if (o.status !== 'partially_filled' || o.qty === null) return statusLabel(o.status)
  return `${fmtQty(o.filledQty)}/${fmtQty(o.qty)} FILLED`
})
</script>

<template>
  <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-muted px-3 py-2">
    <div class="num w-16 text-[11px] text-dimmed">{{ fmtTime(order.createdAt) }}</div>

    <div class="min-w-0">
      <div class="flex items-baseline gap-2 text-[13px]">
        <span class="num font-semibold" :class="order.side === 'buy' ? 'text-gain' : 'text-loss'">{{ order.side.toUpperCase() }}</span>
        <span class="num text-highlighted">{{ amount }}</span>
        <span class="num truncate text-highlighted">{{ order.symbol }}</span>
        <span class="num text-[11px] text-muted">{{ orderTypeLabel(order.type) }} {{ priceLabel }}</span>
      </div>
      <div class="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em]">
        <span :class="statusClass">{{ fillLabel }}</span>
        <span v-if="order.filledAt" class="num normal-case tracking-normal text-dimmed">{{ fmtTime(order.filledAt) }}</span>
        <span class="text-dimmed">{{ order.timeInForce }}</span>
      </div>
    </div>

    <UButton
      v-if="cancellable"
      label="Cancel"
      color="neutral"
      variant="ghost"
      size="xs"
      :loading="isCancelling"
      @click="cancel(order.id)"
    />
  </div>
</template>
