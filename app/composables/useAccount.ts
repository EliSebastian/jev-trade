import type { AccountDto, ClockDto } from '#shared/types/trading'

export function useAccount() {
  const account = useState<AccountDto | null>('account', () => null)
  const clock = useState<ClockDto | null>('clock', () => null)
  const error = useState<string | null>('account-error', () => null)
  const errorStatusCode = useState<number | null>('account-error-status', () => null)

  async function refresh() {
    try {
      account.value = await $fetch<AccountDto>('/api/account')
      error.value = null
      errorStatusCode.value = null
    } catch (err) {
      error.value = errorMessage(err)
      errorStatusCode.value = errorStatus(err)
    }
  }

  async function refreshClock() {
    try {
      clock.value = await $fetch<ClockDto>('/api/clock')
    } catch {
      // keep the last known clock
    }
  }

  const dayPl = computed(() => (account.value ? account.value.equity - account.value.lastEquity : null))
  const dayPlPct = computed(() =>
    account.value && account.value.lastEquity ? (account.value.equity - account.value.lastEquity) / account.value.lastEquity : null
  )
  /** 503 from the server means the .env keys are missing. */
  const keysMissing = computed(() => errorStatusCode.value === 503)

  return { account, clock, error, errorStatusCode, keysMissing, dayPl, dayPlPct, refresh, refreshClock }
}
