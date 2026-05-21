export type SocketRole = 'host' | 'guest'

export type SocketStatusPayload =
  | { role: 'host'; status: 'started' | 'stopped' }
  | { role: 'host'; status: 'client-connected'; clientId: string; address: string }
  | { role: 'host'; status: 'client-disconnected'; clientId: string }
  | { role: 'guest'; status: 'connected' | 'disconnected' }
  | { role: 'guest'; status: 'error'; message: string }
  | { role: 'host'; status: 'error'; message: string }

export type SocketMessagePayload = {
  role: SocketRole
  clientId?: string
  message: unknown
}

export type HostHelloMessage = {
  type: 'HELLO'
  deviceId: string
  alias: string
}

export type HostWelcomeMessage = {
  type: 'WELCOME'
  sessionCode: string
  hostId: string
}

export type HostErrorMessage = {
  type: 'ERROR'
  message: string
}
