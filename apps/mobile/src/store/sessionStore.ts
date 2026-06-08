import { create } from 'zustand'
import type {
  DiscoveredSession,
  GuestDevice,
  LogEntry,
  Playlist,
  QueueRequest,
  SessionRole,
  TabId,
  Track,
} from '../types/session'
import {
  createId,
  generateDeviceAlias,
  generateSessionCode,
} from '../lib/formatters'
import {
  loadPlaylists,
  savePlaylists,
  type AppTheme,
} from '../lib/asyncStorage'
import { audioService } from '../services/audioService'
import { clockSync } from '../services/clockSync'
import { socketServer } from '../services/socketServer'
import { socketClient } from '../services/socketClient'
import { udpDiscovery } from '../services/udpDiscovery'

const HOST_PORT = 7400
const BROADCAST_PORT = 7401

// ─── State shape ─────────────────────────────────────────────────────────────

export interface SessionStore {
  // Identity
  deviceId: string
  deviceAlias: string

  // Session
  sessionCode: string
  role: SessionRole
  isSessionLive: boolean
  hostRunning: boolean
  guestConnected: boolean
  joinCodeInput: string

  // Host audio
  queue: Track[]
  currentQueueIndex: number
  selectedTrack: Track | null
  hostPlaying: boolean
  hostPositionMs: number
  hostDurationMs: number
  hostVolume: number
  hostMuted: boolean
  playbackRate: number

  // Guest audio
  guestTrackName: string
  guestPositionMs: number
  guestDurationMs: number
  guestVolume: number
  guestMuted: boolean
  guestStreamReady: boolean
  guestSyncReady: boolean

  // Network
  hostAddress: string
  connected: boolean
  connectionLabel: string
  guestList: GuestDevice[]
  discoveredSessions: DiscoveredSession[]
  clockOffsetMs: number

  // Network settings
  hostPortInput: string
  joinPortInput: string
  broadcastPortInput: string
  mdnsEnabled: boolean
  udpEnabled: boolean
  retryEnabled: boolean

  // Requests
  queueRequestsAllowed: boolean
  pendingQueueRequests: QueueRequest[]
  guestSuggestion: string

  // Playlists
  playlists: Playlist[]

  // Activity log
  logs: LogEntry[]

  // UI
  activeTab: TabId
  theme: AppTheme
  hostError: string | null
  guestError: string | null

  // ── Actions ─────────────────────────────────────────────────────────────

  // Session management
  regenerateCode: () => void
  setJoinCodeInput: (code: string) => void
  startHost: () => Promise<void>
  stopHost: () => Promise<void>
  joinSession: (code: string, hostIp: string) => Promise<void>
  leaveSession: () => Promise<void>
  endSession: () => Promise<void>

  // Audio — host
  addTracks: (tracks: Track[]) => void
  removeTrack: (index: number) => void
  loadTrackAtIndex: (index: number) => Promise<void>
  playHost: () => Promise<void>
  pauseHost: () => Promise<void>
  stopHost2: () => Promise<void>
  seekHost: (positionMs: number) => Promise<void>
  nextTrack: () => Promise<void>
  prevTrack: () => Promise<void>
  setHostVolume: (v: number) => void
  setHostMuted: (muted: boolean) => void
  setPlaybackRate: (rate: number) => void

  // Audio — guest
  setGuestVolume: (v: number) => void
  setGuestMuted: (muted: boolean) => void

  // Internal audio state updaters (called from audioService callbacks)
  _setHostPosition: (ms: number) => void
  _setHostDuration: (ms: number) => void
  _setHostPlaying: (playing: boolean) => void

  // Playlists
  loadPlaylistsFromStorage: () => Promise<void>
  createPlaylist: (name: string) => Promise<void>
  deletePlaylist: (id: string) => Promise<void>
  loadPlaylist: (playlist: Playlist) => Promise<void>
  saveQueueAsPlaylist: (playlistId: string) => Promise<void>
  addTrackToPlaylist: (playlistId: string, track: Track) => Promise<void>

  // Queue requests
  setQueueRequestsAllowed: (allowed: boolean) => void
  setGuestSuggestion: (s: string) => void
  submitGuestRequest: (suggestion: string, filePath?: string) => Promise<void>
  approveRequest: (requestId: string) => void
  denyRequest: (requestId: string) => void

  // Network settings
  setHostPortInput: (v: string) => void
  setJoinPortInput: (v: string) => void
  setBroadcastPortInput: (v: string) => void
  setMdnsEnabled: (v: boolean) => void
  setUdpEnabled: (v: boolean) => void
  setRetryEnabled: (v: boolean) => void

