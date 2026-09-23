<script setup lang="ts">
const props = defineProps<{ symbol: string }>()
const { quotes, changeOf } = useQuotes()
const quote = computed(() => quotes.value[props.symbol])
const change = computed(() => changeOf(quote.value))
const { flashClass } = useTickFlash(quote)
</script>

<template>
  <span class="flex items-baseline gap-2 whitespace-nowrap px-4 py-1.5" :class="flashClass">
    <span class="num text-[12px] font-medium text-highlighted">{{ symbol }}</span>
    <span class="num text-[12px] text-default">{{ fmtPrice(quote?.price) }}</span>
    <span
      v-if="change !== null"
      class="num text-[11px]"
      :class="change > 0 ? 'text-gain' : change < 0 ? 'text-loss' : 'text-dimmed'"
    >{{ change > 0 ? '▲' : change < 0 ? '▼' : '' }} {{ fmtPct(change) }}</span>
  </span>
</template>
