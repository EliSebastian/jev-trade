<script setup lang="ts">
const { symbols } = useWatchlist()
</script>

<template>
  <div class="h-8 overflow-hidden border-b border-default bg-muted">
    <div
      v-if="symbols.length"
      class="animate-tape flex w-max divide-x divide-muted hover:[animation-play-state:paused] motion-reduce:animate-none"
      role="marquee"
      aria-label="Ticker tape"
    >
      <div v-for="half in 2" :key="half" class="flex divide-x divide-muted" :aria-hidden="half === 2">
        <TapeItem v-for="symbol in symbols" :key="symbol" :symbol="symbol" />
      </div>
    </div>
    <p v-else class="px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-dimmed">
      Tape idle · add a symbol to the watchlist
    </p>
  </div>
</template>
