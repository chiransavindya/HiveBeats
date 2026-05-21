export type PlaybackState = 'playing' | 'paused' | 'stopped'

export interface Track {
  id: string
  title: string
  artist?: string
  durationMs: number
  filePath?: string
  mimeType: string
}

export interface GuestDevice {
  deviceId: string
  alias: string
  isActive: boolean
  joinedAt: number
}

export interface Session {
  sessionId: string
  sessionCode: string
  hostDeviceId: string
  hostIpAddress: string
  hostPort: number
  playbackState: PlaybackState
  currentTrack: Track | null
  playbackPositionMs: number
  queue: Track[]
  guests: GuestDevice[]
  createdAt: number
}
