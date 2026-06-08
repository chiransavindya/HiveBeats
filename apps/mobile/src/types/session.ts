export type PlaybackState = 'playing' | 'paused' | 'stopped'
export type SessionRole = 'host' | 'guest'
export type TabId = 'player' | 'queue' | 'playlists' | 'network' | 'settings'

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

export interface QueueRequest {
  id: string
  suggestion: string
  guestId: string
  guestAlias: string
  filePath?: string
}

export interface LogEntry {
  id: string
  message: string
  createdAt: number
}

export interface Playlist {
  id: string
  name: string
  tracks: Track[]
  createdAt: number
  updatedAt: number
}

export interface DiscoveredSession {
  sessionCode: string
  hostAddress: string
  port: number
  source: 'mdns' | 'udp'
  discoveredAt: number
}
