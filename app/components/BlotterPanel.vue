<script setup lang="ts">
const { list, open, loaded } = useOrders()
const view = ref<'open' | 'all'>('all')
const rows = computed(() => (view.value === 'open' ? open.value : list.value))
</script>

<template>
  <PanelFrame title="Blotter" :count="view === 'open' ? open.length : list.length">
    <template #actions>
      <UButtonGroup size="xs">
        <UButton label="Open" color="neutral" :variant="view === 'open' ? 'soft' : 'ghost'" class="num" @click="view = 'open'" />
        <UButton label="All" color="neutral" :variant="view === 'all' ? 'soft' : 'ghost'" class="num" @click="view = 'all'" />
      </UButtonGroup>
    </template>

    <div v-if="rows.length">
      <BlotterRow v-for="order in rows" :key="order.id" :order="order" />
    </div>
    <p v-else class="px-3 py-8 text-center text-[12px] text-dimmed">
      <template v-if="!loaded">Loading orders…</template>
      <template v-else-if="view === 'open'">No open orders.</template>
      <template v-else>No orders yet. Open the ticket to place one.</template>
    </p>
  </PanelFrame>
</template>
