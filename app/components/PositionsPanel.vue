<script setup lang="ts">
const { live, loaded } = usePositions()
const total = computed(() => live.value.reduce((sum, p) => sum + p.unrealizedPl, 0))
</script>

<template>
  <PanelFrame title="Positions" :count="live.length">
    <template #actions>
      <span
        v-if="live.length"
        class="num text-[12px]"
        :class="total > 0 ? 'text-gain' : total < 0 ? 'text-loss' : 'text-muted'"
      >{{ fmtMoney(total, { signed: true }) }}</span>
    </template>

    <div v-if="live.length">
      <PositionRow v-for="position in live" :key="position.symbol" :position="position" />
    </div>
    <p v-else class="px-3 py-8 text-center text-[12px] text-dimmed">
      {{ loaded ? 'No open positions. Fill an order and it shows up here.' : 'Loading positions…' }}
    </p>
  </PanelFrame>
</template>
