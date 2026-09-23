import { z } from 'zod'
import type { ClientMessage } from '#shared/types/trading'
import { normalizeSymbol } from '#shared/utils/symbols'

const symbols = z
  .array(z.string())
  .max(100)
  .transform(list => [...new Set(list.map(normalizeSymbol).filter(Boolean))])

const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), symbols }),
  z.object({ type: z.literal('unsubscribe'), symbols }),
  z.object({ type: z.literal('ping') })
])

/** Parse a raw WebSocket frame from the browser. Returns null for anything we do not understand. */
export function parseClientMessage(text: string): ClientMessage | null {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  const result = clientMessageSchema.safeParse(json)
  return result.success ? result.data : null
}
