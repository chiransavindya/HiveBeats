import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import { createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket, { WebSocketServer, type RawData } from 'ws'

type HostClient = {
  id: string
  socket: WebSocket
  address: string
}

type HostHandlers = {
  onClientConnected?: (client: HostClient) => void
  onClientDisconnected?: (client: HostClient) => void
  onClientMessage?: (client: HostClient, data: string) => void
  onHostError?: (error: Error) => void
}

type GuestHandlers = {
  onConnected?: () => void
  onDisconnected?: () => void
  onMessage?: (data: string) => void
  onError?: (error: Error) => void
}

let server: WebSocketServer | null = null
let httpServer: ReturnType<typeof createServer> | null = null
const clients = new Map<string, HostClient>()

let guestSocket: WebSocket | null = null

export function startHost(port: number, handlers: HostHandlers) {
  stopHost()

  httpServer = createServer((req, res) => {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Filename')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    if (req.method === 'POST' && req.url === '/upload') {
      const filename = req.headers['x-filename'] || 'upload.audio'
      // Ensure safe filename by replacing non-alphanumeric chars (excluding dot/dash)
      const safeFilename = (filename as string).replace(/[^a-zA-Z0-9.-]/g, '_')
      const filepath = join(tmpdir(), `hivebeats-${Date.now()}-${safeFilename}`)
      
      const stream = createWriteStream(filepath)
      req.pipe(stream)
      
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ path: filepath }))
      })
      
      req.on('error', (err) => {
        console.error('Upload stream error:', err)
        res.writeHead(500)
        res.end()
      })
      return
    }

    res.writeHead(404)
    res.end()
  })

  server = new WebSocketServer({ server: httpServer })

  server.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    const address = request.socket.remoteAddress ?? 'unknown'
    const client: HostClient = {
      id: randomUUID(),
      socket,
      address,
    }

    clients.set(client.id, client)
    handlers.onClientConnected?.(client)

    socket.on('message', (data: RawData) => {
      handlers.onClientMessage?.(client, data.toString())
    })

    socket.on('close', () => {
      clients.delete(client.id)
      handlers.onClientDisconnected?.(client)
    })

    socket.on('error', (error: Error) => {
      handlers.onHostError?.(error as Error)
    })
  })

  server.on('error', (error: Error) => {
    handlers.onHostError?.(error as Error)
  })

  httpServer.listen(port)
}

export function stopHost() {
  clients.forEach((client) => client.socket.close())
  clients.clear()
  server?.close()
  server = null
  httpServer?.close()
  httpServer = null
}

export function broadcastToGuests(message: string) {
  clients.forEach((client) => {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(message)
    }
  })
}

export function sendToGuest(clientId: string, message: string) {
  const client = clients.get(clientId)
  if (!client) return false

  if (client.socket.readyState === WebSocket.OPEN) {
    client.socket.send(message)
    return true
  }

  return false
}

export function connectToHost(host: string, port: number, handlers: GuestHandlers) {
  disconnectFromHost()

  guestSocket = new WebSocket(`ws://${host}:${port}`)

  guestSocket.on('open', () => {
    handlers.onConnected?.()
  })

  guestSocket.on('message', (data: RawData) => {
    handlers.onMessage?.(data.toString())
  })

  guestSocket.on('close', () => {
    handlers.onDisconnected?.()
  })

  guestSocket.on('error', (error: Error) => {
    handlers.onError?.(error as Error)
  })
}

export function disconnectFromHost() {
  if (!guestSocket) return
  guestSocket.close()
  guestSocket = null
}

export function sendToHost(message: string) {
  if (guestSocket && guestSocket.readyState === WebSocket.OPEN) {
    guestSocket.send(message)
    return true
  }
  return false
}
