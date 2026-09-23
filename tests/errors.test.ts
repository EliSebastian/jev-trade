import { ApiError, AuthError, FetchError, NotFoundError, PermissionError, RateLimitError, ValidationError } from '@alpacahq/alpaca-trade-api'
import { createError } from 'h3'
import { describe, expect, it } from 'vitest'
import { toH3Error } from '~~/server/utils/errors'

const res = (status: number) => new Response(null, { status })

describe('toH3Error', () => {
  it('maps validation errors to 422 with the Alpaca message', () => {
    const e = toH3Error(new ValidationError(res(422), 422, 42210000, 'insufficient buying power', undefined, undefined, 'req-1'))
    expect(e.statusCode).toBe(422)
    expect(e.statusMessage).toBe('insufficient buying power')
    expect(e.data).toEqual({ code: 42210000, requestId: 'req-1' })
  })

  it('passes permission errors through as 403 with their message', () => {
    const e = toH3Error(new PermissionError(res(403), 403, 40310000, 'insufficient buying power'))
    expect(e.statusCode).toBe(403)
    expect(e.statusMessage).toBe('insufficient buying power')
  })

  it('maps not found to 404', () => {
    expect(toH3Error(new NotFoundError(res(404), 404, 40410000, 'asset not found')).statusCode).toBe(404)
  })

  it('hides credential failures behind a 502', () => {
    const e = toH3Error(new AuthError(res(401), 401, 40110000, 'unauthorized'))
    expect(e.statusCode).toBe(502)
    expect(e.statusMessage).toBe('Alpaca credentials rejected')
  })

  it('maps rate limits to 429 and exposes the retry delay', () => {
    const e = toH3Error(new RateLimitError(res(429), 429, 42910000, 'too many requests', undefined, 3000))
    expect(e.statusCode).toBe(429)
    expect(e.data).toMatchObject({ retryAfterMs: 3000 })
  })

  it('turns Alpaca 5xx into a 502', () => {
    expect(toH3Error(new ApiError(res(500), 500, undefined, 'boom')).statusCode).toBe(502)
  })

  it('maps network failures to 503', () => {
    const e = toH3Error(new FetchError(new Error('ECONNRESET')))
    expect(e.statusCode).toBe(503)
    expect(e.statusMessage).toBe('Alpaca unreachable')
  })

  it('returns h3 errors unchanged', () => {
    const original = createError({ statusCode: 418, statusMessage: 'teapot' })
    expect(toH3Error(original)).toBe(original)
  })

  it('falls back to 500 for unknown errors', () => {
    const e = toH3Error(new Error('what'))
    expect(e.statusCode).toBe(500)
  })
})
