import { getAlpaca } from '../utils/alpaca'
import { withAlpaca } from '../utils/errors'
import { toPositionDto } from '../utils/normalize'

export default defineEventHandler(() =>
  withAlpaca(async () => (await getAlpaca().trading.positions.getAllOpenPositions()).map(toPositionDto))
)
