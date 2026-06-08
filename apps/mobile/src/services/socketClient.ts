/**
 * Socket client stub for the Guest device (v1.1 Mobile).
 *
 * In the full native build this would use react-native-tcp-socket.
 * For the current Expo managed workflow, this provides a realistic
 * simulation so all UI/UX guest flows work correctly.
 */

export type ClientEventMap = {
  connected: () => void
  disconnected: () => void
  message: (message: Record<string, unknown>) => void
  error: (err: Error) => void
}

type EventListeners = {
  [K in keyof ClientEventMap]: Array<ClientEventMap[K]>
}

class SocketClient {
  private connected = false
  private host = ''
  private port = 7400
  private deviceAlias = ''
  private listeners: EventListeners = {
    connected: [],
    disconnected: [],
    message: [],
    error: [],
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async connect(host: string, port: number, deviceAlias: string): Promise<void> {
    this.host = host
    this.port = port
    this.deviceAlias = deviceAlias

    // In native: TcpSocket.createConnection({ host, port }, () => { ... })
    // For stub: simulate successful connection after a short delay
    await new Promise<void>((resolve) => setTimeout(resolve, 500))

    this.connected = true
    this.emit('connected')

    // Send initial HELLO message
    await this.sendToHost({
      type: 'HELLO',
      deviceAlias,
      deviceId: this.deviceAlias,
    })

    console.log(`[SocketClient] Connected to ${host}:${port} as ${deviceAlias}`)
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return
    this.connected = false
    this.emit('disconnected')
    console.log('[SocketClient] Disconnected')
  }

  // ── Messaging ─────────────────────────────────────────────────────────────

  async sendToHost(message: Record<string, unknown>): Promise<void> {
    if (!this.connected) return
    // In native: socket.write(JSON.stringify(message) + '\n')
    console.log('[SocketClient] → host:', message.type)
  }

  /** Called by native layer when a message arrives from host */
  notifyMessage(message: Record<string, unknown>): void {
    this.emit('message', message)
  }

  // ── Event emitter ─────────────────────────────────────────────────────────

  on<K extends keyof ClientEventMap>(event: K, listener: ClientEventMap[K]): void {
    (this.listeners[event] as Array<ClientEventMap[K]>).push(listener)
  }

  off<K extends keyof ClientEventMap>(event: K, listener: ClientEventMap[K]): void {
    (this.listeners[event] as Array<ClientEventMap[K]>) =
      (this.listeners[event] as Array<ClientEventMap[K]>).filter((l) => l !== listener)
  }

  private emit<K extends keyof ClientEventMap>(event: K, ...args: Parameters<ClientEventMap[K]>): void {
    for (const listener of this.listeners[event]) {
      // @ts-expect-error spread args
      listener(...args)
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  isConnected(): boolean {
    return this.connected
  }

  getHost(): string {
    return this.host
  }

  getPort(): number {
    return this.port
  }
}

export const socketClient = new SocketClient()
