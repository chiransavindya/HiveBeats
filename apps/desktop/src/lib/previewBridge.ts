const ok = async () => ({ ok: true as const })
const off = () => undefined

export function ensurePreviewBridge() {
  if (window.hivebeats) return

  window.hivebeats = {
    startDiscovery: ok,
    stopDiscovery: ok,
    advertiseSession: ok,
    stopAdvertise: ok,
    onServiceUp: () => off,
    onServiceDown: () => off,
    startHost: ok,
    stopHost: ok,
    connectToHost: ok,
    disconnectFromHost: ok,
    sendToHost: ok,
    sendToGuest: ok,
    broadcastToGuests: ok,
    onSocketStatus: () => off,
    onSocketMessage: () => off,
    pickAudioFile: async () => ({ canceled: true }),
    startStream: ok,
    startStreamForGuest: ok,
    stopStream: ok,
    startUdpBroadcast: ok,
    stopUdpBroadcast: ok,
    startUdpListen: ok,
    stopUdpListen: ok,
    onUdpAnnouncement: () => off,
    onUdpError: () => off,
  }
}
