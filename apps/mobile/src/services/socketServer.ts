/**
 * Socket server stub for the Host device (v1.1 Mobile).
 *
 * In the full native build this would use react-native-tcp-socket.
 * For the current Expo managed workflow, this provides a realistic
 * simulation so all UI/UX flows work correctly end-to-end.
 *
 * Wire-protocol:
 *   All messages are newline-delimited JSON matching the desktop's format.
 *   Message types: HELLO, WELCOME, CMD_PLAY, CMD_PAUSE, CMD_SEEK,
 *                  SYNC_PING, SYNC_PONG, READY_REQUEST, READY_ACK,
 *                  QUEUE_REQUEST, QUEUE_APPROVED, QUEUE_DENIED,
 *                  STREAM_CHUNK, STREAM_END
 */

export type GuestConnection = {
  id: string
  alias: string
  address: string
}

export type ServerEventMap = {
  guestConnected: (guest: GuestConnection) => void
  guestDisconnected: (guestId: string) => void
  guestMessage: (guestId: string, message: Record<string, unknown>) => void
  error: (err: Error) => void
}

type EventListeners = {
  [K in keyof ServerEventMap]: Array<ServerEventMap[K]>
}

class SocketServer {
  private running = false
  private guests: Map<string, GuestConnection> = new Map()
  private listeners: EventListeners = {
    guestConnected: [],
    guestDisconnected: [],
    guestMessage: [],
    error: [],
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async start(port: number): Promise<void> {
    if (this.running) return
    this.running = true
    this.guests.clear()
    console.log(`[SocketServer] Hosting on port ${port}`)
  }

  async stop(): Promise<void> {
    this.running = false
    this.guests.clear()
    console.log('[SocketServer] Stopped')
  }

  // ── Guest management ──────────────────────────────────────────────────────

  /** Called when a guest connects (native layer will call this) */
  notifyGuestConnected(guest: GuestConnection): void {
    this.guests.set(guest.id, guest)
    this.emit('guestConnected', guest)
  }

  /** Called when a guest disconnects */
  notifyGuestDisconnected(guestId: string): void {
    this.guests.delete(guestId)
    this.emit('guestDisconnected', guestId)
  }

  /** Called when a message arrives from a guest */
  notifyGuestMessage(guestId: string, message: Record<string, unknown>): void {
    this.emit('guestMessage', guestId, message)
  }

  kickGuest(guestId: string): void {
    this.guests.delete(guestId)
    this.emit('guestDisconnected', guestId)
  }

  // ── Messaging ─────────────────────────────────────────────────────────────

  async broadcast(message: Record<string, unknown>): Promise<void> {
    if (!this.running) return
    // In native: serialize to JSON + '\n' and write to each socket
    console.log('[SocketServer] broadcast', message.type)
  }

  async sendToGuest(guestId: string, message: Record<string, unknown>): Promise<void> {
    if (!this.running || !this.guests.has(guestId)) return
    console.log(`[SocketServer] → guest ${guestId}:`, message.type)
  }

  // ── Event emitter ─────────────────────────────────────────────────────────

  on<K extends keyof ServerEventMap>(event: K, listener: ServerEventMap[K]): void {
    (this.listeners[event] as Array<ServerEventMap[K]>).push(listener)
  }

  off<K extends keyof ServerEventMap>(event: K, listener: ServerEventMap[K]): void {
    (this.listeners[event] as Array<ServerEventMap[K]>) =
      (this.listeners[event] as Array<ServerEventMap[K]>).filter((l) => l !== listener)
  }

  private emit<K extends keyof ServerEventMap>(event: K, ...args: Parameters<ServerEventMap[K]>): void {
    for (const listener of this.listeners[event]) {
      // @ts-expect-error spread args
      listener(...args)
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  isRunning(): boolean {
    return this.running
  }

  getGuests(): GuestConnection[] {
    return Array.from(this.guests.values())
  }

  getGuestCount(): number {
    return this.guests.size
  }
}

export const socketServer = new SocketServer()
