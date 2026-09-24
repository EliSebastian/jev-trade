import type { JevDecisionDto, JevSkipReason, JevTrigger, JevVerdict } from '#shared/types/jev'

const SKIP_LABELS: Record<JevSkipReason, string> = {
  hold: 'Hold',
  low_probability: 'Low probability',
  low_confidence: 'Low confidence',
  avoid: 'Avoid flag',
  auto_off: 'Auto off',
  halted: 'Halted (daily loss)',
  cooldown: 'Cooldown',
  market_closed: 'Market closed',
  insufficient_data: 'Not enough bars',
  max_positions: 'Max positions',
  insufficient_buying_power: 'No buying power',
  no_position: 'No position',
  in_flight: 'In flight'
}

const TRIGGER_LABELS: Record<JevTrigger, string> = {
  boot: 'Boot',
  schedule: 'Timer',
  fill: 'Fill',
  manual: 'Manual',
  stop_loss: 'Stop-loss',
  take_profit: 'Take-profit'
}

export const skipReasonLabel = (reason: JevSkipReason): string => SKIP_LABELS[reason] ?? reason
export const triggerLabel = (trigger: JevTrigger): string => TRIGGER_LABELS[trigger] ?? trigger

/** Green and red stay reserved for buy and sell; hold uses the neutral palette. */
export function verdictColor(verdict: JevVerdict): 'gain' | 'loss' | 'neutral' {
  return verdict === 'buy' ? 'gain' : verdict === 'sell' ? 'loss' : 'neutral'
}

export function actionLabel(d: Pick<JevDecisionDto, 'action' | 'skipReason' | 'error'>): string {
  if (d.action === 'executed') return 'Executed'
  if (d.action === 'failed') return d.error ? `Failed: ${d.error}` : 'Failed'
  return d.skipReason ? skipReasonLabel(d.skipReason) : 'Skipped'
}
