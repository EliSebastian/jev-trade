<script setup lang="ts">
const props = withDefaults(defineProps<{
  values: number[]
  tone?: 'up' | 'down' | 'flat'
  width?: number
  height?: number
}>(), { tone: 'flat', width: 96, height: 24 })

const geometry = computed(() => {
  const { values, width, height } = props
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pad = 1.5
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - pad - ((v - min) / span) * (height - pad * 2)
    return [x, y] as const
  })
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const area = `0,${height} ${line} ${width},${height}`
  return { line, area }
})

const stroke = computed(() =>
  props.tone === 'up' ? 'var(--ui-gain)' : props.tone === 'down' ? 'var(--ui-loss)' : 'var(--ui-text-dimmed)'
)
</script>

<template>
  <svg
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
    preserveAspectRatio="none"
    aria-hidden="true"
    class="block overflow-visible"
  >
    <template v-if="geometry">
      <polygon :points="geometry.area" :fill="stroke" fill-opacity="0.10" />
      <polyline
        :points="geometry.line"
        fill="none"
        :stroke="stroke"
        stroke-width="1.25"
        stroke-linejoin="round"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
      />
    </template>
    <line
      v-else
      x1="0"
      :y1="height / 2"
      :x2="width"
      :y2="height / 2"
      stroke="var(--ui-border-accented)"
      stroke-width="1"
      stroke-dasharray="2 3"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
