import { unavailableState } from '../../utils/jev/adapters'
import { getJevEngine } from '../../utils/jev/engine'

export default defineEventHandler(() => getJevEngine()?.state() ?? unavailableState())
