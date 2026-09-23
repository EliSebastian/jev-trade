import {
  ApiError,
  AuthError,
  FetchError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  ValidationError
} from '@alpacahq/alpaca-trade-api'
import { createError, isError } from 'h3'
import type { H3Error } from 'h3'

/** Translate anything thrown while talking to Alpaca into an h3 error with a sane HTTP status. */
export function toH3Error(err: unknown): H3Error {
  if (isError(err)) return err

  if (err instanceof ApiError) {
    const data: Record<string, unknown> = { code: err.code, requestId: err.requestId }
    const message = err.message || 'Alpaca request failed'
    if (err instanceof AuthError) {
      return createError({ statusCode: 502, statusMessage: 'Alpaca credentials rejected', data })
    }
    if (err instanceof RateLimitError) {
      return createError({ statusCode: 429, statusMessage: 'Alpaca rate limit reached', data: { ...data, retryAfterMs: err.retryAfterMs } })
    }
    if (err instanceof ValidationError) return createError({ statusCode: 422, statusMessage: message, data })
    if (err instanceof PermissionError) return createError({ statusCode: 403, statusMessage: message, data })
    if (err instanceof NotFoundError) return createError({ statusCode: 404, statusMessage: message, data })
    const statusCode = err.status >= 400 && err.status < 500 ? err.status : 502
    return createError({ statusCode, statusMessage: message, data })
  }

  if (err instanceof FetchError) {
    return createError({ statusCode: 503, statusMessage: 'Alpaca unreachable' })
  }

  return createError({ statusCode: 500, statusMessage: err instanceof Error ? err.message : 'Unexpected error' })
}

/** Run an Alpaca call inside a route and rethrow as an h3 error. */
export async function withAlpaca<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    throw toH3Error(err)
  }
}
