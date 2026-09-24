<script setup lang="ts">
const jev = useJev()
const { state, decisions, auto, loaded, switching, setAuto } = jev

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
const todayCount = computed(() => {
  const today = dayFmt.format(new Date())
  return decisions.value.filter(d => dayFmt.format(new Date(d.ts)) === today).length
})

const canSwitch = computed(() => Boolean(state.value?.available && state.value?.aiConfigured) && !switching.value)
const switchModel = computed({
  get: () => auto.value,
  set: (on: boolean) => { void setAuto(on) }
})

const status = computed(() => {
  const s = state.value
  if (!s) return { label: '—', tone: 'text-dimmed', dot: 'bg-accented' }
  if (!s.available) return { label: 'NO ALPACA KEYS', tone: 'text-dimmed', dot: 'bg-accented' }
  if (!s.aiConfigured) return { label: 'NO GATEWAY KEY', tone: 'text-dimmed', dot: 'bg-accented' }
  if (s.status === 'halted') return { label: `HALTED · until ${fmtTime(s.haltedUntil)}`, tone: 'text-primary', dot: 'bg-primary' }
  if (s.status === 'evaluating') return { label: `THINKING ${s.evaluating.join(' ')}`, tone: 'text-primary', dot: 'bg-primary animate-pulse' }
  return { label: s.auto ? 'ARMED' : 'WATCHING', tone: s.auto ? 'text-primary' : 'text-dimmed', dot: s.auto ? 'bg-primary' : 'bg-accented' }
})

const rails = computed(() => {
  const c = state.value?.config
  if (!c) return ''
  return [
    `${fmtMoney(c.notionalUsd)} / buy`,
    `max ${c.maxPositions} pos`,
    `SL ${fmtPct(c.stopLossPct)}`,
    `TP ${fmtPct(c.takeProfitPct)}`,
    `day loss ${fmtMoney(-c.dailyLossLimitUsd)}`,
    `p ≥ ${fmtProb(c.minProbability)}`,
    `c ≥ ${fmtProb(c.minConfidence)}`
  ].join(' · ')
})
</script>

<template>
  <PanelFrame title="Jev" :count="todayCount">
    <template #actions>
      <span class="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em]" :class="status.tone" :title="state?.lastError ?? undefined">
        <span class="size-1.5 rounded-full" :class="status.dot" />
        <span class="num">{{ status.label }}</span>
      </span>
      <span class="ml-2 text-[10px] uppercase tracking-[0.14em] text-dimmed">Auto</span>
      <USwitch v-model="switchModel" :disabled="!canSwitch" color="primary" size="xs" aria-label="Jev auto-trading" />
    </template>

    <div v-if="decisions.length">
      <JevDecisionRow v-for="d in decisions" :key="d.id" :decision="d" />
    </div>
    <p v-else class="px-3 py-8 text-center text-[12px] text-dimmed">
      <template v-if="!loaded">Loading Jev…</template>
      <template v-else-if="state && !state.available">Jev starts with the Alpaca keys.</template>
      <template v-else-if="state && !state.aiConfigured">Add NUXT_AI_GATEWAY_API_KEY to .env and restart to let Jev think.</template>
      <template v-else>No decisions yet. Jev evaluates each symbol every {{ Math.round((state?.config.intervalMs ?? 0) / 60_000) }} minutes.</template>
    </p>

    <template #footer>
      <div class="num truncate px-3 py-1.5 text-[10px] text-dimmed" :title="rails">{{ rails }}</div>
    </template>
  </PanelFrame>
</template>
