import dgram from 'node:dgram'
import { networkInterfaces } from 'node:os'
import WebSocket from 'ws'

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

let scanTimer: NodeJS.Timeout | null = null

export function startSubnetScanner(
  hostPort: number,
  ignoreDeviceId: string,
  onAnnouncement: (announcement: UdpAnnouncement) => void
) {
  stopSubnetScanner()

  const scan = () => {
    const interfaces = networkInterfaces()
    const subnets = new Set<string>()

    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          const parts = net.address.split('.')
          if (parts.length === 4) {
            subnets.add(`${parts[0]}.${parts[1]}.${parts[2]}`)
          }
        }
      }
    }

    const hostsToProbe: string[] = ['127.0.0.1']
    for (const subnet of subnets) {
      const priorityHosts = [1, 254, 100, 101, 102, 200]
      for (const h of priorityHosts) hostsToProbe.push(`${subnet}.${h}`)
      for (let i = 1; i <= 254; i++) {
        if (!priorityHosts.includes(i)) hostsToProbe.push(`${subnet}.${i}`)
      }
    }

    const BATCH_SIZE = 40
    let index = 0

    const runBatch = () => {
      if (!scanTimer) return
      const batch = hostsToProbe.slice(index, index + BATCH_SIZE)
      if (batch.length === 0) return
      index += BATCH_SIZE

      batch.forEach(ip => {
        try {
          const ws = new WebSocket(`ws://${ip}:${hostPort}`)
          
          let isClosed = false
          const closeSocket = () => {
            if (isClosed) return
            isClosed = true
            try { ws.close() } catch {}
            try { ws.terminate() } catch {}
          }

          const timeout = setTimeout(closeSocket, 1200)

          ws.on('open', () => {
            if (isClosed) return
            try { ws.send(JSON.stringify({ type: 'HELLO', alias: 'Scanner', deviceId: 'desktop-scanner' })) } catch {}
          })

          ws.on('message', (data) => {
            clearTimeout(timeout)
            try {
              const payload = JSON.parse(data.toString())
              const code = String(payload.sessionCode ?? payload.code ?? '')
              if (payload.hostId === ignoreDeviceId) { closeSocket(); return }

              onAnnouncement({
                code: code || `HOST@${ip}`,
                port: hostPort,
                host: ip,
                deviceId: payload.hostId
              })
            } catch {}
            closeSocket()
          })

          ws.on('close', () => { clearTimeout(timeout); isClosed = true })
          ws.on('error', () => { clearTimeout(timeout); closeSocket() })
        } catch {}
      })

      setTimeout(runBatch, 200)
    }
    runBatch()
  }

  scan()
  scanTimer = setInterval(scan, 30000)
}

export function stopSubnetScanner() {
  if (scanTimer) {
    clearInterval(scanTimer)
    scanTimer = null
  }
}
