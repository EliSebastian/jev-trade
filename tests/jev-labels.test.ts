import { describe, expect, it } from 'vitest'
import type { JevSkipReason, JevTrigger } from '#shared/types/jev'
import { actionLabel, skipReasonLabel, triggerLabel, verdictColor } from '#shared/utils/jev-labels'

const SKIP_REASONS: JevSkipReason[] = [
  'hold', 'low_probability', 'low_confidence', 'avoid', 'auto_off', 'halted', 'cooldown', 'market_closed',
  'insufficient_data', 'max_positions', 'insufficient_buying_power', 'no_position', 'in_flight'
]
const TRIGGERS: JevTrigger[] = ['boot', 'schedule', 'fill', 'manual', 'stop_loss', 'take_profit']

describe('jev labels', () => {
  it('has a human label for every skip reason and trigger', () => {
    for (const r of SKIP_REASONS) expect(skipReasonLabel(r)).toMatch(/^[A-Z]/)
    for (const t of TRIGGERS) expect(triggerLabel(t)).toMatch(/^[A-Z]/)
    expect(skipReasonLabel('auto_off')).toBe('Auto off')
    expect(skipReasonLabel('halted')).toBe('Halted (daily loss)')
    expect(triggerLabel('schedule')).toBe('Timer')
    expect(triggerLabel('stop_loss')).toBe('Stop-loss')
  })

  it('reserves green and red for buy and sell', () => {
    expect(verdictColor('buy')).toBe('gain')
    expect(verdictColor('sell')).toBe('loss')
    expect(verdictColor('hold')).toBe('neutral')
  })

  it('describes what happened to a decision', () => {
    expect(actionLabel({ action: 'executed', skipReason: null, error: null })).toBe('Executed')
    expect(actionLabel({ action: 'skipped', skipReason: 'cooldown', error: null })).toBe('Cooldown')
    expect(actionLabel({ action: 'skipped', skipReason: null, error: null })).toBe('Skipped')
    expect(actionLabel({ action: 'failed', skipReason: null, error: 'gateway down' })).toBe('Failed: gateway down')
    expect(actionLabel({ action: 'failed', skipReason: null, error: null })).toBe('Failed')
  })
})
