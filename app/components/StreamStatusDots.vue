<script setup lang="ts">
import type { StreamStatus } from '#shared/types/trading'

const { streams, socket } = useMarketFeed()

const items = computed(() => [
  { key: 'link', label: 'Server link', status: socket.value === 'OPEN' ? 'connected' : socket.value === 'CONNECTING' ? 'connecting' : 'disconnected' },
  { key: 'stocks', label: 'Stocks feed', status: streams.value.stocks },
  { key: 'crypto', label: 'Crypto feed', status: streams.value.crypto },
  { key: 'trading', label: 'Order updates', status: streams.value.trading }
] as { key: string, label: string, status: StreamStatus }[])

function dotClass(status: StreamStatus) {
  switch (status) {
    case 'connected': return 'bg-gain'
    case 'connecting':
    case 'reconnecting': return 'bg-primary animate-pulse'
    case 'error': return 'bg-error'
    default: return 'bg-accented'
  }
}
</script>

<template>
  <div class="flex items-center gap-2" aria-label="Stream status">
    <UTooltip v-for="item in items" :key="item.key" :text="`${item.label}: ${item.status}`">
      <span class="flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-dimmed">
        <span class="size-1.5 rounded-full" :class="dotClass(item.status)" />
        {{ item.key }}
      </span>
    </UTooltip>
  </div>
</template>
