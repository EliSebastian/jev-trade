<script setup lang="ts">
import type { JevDecisionDto } from '#shared/types/jev'
import { actionLabel, triggerLabel } from '#shared/utils/jev-labels'

const props = defineProps<{ decision: JevDecisionDto }>()
const open = ref(false)

const d = computed(() => props.decision)
const isRail = computed(() => d.value.trigger === 'stop_loss' || d.value.trigger === 'take_profit')
const actionClass = computed(() =>
  d.value.action === 'executed' ? 'text-highlighted' : d.value.action === 'failed' ? 'text-error' : 'text-dimmed'
)
const groups = computed(() => {
  const f = d.value.facts
  return [
    ['Time', f.time],
    ['Market', f.market],
    ['Price', f.price],
    ['Position', f.position],
    ['Account', f.account]
  ].filter(([, facts]) => facts.length) as [string, string[]][]
})
</script>

<template>
  <div class="border-b border-muted">
    <button
      type="button"
      class="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/40"
      :aria-expanded="open"
      @click="open = !open"
    >
      <div class="num w-16 text-[11px] text-dimmed">{{ fmtTime(d.ts) }}</div>

      <div class="min-w-0">
        <div class="flex items-center gap-2 text-[13px]">
          <JevVerdictBadge :verdict="d.verdict" :executed="d.action === 'executed'" />
          <span class="num truncate text-highlighted">{{ d.symbol }}</span>
          <span class="num text-[11px] text-muted">{{ fmtPrice(d.price) }}</span>
          <span v-if="!isRail" class="num text-[11px] text-muted">p {{ fmtProb(d.probability) }} · c {{ fmtProb(d.confidence) }}</span>
        </div>
        <div class="flex flex-wrap items-center gap-x-2 text-[10px] uppercase tracking-[0.12em]">
          <span :class="actionClass">{{ actionLabel(d) }}</span>
          <span class="text-dimmed">{{ triggerLabel(d.trigger) }}</span>
          <span v-if="d.trend !== null" class="num normal-case tracking-normal text-dimmed">trend {{ fmtLevel(d.trend) }}</span>
          <span v-if="d.newsTone !== null" class="num normal-case tracking-normal text-dimmed">news {{ fmtLevel(d.newsTone) }}</span>
          <span v-if="d.avoid !== null" class="num normal-case tracking-normal text-dimmed">avoid {{ fmtProb(d.avoid) }}</span>
        </div>
      </div>

      <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-3.5 text-dimmed" />
    </button>

    <div v-if="open" class="space-y-2 border-t border-muted bg-muted/30 px-3 py-2 text-[11px] leading-relaxed">
      <div v-for="[title, facts] in groups" :key="title">
        <div class="text-[10px] uppercase tracking-[0.12em] text-dimmed">{{ title }}</div>
        <ul class="text-muted">
          <li v-for="(fact, i) in facts" :key="i">{{ fact }}</li>
        </ul>
      </div>
      <div v-if="d.news.length">
        <div class="text-[10px] uppercase tracking-[0.12em] text-dimmed">News</div>
        <ul class="space-y-1 text-muted">
          <li v-for="item in d.news" :key="item.headline">
            <a v-if="item.url" :href="item.url" target="_blank" rel="noopener" class="text-default hover:text-primary hover:underline">{{ item.headline }}</a>
            <span v-else class="text-default">{{ item.headline }}</span>
            <span class="text-dimmed"> · {{ item.source }}</span>
          </li>
        </ul>
      </div>
      <div v-if="d.orderId" class="num text-dimmed">order {{ d.orderId }}</div>
    </div>
  </div>
</template>
