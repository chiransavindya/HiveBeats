/**
 * socketClient.ts — Real WebSocket-based guest client.
 *
 * The desktop host runs an HTTP + WebSocket server (using the `ws` npm package)
 * on the host port (default 7400).  React Native ships a native WebSocket
 * implementation that works in Expo Go without any extra native modules, so we
 * can connect directly — no react-native-tcp-socket needed.
 *
 * Protocol (mirrors desktop socket.ts / App.tsx):
 *   → HELLO   { type:'HELLO', deviceAlias, deviceId }
 *   ← WELCOME { type:'WELCOME', hostId }
 *   ← CMD_PLAY / CMD_PAUSE / CMD_SEEK / SYNC_PONG / STREAM_* …
 *   → SYNC_PING / QUEUE_REQUEST / READY_ACK …
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
  private ws: WebSocket | null = null
  private _connected = false
  private host = ''
  private port = 7400
  private deviceAlias = ''
  private deviceId = ''
  private listeners: EventListeners = {
    connected: [],
    disconnected: [],
    message: [],
    error: [],
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async connect(host: string, port: number, deviceAlias: string, deviceId = ''): Promise<void> {
    // Tear down any existing connection first
    this.disconnect()

    this.host = host
    this.port = port
    this.deviceAlias = deviceAlias
    this.deviceId = deviceId || deviceAlias

    return new Promise<void>((resolve, reject) => {
      const url = `ws://${host}:${port}`
      console.log(`[SocketClient] Connecting to ${url}`)

      // React Native's WebSocket is a global — no import needed
      const ws = new WebSocket(url)
      this.ws = ws

      const timeout = setTimeout(() => {
        ws.close()
        reject(new Error(`Connection timed out to ${url}`))
      }, 8000)

      ws.onopen = () => {
        clearTimeout(timeout)
        this._connected = true
        this.emit('connected')

        // Send HELLO immediately after connect (mirrors desktop guest logic)
        this.sendToHost({
          type: 'HELLO',
          deviceAlias: this.deviceAlias,
          deviceId: this.deviceId,
        })

        console.log(`[SocketClient] Connected to ${url}`)
        resolve()
      }

      ws.onmessage = (event) => {
        try {
          const data = typeof event.data === 'string'
            ? JSON.parse(event.data)
            : event.data
          this.emit('message', data as Record<string, unknown>)
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        clearTimeout(timeout)
        const wasConnected = this._connected
        this._connected = false
        this.ws = null
        if (wasConnected) {
          this.emit('disconnected')
        }
        console.log('[SocketClient] Connection closed')
      }

      ws.onerror = (event) => {
        clearTimeout(timeout)
        const err = new Error(`WebSocket error connecting to ${url}`)
        console.warn('[SocketClient] Error:', err.message)
        if (!this._connected) {
          reject(err)
        } else {
          this.emit('error', err)
        }
      }
    })
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.onclose = null // prevent double-emit
      this.ws.onerror = null
      try { this.ws.close() } catch { /* ignore */ }
      this.ws = null
    }
    if (this._connected) {
      this._connected = false
      this.emit('disconnected')
    }
    console.log('[SocketClient] Disconnected')
  }

  // ── Messaging ─────────────────────────────────────────────────────────────

  sendToHost(message: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    try {
      this.ws.send(JSON.stringify(message))
      console.log('[SocketClient] → host:', message.type)
    } catch (err) {
      console.warn('[SocketClient] send failed:', err)
    }
  }

  // ── Event emitter ─────────────────────────────────────────────────────────

  on<K extends keyof ClientEventMap>(event: K, listener: ClientEventMap[K]): void {
    (this.listeners[event] as Array<ClientEventMap[K]>).push(listener)
  }

  off<K extends keyof ClientEventMap>(event: K, listener: ClientEventMap[K]): void {
    (this.listeners[event] as Array<ClientEventMap[K]>) =
      (this.listeners[event] as Array<ClientEventMap[K]>).filter((l) => l !== listener)
  }

  removeAllListeners(): void {
    this.listeners = { connected: [], disconnected: [], message: [], error: [] }
  }

  private emit<K extends keyof ClientEventMap>(event: K, ...args: Parameters<ClientEventMap[K]>): void {
    for (const listener of this.listeners[event]) {
      // @ts-expect-error spread args
      listener(...args)
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  isConnected(): boolean {
    return this._connected && this.ws?.readyState === WebSocket.OPEN
  }

  getHost(): string { return this.host }
  getPort(): number { return this.port }
}

export const socketClient = new SocketClient()
