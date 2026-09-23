import type { Quote } from './useQuotes'

/**
 * Turns a quote's flash timestamp into a short-lived class. The class snaps on and the
 * CSS transition fades it out, so rapid ticks restart cleanly without a keyframe reset.
 */
export function useTickFlash(quote: Ref<Quote | undefined>) {
  const flashing = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  watch(() => quote.value?.flashAt, (at) => {
    if (!at) return
    flashing.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      flashing.value = false
    }, 120)
  })

  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
  })

  const flashClass = computed(() => {
    if (flashing.value) return quote.value?.flashDir === 'down' ? 'bg-loss/15' : 'bg-gain/15'
    return 'transition-colors duration-[var(--tick-flash-ms)] ease-out motion-reduce:transition-none'
  })

  return { flashing, flashClass }
}
