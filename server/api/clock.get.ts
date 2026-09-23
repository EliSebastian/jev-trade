import { getAlpaca } from '../utils/alpaca'
import { withAlpaca } from '../utils/errors'
import { toClockDto } from '../utils/normalize'

export default defineEventHandler(() =>
  withAlpaca(async () => toClockDto(await getAlpaca().trading.clock.legacyClock()))
)
