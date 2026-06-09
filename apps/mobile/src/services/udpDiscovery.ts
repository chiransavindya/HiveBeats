/**
 * LAN Discovery service for HiveBeats mobile.
 *
 * The desktop host runs a WebSocket-over-HTTP server (port 7400 by default).
 * Expo Go / managed workflow has no access to raw UDP sockets, so we cannot
 * receive the desktop's UDP broadcast packets directly.
 *
 * Strategy — two complementary approaches, both using only APIs available in
 * Expo Go (fetch + WebSocket):
 *
 * 1. SUBNET SCAN (primary)
 *    Derive the /24 subnet from the device's own IP, then probe every host in
 *    that subnet by attempting a WebSocket upgrade to ws://x.x.x.N:<port>.
 *    A successful upgrade means a HiveBeats host is present. We read the first
 *    message (WELCOME / HELLO response) to get the session code.
 *    Concurrent batch size = 20 to avoid overwhelming the network stack.
 *
 * 2. WELL-KNOWN HOSTS (secondary)
 *    Common gateway addresses (.1, .254) are probed first for speed.
 *
 * The public API is kept identical to the original stub so no call-sites change.
 *
 * Note: "startBroadcasting" is kept as a no-op because the mobile uses
 * socketServer (WebSocket) for hosting, not UDP. The desktop's udp.ts handles
 * broadcast for desktop → desktop discovery; that path is unchanged.
 */

import type { DiscoveredSession } from '../types/session'

type SessionFoundCallback = (session: DiscoveredSession) => void

const PROBE_TIMEOUT_MS = 1200   // per-host WebSocket probe timeout
const SCAN_BATCH_SIZE = 20      // concurrent probes at once
const SCAN_INTERVAL_MS = 30000  // re-scan every 30 s while listening

class UdpDiscovery {
  private broadcasting = false
  private listening = false
  private scanTimer: ReturnType<typeof setInterval> | null = null
  private onSessionFound: SessionFoundCallback | null = null
  private currentPort = 7400
  private currentSubnet = ''
  private scanAbortFlag = false

  // ── Host: broadcast (no-op in Expo Go — desktop handles UDP broadcast) ───

  startBroadcasting(_sessionCode: string, _port: number, _alias: string): void {
    this.broadcasting = true
    console.log('[Discovery] Mobile host broadcasting via WebSocket (UDP N/A in Expo Go)')
  }

  stopBroadcasting(): void {
    this.broadcasting = false
  }

  // ── Guest: discover hosts on LAN ─────────────────────────────────────────

  startListening(port: number, onFound: SessionFoundCallback, deviceIp?: string): void {
    if (this.listening) return
    this.listening = true
    this.scanAbortFlag = false
    this.onSessionFound = onFound
    this.currentPort = port

    // Derive subnet from device IP if provided
    if (deviceIp && deviceIp !== '0.0.0.0') {
      this.currentSubnet = this.deriveSubnet(deviceIp)
    }

    console.log(`[Discovery] Starting LAN scan on port ${port} (subnet: ${this.currentSubnet || 'unknown'})`)

    // Run first scan immediately, then on interval
    void this.runScan()
    this.scanTimer = setInterval(() => {
      void this.runScan()
    }, SCAN_INTERVAL_MS)
  }

  /** Call this whenever NetInfo gives us a new IP so the subnet stays current */
  updateDeviceIp(ip: string): void {
    if (!ip || ip === '0.0.0.0') return
    const subnet = this.deriveSubnet(ip)
    if (subnet !== this.currentSubnet) {
      this.currentSubnet = subnet
      console.log(`[Discovery] Subnet updated to ${subnet}.0/24`)
      // Re-scan with new subnet if we're actively listening
      if (this.listening) {
        this.scanAbortFlag = true
        setTimeout(() => {
          this.scanAbortFlag = false
          void this.runScan()
        }, 200)
      }
    }
  }

  stopListening(): void {
    this.listening = false
    this.scanAbortFlag = true
    this.onSessionFound = null
    if (this.scanTimer) {
      clearInterval(this.scanTimer)
      this.scanTimer = null
    }
    console.log('[Discovery] Stopped scanning')
  }

