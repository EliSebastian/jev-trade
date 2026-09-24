import { describe, expect, it } from 'vitest'
import {
  fmtDurationShort,
  plLabel,
  rangeFact,
  rangeLabel,
  returnFact,
  returnLabel,
  returnUnavailableFact,
  rsiFact,
  rsiLabel,
  smaFact,
  smaLabel,
  stalenessFact,
  volLabel,
  volumeFact,
  volumeLabel,
  volFact
} from '~~/server/utils/jev/facts'

describe('labels', () => {
  it('returnLabel follows the documented boundaries', () => {
    expect(returnLabel(0.001)).toBe('essentially flat')
    expect(returnLabel(-0.0016)).toBe('slightly down')
    expect(returnLabel(0.005)).toBe('slightly up')
    expect(returnLabel(0.0075)).toBe('up noticeably')
    expect(returnLabel(-0.019)).toBe('down noticeably')
    expect(returnLabel(0.02)).toBe('up sharply')
    expect(returnLabel(-0.05)).toBe('down sharply')
  })

  it('smaLabel follows the documented boundaries', () => {
    expect(smaLabel(0.002)).toBe('at its 20-bar average')
    expect(smaLabel(0.008)).toBe('slightly above')
    expect(smaLabel(-0.008)).toBe('slightly below')
    expect(smaLabel(0.01)).toBe('well above')
    expect(smaLabel(-0.03)).toBe('well below')
  })

  it('rsiLabel follows the documented boundaries', () => {
    expect(rsiLabel(29.9)).toBe('oversold')
    expect(rsiLabel(30)).toBe('weak')
    expect(rsiLabel(45)).toBe('neutral')
    expect(rsiLabel(55)).toBe('neutral')
    expect(rsiLabel(70)).toBe('strong')
    expect(rsiLabel(70.1)).toBe('overbought')
  })

  it('volLabel follows the documented boundaries', () => {
    expect(volLabel(0.69)).toBe('calmer than earlier')
    expect(volLabel(1.5)).toBe('similar to earlier')
    expect(volLabel(2.5)).toBe('more volatile than earlier')
    expect(volLabel(2.51)).toBe('much more volatile, spiking')
  })

  it('rangeLabel follows the documented boundaries', () => {
    expect(rangeLabel(0.19)).toBe("near the day's low")
    expect(rangeLabel(0.39)).toBe("in the lower part of the day's range")
    expect(rangeLabel(0.6)).toBe('mid-range')
    expect(rangeLabel(0.8)).toBe("in the upper part of the day's range")
    expect(rangeLabel(0.81)).toBe("near the day's high")
  })

  it('volumeLabel follows the documented boundaries', () => {
    expect(volumeLabel(0.49)).toBe('light')
    expect(volumeLabel(1.5)).toBe('normal')
    expect(volumeLabel(3)).toBe('elevated')
    expect(volumeLabel(3.01)).toBe('very heavy')
  })

  it('plLabel follows the documented boundaries', () => {
    expect(plLabel(-0.021)).toBe('sizable loss')
    expect(plLabel(-0.01)).toBe('small loss')
    expect(plLabel(0.005)).toBe('about flat')
    expect(plLabel(0.02)).toBe('small gain')
    expect(plLabel(0.032)).toBe('sizable gain')
  })
})

describe('sentences', () => {
  it('returnFact renders a signed percent with its label', () => {
    expect(returnFact(15, 0.0185)).toBe('Over the last 15 minutes the price moved +1.85% (up noticeably).')
    expect(returnFact(5, -0.0004)).toBe('Over the last 5 minutes the price moved -0.04% (essentially flat).')
  })

  it('returnUnavailableFact explains missing history', () => {
    expect(returnUnavailableFact(60, 42)).toBe('Only 42 minutes of bars are available; the 60-minute change cannot be computed.')
  })

  it('smaFact renders the gap to the moving average', () => {
    expect(smaFact(0.008)).toBe('Price is 0.8% above its 20-bar simple moving average (slightly above).')
    expect(smaFact(-0.023)).toBe('Price is 2.3% below its 20-bar simple moving average (well below).')
    expect(smaFact(0.001)).toBe('Price is at its 20-bar simple moving average.')
  })

  it('rsiFact rounds the value', () => {
    expect(rsiFact(70.6)).toBe('RSI-14 is 71 (overbought).')
  })

  it('volFact and volumeFact render one-decimal multiples', () => {
    expect(volFact(2.13)).toBe('Volatility over the last 15 bars is 2.1x the earlier volatility (more volatile than earlier).')
    expect(volumeFact(1.8)).toBe('Volume in the last 5 bars is 1.8x the average of the earlier bars (elevated).')
  })

  it('rangeFact renders the position inside the day range', () => {
    expect(rangeFact(0.82, 186.1, 190.2)).toBe("Price sits at 82% of today's range between 186.10 and 190.20 (near the day's high).")
  })

  it('stalenessFact only speaks up past ten minutes', () => {
    expect(stalenessFact(9 * 60_000)).toBeNull()
    expect(stalenessFact(11 * 60_000)).toBe('Data is stale: the newest bar is 11 minutes old.')
    expect(stalenessFact(null)).toBeNull()
  })
})

describe('fmtDurationShort', () => {
  it('formats minutes, hours and days compactly', () => {
    expect(fmtDurationShort(30_000)).toBe('under a minute')
    expect(fmtDurationShort(12 * 60_000)).toBe('12 m')
    expect(fmtDurationShort((1 * 60 + 55) * 60_000)).toBe('1 h 55 m')
    expect(fmtDurationShort(2 * 3_600_000 + 5 * 60_000)).toBe('2 h 05 m')
    expect(fmtDurationShort(50 * 3_600_000)).toBe('2 d 2 h')
  })
})