  // Network state (updated by NetInfo)
  setNetworkState: (connected: boolean, label: string, address: string) => void

  // Discovered sessions
  addDiscoveredSession: (session: DiscoveredSession) => void
  clearDiscoveredSessions: () => void

  // Guests
  addGuest: (guest: GuestDevice) => void
  removeGuest: (deviceId: string) => void

  // Log
  pushLog: (message: string) => void

  // UI
  setActiveTab: (tab: TabId) => void
  setTheme: (theme: AppTheme) => void
  clearHostError: () => void
  clearGuestError: () => void
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useSessionStore = create<SessionStore>((set, get) => {
  const pushLog = (message: string) => {
    set((s) => ({
      logs: [
        { id: createId('log'), message, createdAt: Date.now() },
        ...s.logs,
      ].slice(0, 20),
    }))
  }

  return {
    // Identity
    deviceId: createId('mobile'),
    deviceAlias: generateDeviceAlias(),

    // Session defaults
    sessionCode: generateSessionCode(),
    role: 'host',
    isSessionLive: false,
    hostRunning: false,
    guestConnected: false,
    joinCodeInput: '',

    // Host audio defaults
    queue: [],
    currentQueueIndex: -1,
    selectedTrack: null,
    hostPlaying: false,
    hostPositionMs: 0,
    hostDurationMs: 0,
    hostVolume: 1,
    hostMuted: false,
    playbackRate: 1,

    // Guest audio defaults
    guestTrackName: '',
    guestPositionMs: 0,
    guestDurationMs: 0,
    guestVolume: 0.9,
    guestMuted: false,
    guestStreamReady: false,
    guestSyncReady: false,

    // Network defaults
    hostAddress: '0.0.0.0',
    connected: false,
    connectionLabel: 'Checking network...',
    guestList: [],
    discoveredSessions: [],
    clockOffsetMs: 0,

    // Network settings
    hostPortInput: String(HOST_PORT),
    joinPortInput: String(HOST_PORT),
    broadcastPortInput: String(BROADCAST_PORT),
    mdnsEnabled: true,
    udpEnabled: true,
    retryEnabled: true,

    // Requests
    queueRequestsAllowed: true,
    pendingQueueRequests: [],
    guestSuggestion: '',

    // Playlists / log / UI
    playlists: [],
    logs: [],
    activeTab: 'player',
    theme: 'system',
    hostError: null,
    guestError: null,

    // ── Session management ─────────────────────────────────────────────────

    regenerateCode: () => {
      set({ sessionCode: generateSessionCode() })
    },

    setJoinCodeInput: (code) => set({ joinCodeInput: code }),

    startHost: async () => {
      const { hostPortInput, sessionCode, deviceAlias } = get()
      const port = Number(hostPortInput) || HOST_PORT
      try {
        await socketServer.start(port)
        if (get().udpEnabled) {
          udpDiscovery.startBroadcasting(sessionCode, port, deviceAlias)
        }
        set({ hostRunning: true, isSessionLive: true, role: 'host', hostError: null })
        pushLog(`Hosting session ${sessionCode} on port ${port}`)
      } catch (err) {
        set({ hostError: `Failed to start host: ${err}` })
      }
    },

    stopHost: async () => {
      await socketServer.stop()
      udpDiscovery.stopBroadcasting()
      await audioService.stop()
      set({
        hostRunning: false,
        isSessionLive: false,
        hostPlaying: false,
        guestList: [],
        selectedTrack: null,
        currentQueueIndex: -1,
        hostPositionMs: 0,
        hostDurationMs: 0,
      })
      pushLog('Stopped hosting')
    },

    joinSession: async (code, hostIp) => {
      const { joinPortInput, deviceAlias } = get()
      const port = Number(joinPortInput) || HOST_PORT
      try {
        await socketClient.connect(hostIp, port, deviceAlias)
        set({
          sessionCode: code,
          role: 'guest',
          guestConnected: true,
          isSessionLive: true,
          guestError: null,
        })
        pushLog(`Joined session ${code} at ${hostIp}:${port}`)
      } catch (err) {
        set({ guestError: `Failed to join: ${err}` })
      }
    },

    leaveSession: async () => {
      await socketClient.disconnect()
      await audioService.stop()
      clockSync.reset()
      set({
        guestConnected: false,
        isSessionLive: false,
        guestTrackName: '',
        guestPositionMs: 0,
        guestDurationMs: 0,
        guestStreamReady: false,
        guestSyncReady: false,
        clockOffsetMs: 0,
      })
      pushLog('Left session')
    },

    endSession: async () => {
      const { role } = get()
      if (role === 'host') {
        await get().stopHost()
      } else {
        await get().leaveSession()
      }
    },

    // ── Audio — host ───────────────────────────────────────────────────────

    addTracks: (tracks) => {
      set((s) => ({ queue: [...s.queue, ...tracks] }))
      pushLog(`Added ${tracks.length} track${tracks.length !== 1 ? 's' : ''} to queue`)
    },

    removeTrack: (index) => {
      set((s) => {
        const next = s.queue.filter((_, i) => i !== index)
        const newIndex =
          index === s.currentQueueIndex
            ? -1
            : index < s.currentQueueIndex
            ? s.currentQueueIndex - 1
            : s.currentQueueIndex
        return { queue: next, currentQueueIndex: newIndex }
      })
    },

    loadTrackAtIndex: async (index) => {
      const { queue, hostVolume } = get()
      const track = queue[index]
      if (!track?.filePath) return
      await audioService.load(track.filePath, false, hostVolume)
      set({ selectedTrack: track, currentQueueIndex: index, hostPlaying: false })
      pushLog(`Loaded: ${track.title}`)
    },

    playHost: async () => {
      const { selectedTrack, queue, hostVolume } = get()
      if (!selectedTrack && queue[0]) {
        await get().loadTrackAtIndex(0)
      }
      try {
        await audioService.play()
        set({ hostPlaying: true })
        pushLog(`Playing: ${get().selectedTrack?.title ?? ''}`)
        // Broadcast CMD_PLAY to guests
        await socketServer.broadcast({
          type: 'CMD_PLAY',
          trackId: get().selectedTrack?.id,
          playAt: Date.now() + 500,
          positionMs: get().hostPositionMs,
        })
      } catch {
        set({ hostError: 'Unable to start playback. Try again.' })
      }
    },

    pauseHost: async () => {
      await audioService.pause()
      set({ hostPlaying: false })
      await socketServer.broadcast({
        type: 'CMD_PAUSE',
        pauseAt: Date.now() + 80,
        positionMs: get().hostPositionMs,
      })
      pushLog('Paused')
    },

    stopHost2: async () => {
      await audioService.stop()
      set({ hostPlaying: false, hostPositionMs: 0 })
    },

    seekHost: async (positionMs) => {
      await audioService.seek(positionMs)
      set({ hostPositionMs: positionMs })
      await socketServer.broadcast({
        type: 'CMD_SEEK',
        positionMs,
        playAt: Date.now() + 500,
      })
    },

    nextTrack: async () => {
      const { currentQueueIndex, queue } = get()
      const next = currentQueueIndex + 1
      if (next < queue.length) {
        await get().loadTrackAtIndex(next)
        await get().playHost()
      }
    },

    prevTrack: async () => {
      const { currentQueueIndex } = get()
      if (currentQueueIndex > 0) {
        await get().loadTrackAtIndex(currentQueueIndex - 1)
        await get().playHost()
      } else {
        await audioService.seek(0)
        set({ hostPositionMs: 0 })
      }
    },

    setHostVolume: (v) => {
      set({ hostVolume: v })
      void audioService.setVolume(v)
    },

    setHostMuted: (muted) => {
      set({ hostMuted: muted })
      void audioService.setMuted(muted)
    },

    setPlaybackRate: (rate) => {
      set({ playbackRate: rate })
      void audioService.setRate(rate)
    },

    // ── Audio — guest ──────────────────────────────────────────────────────

    setGuestVolume: (v) => {
      set({ guestVolume: v })
      void audioService.setVolume(v)
    },

    setGuestMuted: (muted) => {
      set({ guestMuted: muted })
      void audioService.setMuted(muted)
    },

    // ── Internal audio updaters ────────────────────────────────────────────

    _setHostPosition: (ms) => set({ hostPositionMs: ms }),
    _setHostDuration: (ms) => set({ hostDurationMs: ms }),
    _setHostPlaying: (playing) => set({ hostPlaying: playing }),

    // ── Playlists ──────────────────────────────────────────────────────────

    loadPlaylistsFromStorage: async () => {
      const playlists = await loadPlaylists()
      set({ playlists })
    },

    createPlaylist: async (name) => {
      const playlist: Playlist = {
        id: createId('playlist'),
        name,
        tracks: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      const playlists = [...get().playlists, playlist]
      set({ playlists })
      await savePlaylists(playlists)
      pushLog(`Created playlist "${name}"`)
    },

    deletePlaylist: async (id) => {
      const playlists = get().playlists.filter((p) => p.id !== id)
      set({ playlists })
      await savePlaylists(playlists)
      pushLog('Playlist deleted')
    },

    loadPlaylist: async (playlist) => {
      set({ queue: playlist.tracks, currentQueueIndex: playlist.tracks.length > 0 ? 0 : -1 })
      if (playlist.tracks[0]) await get().loadTrackAtIndex(0)
      pushLog(`Loaded playlist "${playlist.name}"`)
    },

    saveQueueAsPlaylist: async (playlistId) => {
      const { playlists, queue } = get()
      const updated = playlists.map((p) =>
        p.id === playlistId ? { ...p, tracks: [...queue], updatedAt: Date.now() } : p,
      )
      set({ playlists: updated })
      await savePlaylists(updated)
      const name = playlists.find((p) => p.id === playlistId)?.name ?? ''
      pushLog(`Saved queue to "${name}"`)
    },

    addTrackToPlaylist: async (playlistId, track) => {
      const { playlists } = get()
      const updated = playlists.map((p) =>
        p.id === playlistId
          ? { ...p, tracks: [...p.tracks, track], updatedAt: Date.now() }
          : p,
      )
      set({ playlists: updated })
      await savePlaylists(updated)
    },

    // ── Queue requests ─────────────────────────────────────────────────────

    setQueueRequestsAllowed: (allowed) => set({ queueRequestsAllowed: allowed }),
    setGuestSuggestion: (s) => set({ guestSuggestion: s }),

    submitGuestRequest: async (suggestion, filePath) => {
      const { deviceAlias } = get()
      const requestId = createId('req')
      await socketClient.sendToHost({
        type: 'QUEUE_REQUEST',
        requestId,
        suggestion,
        guestAlias: deviceAlias,
        filePath,
      })
      pushLog(`Requested: "${suggestion}"`)
    },

    approveRequest: (requestId) => {
      set((s) => ({
        pendingQueueRequests: s.pendingQueueRequests.filter((r) => r.id !== requestId),
      }))
      void socketServer.sendToGuest(requestId, { type: 'QUEUE_APPROVED', requestId })
    },

    denyRequest: (requestId) => {
      set((s) => ({
        pendingQueueRequests: s.pendingQueueRequests.filter((r) => r.id !== requestId),
      }))
      void socketServer.sendToGuest(requestId, { type: 'QUEUE_DENIED', requestId })
    },

    // ── Network settings ───────────────────────────────────────────────────

    setHostPortInput: (v) => set({ hostPortInput: v }),
    setJoinPortInput: (v) => set({ joinPortInput: v }),
    setBroadcastPortInput: (v) => set({ broadcastPortInput: v }),
    setMdnsEnabled: (v) => set({ mdnsEnabled: v }),
    setUdpEnabled: (v) => set({ udpEnabled: v }),
    setRetryEnabled: (v) => set({ retryEnabled: v }),

    // ── Network state ──────────────────────────────────────────────────────

    setNetworkState: (connected, label, address) => {
      set({ connected, connectionLabel: label, hostAddress: address })
    },

    // ── Discovered sessions ────────────────────────────────────────────────

    addDiscoveredSession: (session) => {
      set((s) => {
        const existing = s.discoveredSessions.findIndex(
          (d) => d.sessionCode === session.sessionCode,
        )
        if (existing >= 0) {
          const updated = [...s.discoveredSessions]
          updated[existing] = session
          return { discoveredSessions: updated }
        }
        return { discoveredSessions: [...s.discoveredSessions, session] }
      })
    },

    clearDiscoveredSessions: () => set({ discoveredSessions: [] }),

    // ── Guests ─────────────────────────────────────────────────────────────

    addGuest: (guest) => {
      set((s) => ({ guestList: [...s.guestList, guest] }))
      pushLog(`${guest.alias} joined the session`)
    },

    removeGuest: (deviceId) => {
      set((s) => ({
        guestList: s.guestList.filter((g) => g.deviceId !== deviceId),
      }))
      pushLog('Guest removed')
    },

    // ── Log ────────────────────────────────────────────────────────────────

    pushLog,

    // ── UI ─────────────────────────────────────────────────────────────────

    setActiveTab: (tab) => set({ activeTab: tab }),
    setTheme: (theme) => set({ theme }),
    clearHostError: () => set({ hostError: null }),
    clearGuestError: () => set({ guestError: null }),
  }
})
