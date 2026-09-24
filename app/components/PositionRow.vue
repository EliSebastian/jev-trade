<script setup lang="ts">
import type { PositionDto } from '#shared/types/trading'

const props = defineProps<{ position: PositionDto }>()
const { quotes } = useQuotes()
const { close, closing } = usePositions()
const { openTicket } = useOrderTicket()
const jev = useJev()

const quote = computed(() => quotes.value[props.position.symbol])
const { flashClass } = useTickFlash(quote)
const isClosing = computed(() => closing.value.includes(props.position.symbol))
const plClass = computed(() =>
  props.position.unrealizedPl > 0 ? 'text-gain' : props.position.unrealizedPl < 0 ? 'text-loss' : 'text-muted'
)
const verdict = computed(() => jev.latest.value[props.position.symbol])
const asking = computed(() => jev.asking.value.includes(props.position.symbol))
</script>

<template>
  <div class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-muted px-3 py-2" :class="flashClass">
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <span class="num truncate text-[13px] font-medium text-highlighted">{{ position.symbol }}</span>
        <span class="text-[10px] uppercase tracking-[0.12em] text-dimmed">{{ position.side }}</span>
        <JevVerdictBadge v-if="verdict" :verdict="verdict.verdict" :executed="verdict.action === 'executed'" />
      </div>
      <div class="num text-[11px] text-muted">
        {{ fmtQty(position.qty) }} @ {{ fmtPrice(position.avgEntryPrice) }}
        <span class="text-dimmed">·</span>
        {{ fmtMoney(position.marketValue) }}
      </div>
    </div>

    <div class="text-right">
      <div class="num text-[13px]" :class="plClass">{{ fmtMoney(position.unrealizedPl, { signed: true }) }}</div>
      <div class="num text-[11px]" :class="plClass">{{ fmtPct(position.unrealizedPlpc) }}</div>
    </div>

    <div class="flex items-center gap-1">
      <UButton
        icon="i-lucide-sparkles"
        color="primary"
        variant="ghost"
        size="xs"
        :loading="asking"
        :disabled="!jev.available.value"
        :aria-label="`Ask Jev about ${position.symbol}`"
        title="Ask Jev"
        @click="jev.ask(position.symbol)"
      />
      <UButton label="B" color="gain" variant="soft" size="xs" class="num w-7 justify-center" :aria-label="`Buy more ${position.symbol}`" @click="openTicket({ symbol: position.symbol, side: 'buy' })" />
      <UButton label="S" color="loss" variant="soft" size="xs" class="num w-7 justify-center" :aria-label="`Sell ${position.symbol}`" @click="openTicket({ symbol: position.symbol, side: 'sell', qty: Math.abs(position.qty) })" />
      <UButton label="Close" color="neutral" variant="ghost" size="xs" :loading="isClosing" @click="close(position.symbol)" />
    </div>
  </div>
</template>
