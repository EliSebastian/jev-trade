<script setup lang="ts">
const props = defineProps<{ symbol: string }>()
const { quotes, changeOf } = useQuotes()
const { remove } = useWatchlist()
const { openTicket } = useOrderTicket()
const jev = useJev()

const quote = computed(() => quotes.value[props.symbol])
const change = computed(() => changeOf(quote.value))
const { flashClass } = useTickFlash(quote)
const tone = computed(() => {
  const c = change.value
  if (c === null) {
    const closes = quote.value?.closes ?? []
    if (closes.length < 2) return 'flat'
    return closes[closes.length - 1]! >= closes[0]! ? 'up' : 'down'
  }
  return c > 0 ? 'up' : c < 0 ? 'down' : 'flat'
})
const verdict = computed(() => jev.latest.value[props.symbol])
const asking = computed(() => jev.asking.value.includes(props.symbol))
</script>

<template>
  <div
    class="group grid h-12 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 border-b border-muted px-3"
    :class="flashClass"
  >
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <span class="num truncate text-[13px] font-medium text-highlighted">{{ symbol }}</span>
        <JevVerdictBadge v-if="verdict" :verdict="verdict.verdict" :executed="verdict.action === 'executed'" />
      </div>
      <div class="truncate text-[10px] uppercase tracking-[0.12em] text-dimmed">
        {{ quote?.assetClass === 'crypto' ? 'crypto · 24h' : 'stock' }}
      </div>
    </div>

    <Sparkline :values="quote?.closes ?? []" :tone="tone" class="hidden sm:block" />

    <div class="w-24 text-right">
      <div class="num text-[13px] text-highlighted">{{ fmtPrice(quote?.price) }}</div>
      <div
        class="num text-[11px]"
        :class="change === null ? 'text-dimmed' : change > 0 ? 'text-gain' : change < 0 ? 'text-loss' : 'text-muted'"
      >
        {{ change === null ? '—' : fmtPct(change) }}
      </div>
    </div>

    <div class="flex items-center gap-1">
      <UButton
        icon="i-lucide-sparkles"
        color="primary"
        variant="ghost"
        size="xs"
        :loading="asking"
        :disabled="!jev.available.value"
        :aria-label="`Ask Jev about ${symbol}`"
        title="Ask Jev"
        @click="jev.ask(symbol)"
      />
      <UButton label="B" color="gain" variant="soft" size="xs" class="num w-7 justify-center" :aria-label="`Buy ${symbol}`" @click="openTicket({ symbol, side: 'buy' })" />
      <UButton label="S" color="loss" variant="soft" size="xs" class="num w-7 justify-center" :aria-label="`Sell ${symbol}`" @click="openTicket({ symbol, side: 'sell' })" />
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="xs"
        class="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        :aria-label="`Remove ${symbol} from watchlist`"
        @click="remove(symbol)"
      />
    </div>
  </div>
</template>
