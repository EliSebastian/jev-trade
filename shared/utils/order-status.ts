const TERMINAL = new Set(['filled', 'canceled', 'expired', 'rejected', 'replaced', 'done_for_day'])
const PENDING_CHANGE = new Set(['pending_cancel', 'pending_replace'])

export function isTerminalStatus(status: string): boolean {
  return TERMINAL.has(status)
}

export function isOpenOrderStatus(status: string): boolean {
  return !TERMINAL.has(status)
}

export function isCancellableStatus(status: string): boolean {
  return isOpenOrderStatus(status) && !PENDING_CHANGE.has(status)
}
