import type {
  AccountDto,
  AssetClass,
  AssetDto,
  ClockDto,
  OrderDto,
  OrderMessage,
  PositionDto,
  TickMessage
} from '#shared/types/trading'
import { classifySymbol, toCanonicalSymbol } from '#shared/utils/symbols'

type Numeric = string | number | null | undefined
type DateLike = Date | string | null | undefined

/** Alpaca returns most money/quantity fields as strings. Parse tolerantly. */
export function num(v: Numeric): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function iso(d: DateLike): string | null {
  if (!d) return null
  const date = d instanceof Date ? d : new Date(d)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function assetClassOf(v: unknown, symbol: string): AssetClass {
  if (v === 'crypto' || v === 'us_equity') return v
  return classifySymbol(symbol)
}

/* ---------- loose shapes of what the SDK hands us (all fields optional) ---------- */

export interface RawTrade {
  symbol: string
  price: number
  size: number
  timestamp: Date
}

export interface RawOrder {
  id?: string
  clientOrderId?: string | null
  symbol?: string
  assetClass?: string
  side?: string
  type?: string
  status?: string
  qty?: Numeric
  notional?: Numeric
  filledQty?: Numeric
  filledAvgPrice?: Numeric
  limitPrice?: Numeric
  stopPrice?: Numeric
  timeInForce?: string
  createdAt?: DateLike
  updatedAt?: DateLike
  filledAt?: DateLike
}

export interface RawPosition {
  symbol?: string
  assetClass?: string
  side?: string
  qty?: Numeric
  avgEntryPrice?: Numeric
  marketValue?: Numeric
  costBasis?: Numeric
  unrealizedPl?: Numeric
  unrealizedPlpc?: Numeric
  currentPrice?: Numeric
  changeToday?: Numeric
}

export interface RawAccount {
  id?: string
  status?: string
  currency?: string
  cash?: Numeric
  buyingPower?: Numeric
  equity?: Numeric
  lastEquity?: Numeric
  portfolioValue?: Numeric
}

export interface RawAsset {
  symbol?: string
  name?: string
  _class?: string
  exchange?: string
  status?: string
  tradable?: boolean
  fractionable?: boolean
  minOrderSize?: Numeric
}

export interface RawClock {
  isOpen: boolean
  nextOpen: DateLike
  nextClose: DateLike
  timestamp: DateLike
}

/* ---------- mappers ---------- */

export function toTick(trade: RawTrade, assetClass: AssetClass): TickMessage {
  return {
    type: 'tick',
    symbol: toCanonicalSymbol(trade.symbol, assetClass),
    assetClass,
    price: trade.price,
    size: trade.size,
    ts: iso(trade.timestamp) ?? new Date().toISOString()
  }
}

export function toOrderDto(o: RawOrder): OrderDto {
  const rawSymbol = o.symbol ?? ''
  const assetClass = assetClassOf(o.assetClass, rawSymbol)
  return {
    id: o.id ?? '',
    clientOrderId: o.clientOrderId ?? null,
    symbol: toCanonicalSymbol(rawSymbol, assetClass),
    assetClass,
    side: o.side === 'sell' ? 'sell' : 'buy',
    type: (o.type as OrderDto['type']) ?? 'market',
    status: o.status ?? 'new',
    qty: num(o.qty),
    notional: num(o.notional),
    filledQty: num(o.filledQty) ?? 0,
    filledAvgPrice: num(o.filledAvgPrice),
    limitPrice: num(o.limitPrice),
    stopPrice: num(o.stopPrice),
    timeInForce: o.timeInForce ?? 'day',
    createdAt: iso(o.createdAt) ?? new Date().toISOString(),
    updatedAt: iso(o.updatedAt),
    filledAt: iso(o.filledAt)
  }
}

export function toOrderMessage(update: { event: string, order: RawOrder }): OrderMessage {
  return { type: 'order', event: update.event, order: toOrderDto(update.order) }
}

export function toPositionDto(p: RawPosition): PositionDto {
  const rawSymbol = p.symbol ?? ''
  const assetClass = assetClassOf(p.assetClass, rawSymbol)
  return {
    symbol: toCanonicalSymbol(rawSymbol, assetClass),
    assetClass,
    side: p.side === 'short' ? 'short' : 'long',
    qty: num(p.qty) ?? 0,
    avgEntryPrice: num(p.avgEntryPrice) ?? 0,
    marketValue: num(p.marketValue) ?? 0,
    costBasis: num(p.costBasis) ?? 0,
    unrealizedPl: num(p.unrealizedPl) ?? 0,
    unrealizedPlpc: num(p.unrealizedPlpc) ?? 0,
    currentPrice: num(p.currentPrice) ?? 0,
    changeToday: num(p.changeToday) ?? 0
  }
}

export function toAccountDto(a: RawAccount): AccountDto {
  return {
    id: a.id ?? '',
    status: a.status ?? 'UNKNOWN',
    currency: a.currency ?? 'USD',
    cash: num(a.cash) ?? 0,
    buyingPower: num(a.buyingPower) ?? 0,
    equity: num(a.equity) ?? 0,
    lastEquity: num(a.lastEquity) ?? 0,
    portfolioValue: num(a.portfolioValue) ?? 0
  }
}

export function toAssetDto(a: RawAsset): AssetDto {
  const rawSymbol = a.symbol ?? ''
  const assetClass = assetClassOf(a._class, rawSymbol)
  return {
    symbol: toCanonicalSymbol(rawSymbol, assetClass),
    name: a.name ?? rawSymbol,
    assetClass,
    exchange: a.exchange ?? '',
    status: a.status ?? 'unknown',
    tradable: a.tradable === true,
    fractionable: a.fractionable === true,
    minOrderSize: num(a.minOrderSize)
  }
}

export function toClockDto(c: RawClock): ClockDto {
  const now = new Date().toISOString()
  return {
    isOpen: c.isOpen === true,
    nextOpen: iso(c.nextOpen) ?? now,
    nextClose: iso(c.nextClose) ?? now,
    timestamp: iso(c.timestamp) ?? now
  }
}
