import { randomUUID } from 'node:crypto'
import WebSocket, { WebSocketServer } from 'ws'

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
const clients = new Map<string, HostClient>()

let guestSocket: WebSocket | null = null

export function startHost(port: number, handlers: HostHandlers) {
  stopHost()

  server = new WebSocketServer({ port })

  server.on('connection', (socket, request) => {
    const address = request.socket.remoteAddress ?? 'unknown'
    const client: HostClient = {
      id: randomUUID(),
      socket,
      address,
    }

    clients.set(client.id, client)
    handlers.onClientConnected?.(client)

    socket.on('message', (data) => {
      handlers.onClientMessage?.(client, data.toString())
    })

    socket.on('close', () => {
      clients.delete(client.id)
      handlers.onClientDisconnected?.(client)
    })

    socket.on('error', (error) => {
      handlers.onHostError?.(error as Error)
    })
  })

  server.on('error', (error) => {
    handlers.onHostError?.(error as Error)
  })
}

export function stopHost() {
  clients.forEach((client) => client.socket.close())
  clients.clear()
  server?.close()
  server = null
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

  guestSocket.on('message', (data) => {
    handlers.onMessage?.(data.toString())
  })

  guestSocket.on('close', () => {
    handlers.onDisconnected?.()
  })

  guestSocket.on('error', (error) => {
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
