import { getAlpaca } from '../utils/alpaca'
import { withAlpaca } from '../utils/errors'
import { toAccountDto } from '../utils/normalize'

export default defineEventHandler(() =>
  withAlpaca(async () => toAccountDto(await getAlpaca().trading.account.getAccount()))
)
