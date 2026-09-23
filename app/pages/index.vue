<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'

useHead({ title: 'jev-trade · paper terminal' })

const watchlist = useWatchlist()
const account = useAccount()
const positions = usePositions()
const orders = useOrders()
const { seed } = useQuotes()
const feed = useMarketFeed()

onMounted(async () => {
  watchlist.load()
  feed.connect()
  await Promise.all([account.refresh(), account.refreshClock(), positions.refresh(), orders.refresh()])
  seed([...new Set([...watchlist.symbols.value, ...positions.symbols.value])]).catch(() => {})
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
      <main class="grid min-h-0 flex-1 grid-cols-1 divide-y divide-default overflow-y-auto lg:grid-cols-[1fr_1fr_1.25fr] lg:divide-x lg:divide-y-0 lg:overflow-hidden">
        <WatchlistPanel />
        <PositionsPanel />
        <BlotterPanel />
      </main>
    </div>

    <OrderTicketModal />
  </div>
</template>
