<script setup lang="ts">
import type { JevVerdict } from '#shared/types/jev'
import { verdictColor } from '#shared/utils/jev-labels'

defineProps<{ verdict: JevVerdict, executed?: boolean }>()
</script>

<template>
  <UBadge
    :label="verdict.toUpperCase()"
    :color="verdictColor(verdict)"
    :variant="executed ? 'solid' : 'outline'"
    size="xs"
    class="num shrink-0 tracking-[0.12em]"
  />
</template>
