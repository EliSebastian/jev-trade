<script setup lang="ts">
defineProps<{ title: string, count?: number | string }>()
</script>

<template>
  <section class="flex flex-col bg-default lg:h-full lg:min-h-0">
    <header class="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-default bg-muted px-3">
      <h2 class="flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
        {{ title }}
        <span v-if="count !== undefined" class="num text-dimmed">{{ count }}</span>
      </h2>
      <div class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <div class="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="shrink-0 border-t border-default">
      <slot name="footer" />
    </footer>
  </section>
</template>
