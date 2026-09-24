import { describe, expect, it } from 'vitest'
import {
  barAgeMs,
  rangePosition,
  realizedVolRatio,
  returnOver,
  rsi,
  sma,
  volumeRatio
} from '~~/server/utils/jev/indicators'

const up = (n: number, start = 100) => Array.from({ length: n }, (_, i) => start + i)
const down = (n: number, start = 100) => Array.from({ length: n }, (_, i) => start - i)

describe('returnOver', () => {
  it('returns the ratio change between the last close and the close n bars earlier', () => {
    expect(returnOver([100, 101, 102, 110], 3)).toBeCloseTo(0.1, 10)
    expect(returnOver([100, 101, 102, 110], 1)).toBeCloseTo(110 / 102 - 1, 10)
  })

  it('needs n + 1 closes', () => {
    expect(returnOver([100, 110], 2)).toBeNull()
    expect(returnOver([], 1)).toBeNull()
  })
})

describe('sma', () => {
  it('averages the last n closes', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toBe(4)
  })

  it('is null with fewer than n closes', () => {
    expect(sma([1, 2], 3)).toBeNull()
  })
})

describe('rsi', () => {
  it('is 100 for a series that only rises', () => {
    expect(rsi(up(16), 14)).toBe(100)
  })

  it('is 0 for a series that only falls', () => {
    expect(rsi(down(16), 14)).toBe(0)
  })

  it('is 50 when gains and losses are symmetric', () => {
    const alternating = Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 10 : 11))
    expect(rsi(alternating, 14)).toBeCloseTo(50, 6)
  })

  it('applies Wilder smoothing after the first window', () => {
    // 14 alternating changes (7 gains, 7 losses of 1) then one more +1:
    // avgGain = (0.5 * 13 + 1) / 14, avgLoss = (0.5 * 13) / 14 -> RSI = 53.57
    const closes = [...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 10 : 11)), 11]
    expect(rsi(closes, 14)).toBeCloseTo(53.57, 2)
  })

  it('needs period + 1 closes', () => {
    expect(rsi(up(14), 14)).toBeNull()
  })
})

describe('realizedVolRatio', () => {
  const calm = (n: number) => Array.from({ length: n }, (_, i) => 100 + (i % 2 === 0 ? 0.05 : -0.05))

  it('is above 1 when the recent window is noisier than the earlier one', () => {
    const earlier = calm(31)
    const recent = Array.from({ length: 15 }, (_, i) => 100 + (i % 2 === 0 ? 2 : -2))
    const ratio = realizedVolRatio([...earlier, ...recent], 15, 30)
    expect(ratio).not.toBeNull()
    expect(ratio!).toBeGreaterThan(1)
  })

  it('is about 1 when both windows have the same noise', () => {
    const ratio = realizedVolRatio(calm(46), 15, 30)
    expect(ratio).not.toBeNull()
    expect(ratio!).toBeCloseTo(1, 1)
  })

  it('needs recent + earlier + 1 closes and a non-zero earlier volatility', () => {
    expect(realizedVolRatio(calm(45), 15, 30)).toBeNull()
    expect(realizedVolRatio(Array(46).fill(100), 15, 30)).toBeNull()
  })
})

describe('volumeRatio', () => {
  it('compares the mean of the last n volumes with the mean of the rest', () => {
    const volumes = [...Array(10).fill(100), ...Array(5).fill(300)]
    expect(volumeRatio(volumes, 5)).toBe(3)
  })

  it('needs at least 2n volumes and a non-zero baseline', () => {
    expect(volumeRatio(Array(9).fill(100), 5)).toBeNull()
    expect(volumeRatio([...Array(5).fill(0), ...Array(5).fill(10)], 5)).toBeNull()
  })
})

describe('rangePosition', () => {
  it('places the price inside the low..high range as a 0..1 ratio', () => {
    expect(rangePosition(105, 100, 110)).toBe(0.5)
  })

  it('clamps outside the range', () => {
    expect(rangePosition(120, 100, 110)).toBe(1)
    expect(rangePosition(90, 100, 110)).toBe(0)
  })

  it('is null for a degenerate or missing range', () => {
    expect(rangePosition(100, 100, 100)).toBeNull()
    expect(rangePosition(100, null, 110)).toBeNull()
  })
})

describe('barAgeMs', () => {
  it('measures how old the newest bar timestamp is', () => {
    expect(barAgeMs('2026-09-23T14:00:00.000Z', Date.parse('2026-09-23T14:11:00.000Z'))).toBe(11 * 60_000)
  })

  it('is null when there is no timestamp', () => {
    expect(barAgeMs(null, Date.now())).toBeNull()
  })
})
