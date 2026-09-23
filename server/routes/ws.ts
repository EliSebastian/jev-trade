import { isError } from 'h3'
import type { ServerMessage } from '#shared/types/trading'
import { getStreamHub } from '../utils/stream-hub'
import { parseClientMessage } from '../utils/ws-protocol'

const send = (peer: { send: (data: string) => unknown }, msg: ServerMessage) => peer.send(JSON.stringify(msg))

export default defineWebSocketHandler({
  open(peer) {
    try {
      getStreamHub().addPeer({ id: peer.id, send: msg => send(peer, msg) })
    } catch (err) {
      send(peer, { type: 'error', message: isError(err) ? err.statusMessage ?? err.message : 'Stream unavailable' })
    }
  },
  message(peer, message) {
    const msg = parseClientMessage(message.text())
    if (!msg) {
      send(peer, { type: 'error', message: 'Unrecognized message' })
      return
    }
    if (msg.type === 'ping') {
      send(peer, { type: 'pong' })
      return
    }
    try {
      const hub = getStreamHub()
      if (msg.type === 'subscribe') hub.subscribe(peer.id, msg.symbols)
      else hub.unsubscribe(peer.id, msg.symbols)
    } catch (err) {
      send(peer, { type: 'error', message: isError(err) ? err.statusMessage ?? err.message : 'Stream unavailable' })
    }
  },
  close(peer) {
    try {
      getStreamHub().removePeer(peer.id)
    } catch {
      // hub never started (no keys); nothing to release
    }
  },
  error(peer) {
    try {
      getStreamHub().removePeer(peer.id)
    } catch {
      // see close()
    }
  }
})
