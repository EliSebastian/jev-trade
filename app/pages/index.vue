<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'

useHead({ title: 'jev-trade · paper terminal' })

const watchlist = useWatchlist()
const account = useAccount()
const positions = usePositions()
const orders = useOrders()
const jev = useJev()
const { seed } = useQuotes()
const feed = useMarketFeed()

onMounted(async () => {
  watchlist.load()
  feed.connect()
  await Promise.all([account.refresh(), account.refreshClock(), positions.refresh(), orders.refresh(), jev.refresh()])
  seed([...new Set([...watchlist.symbols.value, ...positions.symbols.value])]).catch(() => {})
  // The browser owns the watchlist; mirror it so the engine keeps trading with the tab closed.
  watch(watchlist.symbols, symbols => jev.syncWatchlist(symbols), { immediate: true, deep: true })
})

useIntervalFn(() => account.refreshClock(), 30_000)
</script>

<template>
  <div class="grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)] bg-default font-sans text-default">
    <TickerTape />
    <AccountStrip />

    <div class="flex min-h-0 flex-col">
      <UAlert
        v-if="account.error.value"
        :title="account.keysMissing.value ? 'Alpaca keys not configured' : 'Account unavailable'"
        :description="account.keysMissing.value
          ? 'Add NUXT_ALPACA_KEY_ID and NUXT_ALPACA_SECRET_KEY to .env (paper keys) and restart the dev server.'
          : account.error.value"
        color="primary"
        variant="subtle"
        icon="i-lucide-key-round"
        class="rounded-none border-b border-default"
      />
      <main
        class="grid min-h-0 flex-1 grid-cols-1 divide-y divide-default overflow-y-auto [&>*]:border-default
               lg:grid-cols-2 lg:grid-rows-2 lg:divide-y-0 lg:overflow-hidden lg:[&>*:nth-child(even)]:border-l lg:[&>*:nth-child(n+3)]:border-t
               xl:grid-cols-[1fr_1fr_1.2fr_1.2fr] xl:grid-rows-1 xl:[&>*:nth-child(n+2)]:border-l xl:[&>*]:border-t-0"
      >
        <WatchlistPanel />
        <PositionsPanel />
        <BlotterPanel />
        <JevPanel />
      </main>
    </div>

    <OrderTicketModal />
  </div>
</template>
