import { hasAlpacaKeys } from '../utils/alpaca'
import { createProductionJevEngine } from '../utils/jev/adapters'
import { getJevEngine, setJevEngine } from '../utils/jev/engine'

/**
 * Boots the Jev engine with the server. It registers as a permanent peer on the stream hub,
 * so the Alpaca streams stay connected even with no browser tab open; that is intended.
 */
export default defineNitroPlugin((nitroApp) => {
  if (!hasAlpacaKeys()) {
    console.info('[jev] Alpaca keys not configured; engine not started')
    return
  }
  if (getJevEngine()) return

  const engine = createProductionJevEngine()
  setJevEngine(engine)
  engine.start().catch((err) => {
    console.error('[jev] engine failed to start', err)
    setJevEngine(undefined)
  })

  nitroApp.hooks.hook('close', () => {
    engine.shutdown()
    setJevEngine(undefined)
  })
})
