<script setup lang="ts">
import { useNow } from '@vueuse/core'

const { account, clock, dayPl, dayPlPct } = useAccount()
const { openTicket } = useOrderTicket()
const now = useNow({ interval: 1000 })

const marketOpen = computed(() => clock.value?.isOpen ?? null)

const countdown = computed(() => {
  if (!clock.value) return ''
  const target = new Date(clock.value.isOpen ? clock.value.nextClose : clock.value.nextOpen).getTime()
  const diff = Math.max(0, target - now.value.getTime())
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return h > 48 ? `${Math.floor(h / 24)}d` : `${h}h ${String(m).padStart(2, '0')}m`
})
</script>

<template>
  <div class="flex h-11 items-center gap-5 overflow-x-auto border-b border-default px-3 text-[12px]">
    <UBadge label="PAPER" color="primary" variant="outline" size="sm" class="num shrink-0 tracking-[0.2em]" />

    <dl class="flex items-center gap-5">
      <div class="flex items-baseline gap-2">
        <dt class="text-[10px] uppercase tracking-[0.14em] text-dimmed">Equity</dt>
        <dd class="num text-highlighted">{{ fmtMoney(account?.equity) }}</dd>
      </div>
      <div class="flex items-baseline gap-2">
        <dt class="text-[10px] uppercase tracking-[0.14em] text-dimmed">Cash</dt>
        <dd class="num text-default">{{ fmtMoney(account?.cash) }}</dd>
      </div>
      <div class="flex items-baseline gap-2">
        <dt class="text-[10px] uppercase tracking-[0.14em] text-dimmed">Buying power</dt>
        <dd class="num text-default">{{ fmtMoney(account?.buyingPower) }}</dd>
      </div>
      <div class="flex items-baseline gap-2">
        <dt class="text-[10px] uppercase tracking-[0.14em] text-dimmed">Day P&amp;L</dt>
        <dd
          class="num"
          :class="dayPl === null ? 'text-dimmed' : dayPl > 0 ? 'text-gain' : dayPl < 0 ? 'text-loss' : 'text-default'"
        >
          {{ fmtMoney(dayPl, { signed: true }) }}
          <span v-if="dayPlPct !== null" class="text-[11px] opacity-80">({{ fmtPct(dayPlPct) }})</span>
        </dd>
      </div>
    </dl>

    <div class="ml-auto flex shrink-0 items-center gap-4">
      <span class="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-dimmed">
        <span class="size-1.5 rounded-full" :class="marketOpen ? 'bg-gain' : 'bg-accented'" />
        <span>{{ marketOpen === null ? 'MKT —' : marketOpen ? 'MKT OPEN' : 'MKT CLOSED' }}</span>
        <span v-if="countdown" class="num normal-case tracking-normal text-dimmed">{{ marketOpen ? 'closes' : 'opens' }} in {{ countdown }}</span>
      </span>
      <StreamStatusDots />
      <UButton
        label="Order ticket"
        icon="i-lucide-plus"
        color="primary"
        variant="soft"
        size="xs"
        class="num tracking-wide"
        @click="openTicket()"
      />
      <UColorModeButton size="xs" color="neutral" />
    </div>
  </div>
</template>
