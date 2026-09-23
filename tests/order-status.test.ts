import { describe, expect, it } from 'vitest'
import { isCancellableStatus, isOpenOrderStatus, isTerminalStatus } from '#shared/utils/order-status'

describe('order status helpers', () => {
  it('marks filled, canceled, expired, rejected and replaced as terminal', () => {
    for (const s of ['filled', 'canceled', 'expired', 'rejected', 'replaced', 'done_for_day']) {
      expect(isTerminalStatus(s)).toBe(true)
      expect(isOpenOrderStatus(s)).toBe(false)
    }
  })

  it('marks new, accepted and partially filled as open', () => {
    for (const s of ['new', 'accepted', 'partially_filled', 'pending_new', 'held']) {
      expect(isOpenOrderStatus(s)).toBe(true)
      expect(isTerminalStatus(s)).toBe(false)
    }
  })

  it('allows cancelling open orders that are not already pending a cancel or replace', () => {
    expect(isCancellableStatus('new')).toBe(true)
    expect(isCancellableStatus('partially_filled')).toBe(true)
    expect(isCancellableStatus('pending_cancel')).toBe(false)
    expect(isCancellableStatus('pending_replace')).toBe(false)
    expect(isCancellableStatus('filled')).toBe(false)
  })
})
