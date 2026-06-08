import { Audio } from 'expo-av'

export type AudioStatusCallback = (status: {
  isLoaded: boolean
  isPlaying: boolean
  positionMs: number
  durationMs: number
  didJustFinish: boolean
}) => void

class AudioService {
  private sound: Audio.Sound | null = null
  private statusCallback: AudioStatusCallback | null = null

  // ── Configure audio session ───────────────────────────────────────────────

  async configure(): Promise<void> {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    })
  }

  // ── Status listener ───────────────────────────────────────────────────────

  onStatusUpdate(callback: AudioStatusCallback): void {
    this.statusCallback = callback
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleStatus = (status: any) => {
    if (!this.statusCallback) return
    if (status.isLoaded) {
      this.statusCallback({
        isLoaded: true,
        isPlaying: status.isPlaying,
        positionMs: status.positionMillis,
        durationMs: status.durationMillis ?? 0,
        didJustFinish: status.didJustFinish,
      })
    } else {
      this.statusCallback({
        isLoaded: false,
        isPlaying: false,
        positionMs: 0,
        durationMs: 0,
        didJustFinish: false,
      })
    }
  }

  // ── Load track ────────────────────────────────────────────────────────────

  async load(uri: string, shouldPlay: boolean, volume: number): Promise<{ durationMs: number }> {
    await this.unload()

    const { sound, status } = await Audio.Sound.createAsync(
      { uri },
      {
        shouldPlay,
        volume,
        progressUpdateIntervalMillis: 300,
      },
    )

    sound.setOnPlaybackStatusUpdate(this.handleStatus)
    this.sound = sound

    const durationMs = status.isLoaded ? (status.durationMillis ?? 0) : 0
    return { durationMs }
  }

  // ── Transport ─────────────────────────────────────────────────────────────

  async play(): Promise<void> {
    await this.sound?.playAsync()
  }

  async pause(): Promise<void> {
    await this.sound?.pauseAsync()
  }

  async stop(): Promise<void> {
    await this.sound?.stopAsync()
  }

  async seek(positionMs: number): Promise<void> {
    await this.sound?.setPositionAsync(positionMs)
  }

  // ── Volume ────────────────────────────────────────────────────────────────

  async setVolume(volume: number): Promise<void> {
    await this.sound?.setVolumeAsync(Math.max(0, Math.min(1, volume)))
  }

  async setMuted(muted: boolean): Promise<void> {
    await this.sound?.setIsMutedAsync(muted)
  }

  // ── Playback rate ─────────────────────────────────────────────────────────

  async setRate(rate: number): Promise<void> {
    await this.sound?.setRateAsync(rate, true)
  }

  // ── Unload ────────────────────────────────────────────────────────────────

  async unload(): Promise<void> {
    const s = this.sound
    this.sound = null
    if (s) {
      try {
        await s.unloadAsync()
      } catch {
        // ignore
      }
    }
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  isLoaded(): boolean {
    return this.sound !== null
  }
}

// Singleton instance
export const audioService = new AudioService()
