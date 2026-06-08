/**
 * UDP discovery stub for v1.1 mobile.
 *
 * In the full native build: react-native-udp broadcasts/listens on the LAN.
 * Stub: provides the API surface; logging simulates the behavior.
 *
 * Protocol (same as desktop):
 *   Broadcast every 3s: { type: "HIVEBEATS_ANNOUNCE", code, port, alias }
 *   Listener receives announcements and surfaces DiscoveredSession objects.
 */

import type { DiscoveredSession } from '../types/session'

type SessionFoundCallback = (session: DiscoveredSession) => void

class UdpDiscovery {
  private broadcasting = false
  private listening = false
  private broadcastInterval: ReturnType<typeof setInterval> | null = null
  private onSessionFound: SessionFoundCallback | null = null

  // ── Host: broadcast session ───────────────────────────────────────────────

  startBroadcasting(sessionCode: string, port: number, alias: string): void {
    if (this.broadcasting) return
    this.broadcasting = true

    // In native: UdpSocket.bind → socket.setBroadcast(true) → send loop
    this.broadcastInterval = setInterval(() => {
      const payload = JSON.stringify({
        type: 'HIVEBEATS_ANNOUNCE',
        code: sessionCode,
        port,
        alias,
      })
      // In native: socket.send(Buffer.from(payload), 0, payload.length, broadcastPort, '255.255.255.255')
      console.log(`[UDP] Broadcast: ${payload}`)
    }, 3000)

    console.log(`[UDP] Broadcasting session ${sessionCode} on port ${port}`)
  }

  stopBroadcasting(): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval)
      this.broadcastInterval = null
    }
    this.broadcasting = false
    console.log('[UDP] Stopped broadcasting')
  }

  // ── Guest: listen for sessions ────────────────────────────────────────────

  startListening(broadcastPort: number, onFound: SessionFoundCallback): void {
    if (this.listening) return
    this.listening = true
    this.onSessionFound = onFound

    // In native: UdpSocket.bind(broadcastPort) → socket.on('message', handleMsg)
    console.log(`[UDP] Listening for sessions on port ${broadcastPort}`)
  }

  stopListening(): void {
    this.listening = false
    this.onSessionFound = null
    console.log('[UDP] Stopped listening')
  }

  /** Called by native layer when a UDP announcement arrives */
  notifyAnnouncement(
    data: { code: string; port: number },
    senderAddress: string,
  ): void {
    if (!this.onSessionFound) return
    const session: DiscoveredSession = {
      sessionCode: data.code,
      hostAddress: senderAddress,
      port: data.port,
      source: 'udp',
      discoveredAt: Date.now(),
    }
    this.onSessionFound(session)
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  stopAll(): void {
    this.stopBroadcasting()
    this.stopListening()
  }

  isBroadcasting(): boolean {
    return this.broadcasting
  }

  isListening(): boolean {
    return this.listening
  }
}

export const udpDiscovery = new UdpDiscovery()