  // ── Probe a single host ───────────────────────────────────────────────────

  /**
   * Probe one IP address by attempting a WebSocket upgrade.
   * Returns a DiscoveredSession if a HiveBeats host answered, null otherwise.
   *
   * The desktop's HTTP server (socket.ts) responds to the WS upgrade request;
   * on successful open we immediately close (we only need to detect presence),
   * but if it sends us a WELCOME message we can capture the session code.
   */
  private async probeHost(ip: string, port: number): Promise<DiscoveredSession | null> {
    return new Promise<DiscoveredSession | null>((resolve) => {
      let settled = false
      const done = (result: DiscoveredSession | null) => {
        if (settled) return
        settled = true
        resolve(result)
      }

      const url = `ws://${ip}:${port}`
      let ws: WebSocket | null = null

      const timer = setTimeout(() => {
        try { ws?.close() } catch { /* ignore */ }
        done(null)
      }, PROBE_TIMEOUT_MS)

      try {
        ws = new WebSocket(url)

        let didOpen = false

        ws.onopen = () => {
          didOpen = true
          // Connection succeeded → HiveBeats host present.
          // Wait briefly for a WELCOME message to get the session code.
          setTimeout(() => {
            try { ws?.close() } catch { /* ignore */ }
          }, 600)
        }

        ws.onmessage = (event) => {
          clearTimeout(timer)
          try {
            const data = JSON.parse(String(event.data)) as Record<string, unknown>
            const code = String(data.sessionCode ?? data.code ?? '')
            done({
              sessionCode: code || `HOST@${ip}`,
              hostAddress: ip,
              port,
              source: 'udp',
              discoveredAt: Date.now(),
            })
          } catch {
            done({
              sessionCode: `HOST@${ip}`,
              hostAddress: ip,
              port,
              source: 'udp',
              discoveredAt: Date.now(),
            })
          }
          try { ws?.close() } catch { /* ignore */ }
        }

        ws.onclose = () => {
          clearTimeout(timer)
          if (didOpen) {
            done({
              sessionCode: `HOST@${ip}`,
              hostAddress: ip,
              port,
              source: 'udp',
              discoveredAt: Date.now(),
            })
          } else {
            done(null)
          }
        }

        ws.onerror = () => {
          clearTimeout(timer)
          try { ws?.close() } catch { /* ignore */ }
          done(null)
        }
      } catch {
        clearTimeout(timer)
        done(null)
      }
    })
  }

  // ── Full subnet scan ──────────────────────────────────────────────────────

  private async runScan(): Promise<void> {
    if (!this.listening || !this.onSessionFound) return

    const subnet = this.currentSubnet
    const port = this.currentPort

    if (!subnet) {
      console.log('[Discovery] No subnet known yet — waiting for network info')
      return
    }

    console.log(`[Discovery] Scanning ${subnet}.1–254 :${port}`)

    // Build candidate list: common gateway addresses first for speed
    const priorityHosts = [1, 254, 100, 101, 102, 200]
    const allHosts: number[] = [
      ...priorityHosts,
      ...Array.from({ length: 253 }, (_, i) => i + 1)
        .filter((n) => !priorityHosts.includes(n)),
    ]

    // Process in batches
    for (let i = 0; i < allHosts.length; i += SCAN_BATCH_SIZE) {
      if (this.scanAbortFlag || !this.listening) break

      const batch = allHosts.slice(i, i + SCAN_BATCH_SIZE)
      const results = await Promise.all(
        batch.map((n) => this.probeHost(`${subnet}.${n}`, port)),
      )

      for (const session of results) {
        if (session && this.onSessionFound) {
          console.log(`[Discovery] Found host at ${session.hostAddress}`)
          this.onSessionFound(session)
        }
      }
    }

    console.log('[Discovery] Scan complete')
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private deriveSubnet(ip: string): string {
    // Assume /24 — take first three octets
    const parts = ip.split('.')
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}`
    return ''
  }

  stopAll(): void {
    this.stopBroadcasting()
    this.stopListening()
  }

  isBroadcasting(): boolean { return this.broadcasting }
  isListening(): boolean { return this.listening }
}

export const udpDiscovery = new UdpDiscovery()
