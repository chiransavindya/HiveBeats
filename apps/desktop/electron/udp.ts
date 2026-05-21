import dgram from 'node:dgram'

export type UdpAnnouncement = {
  code: string
  port: number
  host: string
  deviceId?: string
}

const BROADCAST_ADDRESS = '255.255.255.255'

let broadcastSocket: dgram.Socket | null = null
let broadcastTimer: NodeJS.Timeout | null = null

let listenSocket: dgram.Socket | null = null

export function startBroadcast(
  sessionCode: string,
  hostPort: number,
  broadcastPort: number,
  intervalMs: number,
  deviceId: string,
) {
  stopBroadcast()

  broadcastSocket = dgram.createSocket('udp4')
  broadcastSocket.bind(() => {
    broadcastSocket?.setBroadcast(true)
  })

  const payload = Buffer.from(
    JSON.stringify({
      type: 'HIVEBEATS_ANNOUNCE',
      code: sessionCode,
      port: hostPort,
      deviceId,
    }),
  )

  broadcastTimer = setInterval(() => {
    broadcastSocket?.send(payload, broadcastPort, BROADCAST_ADDRESS)
  }, intervalMs)
}

export function stopBroadcast() {
  if (broadcastTimer) {
    clearInterval(broadcastTimer)
    broadcastTimer = null
  }
  broadcastSocket?.close()
  broadcastSocket = null
}

export function startListener(
  broadcastPort: number,
  ignoreDeviceId: string,
  onAnnouncement: (announcement: UdpAnnouncement) => void,
  onError: (error: Error) => void,
) {
  stopListener()

  listenSocket = dgram.createSocket('udp4')

  listenSocket.on('message', (message, rinfo) => {
    try {
      const payload = JSON.parse(message.toString()) as {
        type?: string
        code?: string
        port?: number
        deviceId?: string
      }

      if (payload.type !== 'HIVEBEATS_ANNOUNCE' || !payload.code || !payload.port) {
        return
      }

      if (payload.deviceId && payload.deviceId === ignoreDeviceId) {
        return
      }

      onAnnouncement({
        code: payload.code,
        port: payload.port,
        host: rinfo.address,
        deviceId: payload.deviceId,
      })
    } catch (error) {
      onError(error as Error)
    }
  })

  listenSocket.on('error', (error) => {
    onError(error)
  })

  listenSocket.bind(broadcastPort)
}

export function stopListener() {
  listenSocket?.close()
  listenSocket = null
}
