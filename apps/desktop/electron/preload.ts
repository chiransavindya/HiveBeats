import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APTs you need here.
  // ...
})

contextBridge.exposeInMainWorld('hivebeats', {
  startDiscovery() {
    return ipcRenderer.invoke('mdns:start-discovery')
  },
  stopDiscovery() {
    return ipcRenderer.invoke('mdns:stop-discovery')
  },
  advertiseSession(sessionCode: string, port: number) {
    return ipcRenderer.invoke('mdns:advertise', { sessionCode, port })
  },
  stopAdvertise() {
    return ipcRenderer.invoke('mdns:stop-advertise')
  },
  onServiceUp(callback: (service: unknown) => void) {
    const handler = (_event: Electron.IpcRendererEvent, service: unknown) => callback(service)
    ipcRenderer.on('mdns:service-up', handler)
    return () => ipcRenderer.off('mdns:service-up', handler)
  },
  onServiceDown(callback: (service: unknown) => void) {
    const handler = (_event: Electron.IpcRendererEvent, service: unknown) => callback(service)
    ipcRenderer.on('mdns:service-down', handler)
    return () => ipcRenderer.off('mdns:service-down', handler)
  },
  startHost(port: number) {
    return ipcRenderer.invoke('socket:start-host', { port })
  },
  stopHost() {
    return ipcRenderer.invoke('socket:stop-host')
  },
  connectToHost(host: string, port: number) {
    return ipcRenderer.invoke('socket:connect', { host, port })
  },
  disconnectFromHost() {
    return ipcRenderer.invoke('socket:disconnect')
  },
  sendToHost(message: unknown) {
    return ipcRenderer.invoke('socket:send-to-host', { message: JSON.stringify(message) })
  },
  sendToGuest(clientId: string, message: unknown) {
    return ipcRenderer.invoke('socket:send-to-guest', {
      clientId,
      message: JSON.stringify(message),
    })
  },
  broadcastToGuests(message: unknown) {
    return ipcRenderer.invoke('socket:broadcast', { message: JSON.stringify(message) })
  },
  onSocketStatus(callback: (status: unknown) => void) {
    const handler = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status)
    ipcRenderer.on('socket:status', handler)
    return () => ipcRenderer.off('socket:status', handler)
  },
  onSocketMessage(callback: (message: unknown) => void) {
    const handler = (_event: Electron.IpcRendererEvent, message: unknown) => callback(message)
    ipcRenderer.on('socket:message', handler)
    return () => ipcRenderer.off('socket:message', handler)
  },
  pickAudioFile() {
    return ipcRenderer.invoke('dialog:pick-audio')
  },
  startStream(filePath: string, fileName: string, mimeType: string, trackId: string) {
    return ipcRenderer.invoke('stream:start', { filePath, fileName, mimeType, trackId })
  },
  startStreamForGuest(clientId: string, filePath: string, fileName: string, mimeType: string, trackId: string) {
    return ipcRenderer.invoke('stream:start-for-guest', { clientId, filePath, fileName, mimeType, trackId })
  },
  stopStream() {
    return ipcRenderer.invoke('stream:stop')
  },
  startUdpBroadcast(
    sessionCode: string,
    hostPort: number,
    broadcastPort: number,
    intervalMs: number,
    deviceId: string,
  ) {
    return ipcRenderer.invoke('udp:start-broadcast', {
      sessionCode,
      hostPort,
      broadcastPort,
      intervalMs,
      deviceId,
    })
  },
  stopUdpBroadcast() {
    return ipcRenderer.invoke('udp:stop-broadcast')
  },
  startUdpListen(broadcastPort: number, deviceId: string) {
    return ipcRenderer.invoke('udp:start-listen', { broadcastPort, deviceId })
  },
  stopUdpListen() {
    return ipcRenderer.invoke('udp:stop-listen')
  },
  onUdpAnnouncement(callback: (announcement: unknown) => void) {
    const handler = (_event: Electron.IpcRendererEvent, announcement: unknown) => callback(announcement)
    ipcRenderer.on('udp:announcement', handler)
    return () => ipcRenderer.off('udp:announcement', handler)
  },
  onUdpError(callback: (error: unknown) => void) {
    const handler = (_event: Electron.IpcRendererEvent, error: unknown) => callback(error)
    ipcRenderer.on('udp:error', handler)
    return () => ipcRenderer.off('udp:error', handler)
  },
})
