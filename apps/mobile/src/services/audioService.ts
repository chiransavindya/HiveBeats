/**
 * AudioService — wraps expo-audio (SDK 53+ replacement for expo-av).
 *
 * expo-audio uses the 'ExpoAudio' native module (registered in Expo Go SDK 55)
 * instead of the legacy 'ExponentAV' native module (expo-av) which is no longer
 * reliably available in the current Expo Go build.
 *
 * Key differences from expo-av:
 *   - All time values are in SECONDS (not milliseconds)
 *   - Imperative API via createAudioPlayer / player.addListener
 *   - setAudioModeAsync → setAudioModeAsync from 'expo-audio' (different shape)
 */

import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio'

// ── Public callback type ─────────────────────────────────────────────────────
// We keep the public interface in milliseconds so callers don't need to change.

export type AudioStatusCallback = (status: {
  isLoaded: boolean
  isPlaying: boolean
  isBuffering: boolean
  positionMs: number
  durationMs: number
  didJustFinish: boolean
}) => void

class AudioService {
  private player: AudioPlayer | null = null
  private statusCallback: AudioStatusCallback | null = null
  private configured = false
  private lastStatus: AudioStatus | null = null

  // ── Configure audio session (call once on app start) ──────────────────────

  async configure(): Promise<void> {
    if (this.configured) return
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'mixWithOthers',
      })
      this.configured = true
    } catch (err) {
      console.warn('[AudioService] configure failed:', err)
    }
  }

  // ── Status listener ───────────────────────────────────────────────────────

  onStatusUpdate(callback: AudioStatusCallback): void {
    this.statusCallback = callback
  }

  private handleStatus = (status: AudioStatus) => {
    if (!this.statusCallback) return
    const prevFinished = this.lastStatus?.didJustFinish ?? false
    this.lastStatus = status

    this.statusCallback({
      isLoaded: status.isLoaded,
      isPlaying: status.playing,
      isBuffering: status.isBuffering,
      positionMs: Math.round((status.currentTime ?? 0) * 1000),
      durationMs: Math.round((status.duration ?? 0) * 1000),
      didJustFinish: !prevFinished && (status.didJustFinish ?? false),
    })
  }

  // ── Load track ────────────────────────────────────────────────────────────

  async load(uri: string, shouldPlay: boolean, volume: number): Promise<{ durationMs: number }> {
    // Destroy old player before creating new one
    await this.unload()

    this.player = createAudioPlayer(
      { uri },
      {
        preferredForwardBufferDuration: 5,
        updateInterval: 500,
      },
    )

    // Set initial volume
    this.player.volume = volume

    const player = this.player

    return new Promise<{ durationMs: number }>((resolve, reject) => {
      let settled = false
      const settleLoaded = () => {
        if (settled || this.player !== player) return
        settled = true
        if (shouldPlay) player.play()
        resolve({ durationMs: Math.round((player.duration ?? 0) * 1000) })
      }
      const settleFailed = (message: string) => {
        if (settled || this.player !== player) return
        settled = true
        reject(new Error(message))
      }

      const timeout = setTimeout(() => {
        settleFailed(`Timed out loading audio stream: ${uri}`)
      }, 15000)

      // Subscribe to status updates. The listener is cleaned up by player.remove().
      player.addListener('playbackStatusUpdate', (status) => {
        this.handleStatus(status)

        if (status.isLoaded) {
          clearTimeout(timeout)
          settleLoaded()
        }
      })
    })
  }

  // ── Transport ─────────────────────────────────────────────────────────────

  async play(): Promise<void> {
    this.player?.play()
  }

  async pause(): Promise<void> {
    this.player?.pause()
  }

  async stop(): Promise<void> {
    this.player?.pause()
    if (this.player) {
      await this.player.seekTo(0)
    }
  }

  async seek(positionMs: number): Promise<void> {
    if (this.player) {
      await this.player.seekTo(positionMs / 1000)
    }
  }

  // ── Volume ────────────────────────────────────────────────────────────────

  async setVolume(volume: number): Promise<void> {
    if (this.player) {
      this.player.volume = Math.max(0, Math.min(1, volume))
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    if (this.player) {
      this.player.muted = muted
    }
  }

  // ── Playback rate ─────────────────────────────────────────────────────────

  async setRate(rate: number): Promise<void> {
    if (this.player) {
      this.player.playbackRate = rate
    }
  }

  // ── Unload ────────────────────────────────────────────────────────────────

  async unload(): Promise<void> {
    const p = this.player
    this.player = null
    this.lastStatus = null
    if (p) {
      try {
        p.pause()
        p.remove()
      } catch {
        // ignore cleanup errors
      }
    }
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  isLoaded(): boolean {
    return this.player !== null
  }

  isPlaying(): boolean {
    return this.player?.playing ?? false
  }

  getCurrentPositionMs(): number {
    return Math.round((this.player?.currentTime ?? 0) * 1000)
  }

  getDurationMs(): number {
    return Math.round((this.player?.duration ?? 0) * 1000)
  }
}

// Singleton — expo-audio doesn't call requireNativeModule at import time.
// AudioPlayer instances are created lazily via createAudioPlayer().
export const audioService = new AudioService()
