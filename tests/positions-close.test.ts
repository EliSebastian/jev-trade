import { describe, expect, it, vi } from 'vitest'
import { closePosition } from '~~/server/utils/positions'

function deps() {
  const raw = { id: 'c1', symbol: 'BTCUSD', assetClass: 'crypto', side: 'sell', type: 'market', status: 'accepted', qty: '0.001', createdAt: '2026-09-23T18:00:00Z' }
  const positions = { deleteOpenPosition: vi.fn(async () => raw) }
  return { positions: () => positions, api: positions }
}

describe('closePosition', () => {
  it('closes the whole position using the path spelling of the symbol', async () => {
    const d = deps()
    const order = await closePosition('btc/usd', d)
    expect(d.api.deleteOpenPosition).toHaveBeenCalledWith({ symbolOrAssetId: 'BTCUSD' })
    expect(order).toMatchObject({ id: 'c1', symbol: 'BTC/USD', side: 'sell', qty: 0.001 })
  })

  it('rejects an empty symbol with a 400', async () => {
    const d = deps()
    await expect(closePosition('  ', d)).rejects.toMatchObject({ statusCode: 400 })
    expect(d.api.deleteOpenPosition).not.toHaveBeenCalled()
  })
})
