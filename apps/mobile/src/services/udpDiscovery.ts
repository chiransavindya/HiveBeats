/**
 * LAN discovery service for HiveBeats mobile.
 *
 * Expo Go cannot receive raw UDP broadcasts, so mobile discovery probes the
 * local subnet with WebSocket handshakes against the desktop host port.
 */

import type { DiscoveredSession } from '../types/session'

type SessionFoundCallback = (session: DiscoveredSession) => void

const PROBE_TIMEOUT_MS = 900
const SCAN_BATCH_SIZE = 6
const SCAN_INTERVAL_MS = 60000

class UdpDiscovery {
  private broadcasting = false
  private listening = false
  private scanTimer: ReturnType<typeof setInterval> | null = null
  private onSessionFound: SessionFoundCallback | null = null
  private currentPort = 7400
  private currentSubnet = ''
  private scanAbortFlag = false
  private scanInProgress = false
  private activeSockets = new Set<WebSocket>()

  startBroadcasting(_sessionCode: string, _port: number, _alias: string): void {
    this.broadcasting = true
    console.log('[Discovery] Mobile host broadcasting via WebSocket (UDP N/A in Expo Go)')
  }

  stopBroadcasting(): void {
    this.broadcasting = false
  }

  startListening(port: number, onFound: SessionFoundCallback, deviceIp?: string): void {
    if (this.listening) return
    this.listening = true
    this.scanAbortFlag = false
    this.onSessionFound = onFound
    this.currentPort = port

    if (deviceIp && deviceIp !== '0.0.0.0') {
      this.currentSubnet = this.deriveSubnet(deviceIp)
    }

    console.log(`[Discovery] Starting LAN scan on port ${port} (subnet: ${this.currentSubnet || 'unknown'})`)

    void this.runScan()
    this.scanTimer = setInterval(() => {
      void this.runScan()
    }, SCAN_INTERVAL_MS)
  }

  updateDeviceIp(ip: string): void {
    if (!ip || ip === '0.0.0.0') return
    const subnet = this.deriveSubnet(ip)
    if (subnet !== this.currentSubnet) {
      this.currentSubnet = subnet
      console.log(`[Discovery] Subnet updated to ${subnet}.0/24`)
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
    for (const socket of this.activeSockets) {
      try { socket.close() } catch { /* ignore */ }
    }
    this.activeSockets.clear()
    if (this.scanTimer) {
      clearInterval(this.scanTimer)
      this.scanTimer = null
    }
    console.log('[Discovery] Stopped scanning')
  }

  private async probeHost(ip: string, port: number): Promise<DiscoveredSession | null> {
    return new Promise<DiscoveredSession | null>((resolve) => {
      let settled = false
      let ws: WebSocket | null = null

      const done = (result: DiscoveredSession | null) => {
        if (settled) return
        settled = true
        if (ws) this.activeSockets.delete(ws)
        resolve(result)
      }

      const closeProbeSocket = () => {
        if (ws) this.activeSockets.delete(ws)
        try { ws?.close() } catch { /* ignore */ }
      }

      const timer = setTimeout(() => {
        closeProbeSocket()
        done(null)
      }, PROBE_TIMEOUT_MS)

      try {
        ws = new WebSocket(`ws://${ip}:${port}`)
        this.activeSockets.add(ws)

        let didOpen = false

        ws.onopen = () => {
          didOpen = true
          try {
            ws?.send(JSON.stringify({ type: 'HELLO', alias: 'Scanner', deviceId: 'scanner' }))
          } catch { /* ignore */ }

          setTimeout(closeProbeSocket, 500)
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
          closeProbeSocket()
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
          closeProbeSocket()
          done(null)
        }
      } catch {
        clearTimeout(timer)
        closeProbeSocket()
        done(null)
      }
    })
  }

  private async runScan(): Promise<void> {
    if (!this.listening || !this.onSessionFound || this.scanInProgress) return
    this.scanInProgress = true

    try {
      const subnet = this.currentSubnet
      const port = this.currentPort

      const localResult = await this.probeHost('127.0.0.1', port)
      if (localResult && this.onSessionFound) {
        console.log(`[Discovery] Found host at ${localResult.hostAddress} (localhost)`)
        this.onSessionFound(localResult)
        return
      }

      if (!subnet) {
        console.log('[Discovery] No subnet known yet - skipping LAN scan')
        return
      }

      console.log(`[Discovery] Scanning ${subnet}.1-254 :${port}`)

      const priorityHosts = [1, 254, 100, 101, 102, 200]
      const allHosts: number[] = [
        ...priorityHosts,
        ...Array.from({ length: 253 }, (_, i) => i + 1)
          .filter((n) => !priorityHosts.includes(n)),
      ]

      for (let i = 0; i < allHosts.length; i += SCAN_BATCH_SIZE) {
        if (this.scanAbortFlag || !this.listening) break

        const hostsToProbe = allHosts
          .slice(i, i + SCAN_BATCH_SIZE)
          .map((n) => `${subnet}.${n}`)

        const results = await Promise.all(
          hostsToProbe.map((ip) => this.probeHost(ip, port)),
        )

        for (const session of results) {
          if (session && this.onSessionFound) {
            console.log(`[Discovery] Found host at ${session.hostAddress}`)
            this.onSessionFound(session)
            return
          }
        }
      }

      console.log('[Discovery] Scan complete')
    } finally {
      this.scanInProgress = false
    }
  }

  private deriveSubnet(ip: string): string {
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
