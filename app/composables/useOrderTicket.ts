import type { OrderSide, OrderType } from '#shared/types/trading'

export interface TicketPrefill {
  symbol?: string
  side?: OrderSide
  type?: OrderType
  qty?: number
}

export function useOrderTicket() {
  const ticket = useState<{ open: boolean, prefill: TicketPrefill, nonce: number }>('order-ticket', () => ({
    open: false,
    prefill: {},
    nonce: 0
  }))

  function openTicket(prefill: TicketPrefill = {}) {
    ticket.value = { open: true, prefill, nonce: ticket.value.nonce + 1 }
  }

  function closeTicket() {
    ticket.value = { ...ticket.value, open: false }
  }

  return { ticket, openTicket, closeTicket }
}
