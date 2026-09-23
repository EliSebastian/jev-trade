import type { AssetClass } from '#shared/types/trading'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const moneySigned = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' })
const pct = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' })
const qty = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 })
const time = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

function priceFormatter(value: number): Intl.NumberFormat {
  const abs = Math.abs(value)
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits })
}

export function fmtPrice(value: number | null | undefined, _assetClass?: AssetClass): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return priceFormatter(value).format(value)
}

export function fmtMoney(value: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return (opts.signed ? moneySigned : money).format(value)
}

/** `fraction` is a ratio (0.0123 → +1.23%). */
export function fmtPct(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return '—'
  return pct.format(fraction)
}

export function fmtQty(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return qty.format(value)
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : time.format(d)
}

/** Human label for an order type. */
export function orderTypeLabel(type: string): string {
  switch (type) {
    case 'market': return 'MKT'
    case 'limit': return 'LMT'
    case 'stop': return 'STP'
    case 'stop_limit': return 'STP LMT'
    case 'trailing_stop': return 'TRAIL'
    default: return type.toUpperCase()
  }
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').toUpperCase()
}
