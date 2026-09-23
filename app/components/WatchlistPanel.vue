<script setup lang="ts">
const { symbols, adding, add } = useWatchlist()
const draft = ref('')

async function submit() {
  const value = draft.value
  if (!value.trim()) return
  if (await add(value)) draft.value = ''
}
</script>

<template>
  <PanelFrame title="Watchlist" :count="symbols.length">
    <div v-if="symbols.length">
      <WatchlistRow v-for="symbol in symbols" :key="symbol" :symbol="symbol" />
    </div>
    <p v-else class="px-3 py-8 text-center text-[12px] text-dimmed">
      Nothing on the tape. Add a symbol below.
    </p>

    <template #footer>
      <form class="flex items-center gap-2 p-2" @submit.prevent="submit">
        <UInput
          v-model="draft"
          placeholder="Add symbol · AAPL or BTC/USD"
          size="sm"
          class="num flex-1"
          autocomplete="off"
          spellcheck="false"
          :disabled="adding"
          :ui="{ base: 'uppercase placeholder:normal-case' }"
        />
        <UButton type="submit" icon="i-lucide-plus" color="neutral" variant="soft" size="sm" :loading="adding" aria-label="Add symbol" />
      </form>
    </template>
  </PanelFrame>
</template>
