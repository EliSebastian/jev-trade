/** Best-effort human message from a $fetch / h3 error. */
export function errorMessage(err: unknown): string {
  const e = err as { data?: { statusMessage?: string, message?: string }, statusMessage?: string, message?: string } | null
  return e?.data?.statusMessage || e?.data?.message || e?.statusMessage || e?.message || 'Unexpected error'
}

export function errorStatus(err: unknown): number | null {
  const e = err as { statusCode?: number, status?: number, response?: { status?: number } } | null
  return e?.statusCode ?? e?.status ?? e?.response?.status ?? null
}
