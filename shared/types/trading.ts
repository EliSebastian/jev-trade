/** Asset classes this app trades. Alpaca has more, but the UI only handles these two. */
export type AssetClass = 'us_equity' | 'crypto'
export type OrderSide = 'buy' | 'sell'
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit'
export type TimeInForce = 'day' | 'gtc'

/** Alpaca order lifecycle statuses (subset that matters to the blotter; others pass through as strings). */
export type OrderStatus =
  | 'new' | 'partially_filled' | 'filled' | 'done_for_day' | 'canceled' | 'expired' | 'replaced'
  | 'pending_cancel' | 'pending_replace' | 'accepted' | 'pending_new' | 'accepted_for_bidding'
  | 'stopped' | 'rejected' | 'suspended' | 'calculated' | 'held' | (string & {})

export interface OrderDto {
  id: string
  clientOrderId: string | null
  symbol: string
  assetClass: AssetClass
  side: OrderSide
  type: OrderType | 'trailing_stop'
  status: OrderStatus
  qty: number | null
  notional: number | null
  filledQty: number
  filledAvgPrice: number | null
  limitPrice: number | null
  stopPrice: number | null
  timeInForce: string
  createdAt: string
  updatedAt: string | null
  filledAt: string | null
  /** Last trade_updates event seen for this order (client side only). */
  lastEvent?: string
}

export interface PositionDto {
  symbol: string
  assetClass: AssetClass
  side: 'long' | 'short'
  qty: number
  avgEntryPrice: number
  marketValue: number
  costBasis: number
  unrealizedPl: number
  unrealizedPlpc: number
  currentPrice: number
  changeToday: number
}

export interface AccountDto {
  id: string
  status: string
  currency: string
  cash: number
  buyingPower: number
  equity: number
  lastEquity: number
  portfolioValue: number
}

export interface AssetDto {
  symbol: string
  name: string
  assetClass: AssetClass
  exchange: string
  status: string
  tradable: boolean
  fractionable: boolean
  minOrderSize: number | null
}

export interface ClockDto {
  isOpen: boolean
  nextOpen: string
  nextClose: string
  timestamp: string
}

export interface SeedDto {
  symbol: string
  assetClass: AssetClass
  /** Oldest to newest closes used to draw the sparkline. */
  closes: number[]
  lastPrice: number | null
  lastTs: string | null
  prevClose: number | null
}

/* ---------- WebSocket protocol (server <-> browser) ---------- */

export type StreamName = 'stocks' | 'crypto' | 'trading'
export type StreamStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'disconnected'

export interface TickMessage {
  type: 'tick'
  symbol: string
  assetClass: AssetClass
  price: number
  size: number
  ts: string
}

export interface OrderMessage {
  type: 'order'
  event: string
  order: OrderDto
}

export interface StatusMessage {
  type: 'status'
  streams: Record<StreamName, StreamStatus>
}

export interface ErrorMessage {
  type: 'error'
  message: string
  stream?: StreamName
}

export interface PongMessage {
  type: 'pong'
}

export type ServerMessage = TickMessage | OrderMessage | StatusMessage | ErrorMessage | PongMessage

export type ClientMessage =
  | { type: 'subscribe', symbols: string[] }
  | { type: 'unsubscribe', symbols: string[] }
  | { type: 'ping' }
