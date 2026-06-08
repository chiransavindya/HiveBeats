/**
 * NTP-style clock synchronization.
 * Measures the offset between local device clock and host clock
 * so scheduled play/pause commands fire at the correct local time.
 *
 * Usage:
 *   clockSync.synchronize(sendPing)  — call on join
 *   clockSync.toLocalTime(serverMs)  — converts host timestamp to local
 *   clockSync.toServerTime(localMs)  — converts local timestamp to host
 */

export type PingFn = () => Promise<{ t1: number; t2: number; t3: number }>

class ClockSync {
  private offset: number = 0  // local_time + offset ≈ server_time
  private synced: boolean = false

  // ── Synchronize via NTP round-trip ────────────────────────────────────────

  async synchronize(sendPing: PingFn): Promise<void> {
    try {
      const t0 = Date.now()
      const { t1, t2, t3 } = await sendPing()
      const t4 = Date.now()

      // NTP offset formula: offset = ((t1 - t0) + (t2 - t3)) / 2
      this.offset = ((t1 - t0) + (t2 - t3)) / 2
      this.synced = true

      const rtt = (t4 - t0) - (t3 - t2)
      console.log(`[ClockSync] offset=${this.offset.toFixed(1)}ms rtt=${rtt.toFixed(1)}ms`)
    } catch (err) {
      console.warn('[ClockSync] sync failed:', err)
      this.offset = 0
      this.synced = false
    }
  }

  // ── Simulate sync with a known offset (used when host broadcasts offset) ──

  applyOffset(offsetMs: number): void {
    this.offset = offsetMs
    this.synced = true
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  reset(): void {
    this.offset = 0
    this.synced = false
  }

  // ── Conversions ───────────────────────────────────────────────────────────

  /** Convert local timestamp to estimated server (host) time */
  toServerTime(localMs: number): number {
    return localMs + this.offset
  }

  /** Convert server (host) timestamp to local time */
  toLocalTime(serverMs: number): number {
    return serverMs - this.offset
  }

  /** Schedule a callback at a server timestamp, accounting for clock offset */
  scheduleAt(serverMs: number, callback: () => void): ReturnType<typeof setTimeout> {
    const localMs = this.toLocalTime(serverMs)
    const delay = Math.max(0, localMs - Date.now())
    return setTimeout(callback, delay)
  }

  getOffset(): number {
    return this.offset
  }

  isSynced(): boolean {
    return this.synced
  }
}

export const clockSync = new ClockSync()
