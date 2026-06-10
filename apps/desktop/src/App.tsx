import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { generateSessionCode } from './lib/sessionCode'
import { getAllPlaylists, savePlaylist, deletePlaylist } from './lib/db'
import type { Playlist, PlaylistTrack } from './lib/db'
import type { MdnsSessionAnnouncement } from './types/mdns'
import type {
  HostHelloMessage,
  HostWelcomeMessage,
  SocketMessagePayload,
  SocketStatusPayload,
} from './types/socket'
import type { UdpAnnouncement } from './types/udp'
import type {
  PauseCommandMessage,
  PlayCommandMessage,
  ReadyAckMessage,
  ReadyRequestMessage,
  SeekCommandMessage,
  StreamMessage,
  SyncPingMessage,
  SyncPongMessage,
} from './types/streaming'
import { QRCodeSVG } from 'qrcode.react'
import './App.css'

// ─── Types ────────────────────────────────────────────────────────────────────

type DiscoveredSession = {
  source: 'mdns' | 'udp'
  name: string
  host?: string
  port: number
  addresses: string[]
  sessionCode?: string
}

type GuestInfo = {
  id: string
  alias: string
  address: string
  ready: boolean
}

type LogEntry = {
  id: string
  message: string
}

type TrackSelection = PlaylistTrack

type ExtendedPlayCommand = PlayCommandMessage & { seq: number; epoch: number }
type ExtendedPauseCommand = PauseCommandMessage & { seq: number; epoch: number }
type ExtendedSeekCommand = SeekCommandMessage & { seq: number; epoch: number }

// Queue request system
type QueueRequest = {
  id: string
  suggestion: string
  guestId: string
  guestAlias: string
  filePath?: string
}

type QueueSocketMsg =
  | { type: 'QUEUE_REQUEST'; requestId: string; suggestion: string; guestAlias: string; filePath?: string }
  | { type: 'QUEUE_APPROVED'; requestId: string }
  | { type: 'QUEUE_DENIED'; requestId: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 5000
const HOST_PLAY_DELAY_MS = 2000
const HOST_PAUSE_DELAY_MS = 80
const GUEST_READY_BUFFER_SECONDS = 2.5
const GUEST_READY_POSITION_TOLERANCE_SECONDS = 0.15
const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconPlay = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z" /></svg>
)
const IconPause = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
)
const IconStop = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z" /></svg>
)
const IconSkipNext = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z" /></svg>
)
const IconSkipPrev = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6l-8.5 6zm2 2.14V9.86L14.97 12 11.5 14.14z" /></svg>
)
const IconVolumeFull = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
)
const IconVolumeMute = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
)
const IconMusic = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
)
const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
)
const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
)
const IconQueue = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" /></svg>
)
const IconList = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" /></svg>
)
const IconSettings = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" /></svg>
)
const IconWifi = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" /></svg>
)
const IconDisconnect = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.78 19.78L18 18l-2-2-5-5-2-2L7.22 7.22 4.05 4.05 2.64 2.64 1.39 3.9l1.57 1.57C2.35 6.47 2 7.69 2 9c0 4.97 3.06 9.24 7.44 11l.56-1.38C6.28 17.15 4 13.27 4 9c0-1.07.19-2.09.54-3.04l1.57 1.57C5.39 8.25 5 9.09 5 10c0 3.31 2.69 6 6 6 .91 0 1.75-.22 2.5-.6l1.47 1.47C13.77 17.57 12.43 18 11 18c-1.32 0-2.54-.36-3.59-.97l-.96 1.69C7.84 19.53 9.36 20 11 20c1.82 0 3.52-.52 4.96-1.42L17.6 20.2l1.26-1.26-.08-.08zM11 4c2.76 0 5 2.24 5 5 0 .56-.1 1.1-.26 1.62l1.51 1.51C17.71 11.43 18 10.25 18 9c0-3.87-3.13-7-7-7-2.15 0-4.07.97-5.38 2.5l1.44 1.44C8.06 4.68 9.46 4 11 4zm5.95 12.83l1.44 1.44C20.22 16.69 21 14.93 21 13c0-2.98-1.66-5.58-4.12-6.93l-.82 1.74C17.94 8.87 19 10.82 19 13c0 1.41-.49 2.71-1.3 3.74l-.75-.75z" /></svg>
)
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>
)
const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" /></svg>
)
const IconSend = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
)
const IconHeadphones = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1C5.93 1 1 5.93 1 12v7c0 1.1.9 2 2 2h1c1.1 0 2-.9 2-2v-3c0-1.1-.9-2-2-2H3v-2c0-4.97 4.03-9 9-9s9 4.03 9 9v2h-1c-1.1 0-2 .9-2 2v3c0 1.1.9 2 2 2h1c1.1 0 2-.9 2-2v-7c0-6.07-4.93-11-11-11z" /></svg>
)

// ─── Main App ─────────────────────────────────────────────────────────────────

type SidebarView = 'player' | 'queue' | 'playlists' | 'network' | 'settings'

function App() {
  // ── Session state ──────────────────────────────────────────────────────────
  const [sessionCode, setSessionCode] = useState(() => generateSessionCode())
  const [mdnsDiscovered, setMdnsDiscovered] = useState<MdnsSessionAnnouncement[]>([])
  const [udpDiscovered, setUdpDiscovered] = useState<UdpAnnouncement[]>([])
  const [manualHost, setManualHost] = useState('')
  const [hostRunning, setHostRunning] = useState(false)
  const [guestConnected, setGuestConnected] = useState(false)
  const [guestHostId, setGuestHostId] = useState('')
  const [guestList, setGuestList] = useState<GuestInfo[]>([])
  const [localIp, setLocalIp] = useState<string>('127.0.0.1')
  const [hostError, setHostError] = useState<string | null>(null)
  const [guestError, setGuestError] = useState<string | null>(null)
  const [udpError, setUdpError] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isDragging, setIsDragging] = useState(false)

  // ── Host audio state ───────────────────────────────────────────────────────
  const [selectedTrack, setSelectedTrack] = useState<TrackSelection | null>(null)
  const [streamingTrackId, setStreamingTrackId] = useState<string | null>(null)
  const [hostPlaying, setHostPlaying] = useState(false)
  const [hostDurationMs, setHostDurationMs] = useState(0)
  const [hostPositionMs, setHostPositionMs] = useState(0)
  const [hostVolume, setHostVolume] = useState(1)
  const [hostMuted, setHostMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)

  // ── Guest audio state ──────────────────────────────────────────────────────
  const [guestTrackId, setGuestTrackId] = useState<string | null>(null)
  const [guestTrackName, setGuestTrackName] = useState('')
  const [guestPositionMs, setGuestPositionMs] = useState(0)
  const [guestDurationMs, setGuestDurationMs] = useState(0)
  const [guestVolume, setGuestVolume] = useState(0.9)
  const [guestMuted, setGuestMuted] = useState(false)
  const [guestStreamReady, setGuestStreamReady] = useState(false)
  const [guestSyncReady, setGuestSyncReady] = useState(false)
  const [_guestReadyRequested, setGuestReadyRequested] = useState(false)
  const [_guestReadyAcknowledged, setGuestReadyAcknowledged] = useState(false)
  const [clockOffsetMs, setClockOffsetMs] = useState(0)

  // ── Queue & playlists ──────────────────────────────────────────────────────
  const [queue, setQueue] = useState<TrackSelection[]>([])
  const [currentQueueIndex, setCurrentQueueIndex] = useState(-1)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [playlistError, setPlaylistError] = useState<string | null>(null)

  // ── Queue request system ───────────────────────────────────────────────────
  const [queueRequestsAllowed, setQueueRequestsAllowed] = useState(true)  // host toggle
  const [pendingQueueRequests, setPendingQueueRequests] = useState<QueueRequest[]>([])  // on host
  const [guestSuggestion, setGuestSuggestion] = useState('')
  const [guestPendingRequest, setGuestPendingRequest] = useState<{ id: string; suggestion: string } | null>(null)

  // ── Connection & retry ─────────────────────────────────────────────────────
  const [_pendingPlay, setPendingPlay] = useState(false)
  const [hostPortInput, setHostPortInput] = useState('7400')
  const [joinPortInput, setJoinPortInput] = useState('7400')
  const [broadcastPortInput, setBroadcastPortInput] = useState('7401')
  const [mdnsEnabled, setMdnsEnabled] = useState(true)
  const [udpEnabled, setUdpEnabled] = useState(true)
  const [retryEnabled, setRetryEnabled] = useState(true)
  const [connectionTarget, setConnectionTarget] = useState<{ host: string; port: number } | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  // ── UI state ───────────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<SidebarView>('player')
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => {
    return (localStorage.getItem('hivebeats-theme') as any) || 'system'
  })

  // ── Refs ───────────────────────────────────────────────────────────────────
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hostPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hostPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const guestPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const guestPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const guestSeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hostAudioRef = useRef<HTMLAudioElement | null>(null)
  const guestAudioRef = useRef<HTMLAudioElement | null>(null)
  const guestReadySentRef = useRef(false)
  const guestReadyRequestedRef = useRef(false)
  const guestReadyAcknowledgedRef = useRef(false)
  const pendingPlayRef = useRef(false)
  const guestStreamReadyRef = useRef(false)
  const guestSyncReadyRef = useRef(false)
  const guestTrackIdRef = useRef<string | null>(null)
  const guestReadyPositionMsRef = useRef(0)
  const clockOffsetRef = useRef(0)
  const pendingPlaybackPositionRef = useRef(0)
  const guestReadyIdsRef = useRef<Set<string>>(new Set())
  const hostCommandSeqRef = useRef(0)
  const guestLastCommandIdRef = useRef(-1)
  const connectionTargetRef = useRef<{ host: string; port: number } | null>(null)
  const transportEpochRef = useRef(0)
  // Stash a CMD_PLAY received before clock sync is ready; applied once SYNC_PONG arrives.
  const pendingCmdPlayRef = useRef<{ command: ExtendedPlayCommand; incomingEpoch: number | undefined } | null>(null)
  const hostPlayingRef = useRef(false)
  const isScrubbing = useRef(false)

  // Visualizer
  const visualizerCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)

  // ── Derived ────────────────────────────────────────────────────────────────
  const hostPort = Number(hostPortInput) || 7400
  const joinPort = Number(joinPortInput) || hostPort
  const broadcastPort = Number(broadcastPortInput) || 7401
  const broadcastIntervalMs = 3000

  // ── Theme Effect ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
    localStorage.setItem('hivebeats-theme', theme)
    // Update native window controls for Electron
    ;(window as any).hivebeats?.setTheme?.(theme)
  }, [theme])
  const maxRetries = 3
  const isHost = hostRunning
  const isGuest = guestConnected && !hostRunning
  const deviceId = useMemo(() => crypto.randomUUID(), [])
  const deviceAlias = useMemo(() => `Desktop-${deviceId.slice(0, 4)}`, [deviceId])

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const addLog = useCallback((message: string) => {
    setLogs((current) => [{ id: crypto.randomUUID(), message }, ...current].slice(0, 12))
  }, [])

  const formatTime = (ms: number) => {
    if (!Number.isFinite(ms) || ms <= 0) return '0:00'
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const filePathToUrl = (filePath: string) => {
    const normalized = filePath.replace(/\\/g, '/')
    const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`
    // We must encode the path because new URL() throws on spaces
    const encodedPath = withLeadingSlash.split('/').map(encodeURIComponent).join('/')
    return `hivebeats://file${encodedPath}`
  }

  // ─── Visualizer ────────────────────────────────────────────────────────────

  const setupVisualizer = useCallback((audioEl: HTMLAudioElement) => {
    if (audioContextRef.current) return
    try {
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.82
      const source = ctx.createMediaElementSource(audioEl)
      source.connect(analyser)
      analyser.connect(ctx.destination)
      audioContextRef.current = ctx
      analyserRef.current = analyser
    } catch { /* unsupported */ }
  }, [])

  const drawVisualizer = useCallback(() => {
    const canvas = visualizerCanvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    analyser.getByteFrequencyData(dataArray)
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)
    const barWidth = (width / bufferLength) * 1.8
    let x = 0
    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * height * 0.9
      const ratio = i / bufferLength
      const r = Math.round(255 - ratio * (255 - 168))
      const g = Math.round(107 + ratio * (85 - 107))
      const b = Math.round(53 + ratio * (247 - 53))
      ctx.fillStyle = `rgba(${r},${g},${b},0.85)`
      ctx.beginPath()
      ctx.roundRect(x, height - barHeight, Math.max(1, barWidth - 2), barHeight, [2, 2, 0, 0])
      ctx.fill()
      x += barWidth + 1
    }
    animFrameRef.current = requestAnimationFrame(drawVisualizer)
  }, [])

  const startVisualizerLoop = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    drawVisualizer()
  }, [drawVisualizer])

  const stopVisualizerLoop = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    const canvas = visualizerCanvasRef.current
    if (canvas) { const ctx = canvas.getContext('2d'); ctx?.clearRect(0, 0, canvas.width, canvas.height) }
  }, [])

  useEffect(() => {
    if (hostPlaying) startVisualizerLoop()
    else stopVisualizerLoop()
  }, [hostPlaying, startVisualizerLoop, stopVisualizerLoop])

  // ─── Host audio volume + speed ─────────────────────────────────────────────

  useEffect(() => {
    const audio = hostAudioRef.current
    if (!audio) return
    audio.volume = hostMuted ? 0 : hostVolume
  }, [hostVolume, hostMuted])

  useEffect(() => {
    const audio = hostAudioRef.current
    if (!audio) return
    audio.playbackRate = playbackRate
  }, [playbackRate])

  // ─── Guest audio volume ────────────────────────────────────────────────────
  // FIX: was missing from player bar — now applied to guestAudioRef
  useEffect(() => {
    const audio = guestAudioRef.current
    if (!audio) return
    audio.volume = guestMuted ? 0 : guestVolume
  }, [guestMuted, guestVolume])

  // Keep connectionTargetRef updated
  useEffect(() => {
    connectionTargetRef.current = connectionTarget
  }, [connectionTarget])

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          if (isHost) {
            if (hostPlaying) void handlePause()
            else void handlePlay()
          }
          break
        case 'ArrowRight':
          e.preventDefault()
          if (isHost && hostAudioRef.current) {
            const newPos = Math.min(hostPositionMs + 10000, hostDurationMs)
            hostAudioRef.current.currentTime = newPos / 1000
            setHostPositionMs(newPos)
          }
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (isHost && hostAudioRef.current) {
            const newPos = Math.max(hostPositionMs - 10000, 0)
            hostAudioRef.current.currentTime = newPos / 1000
            setHostPositionMs(newPos)
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          if (isHost) setHostVolume((v) => Math.min(1, parseFloat((v + 0.05).toFixed(2))))
          else setGuestVolume((v) => Math.min(1, parseFloat((v + 0.05).toFixed(2))))
          break
        case 'ArrowDown':
          e.preventDefault()
          if (isHost) setHostVolume((v) => Math.max(0, parseFloat((v - 0.05).toFixed(2))))
          else setGuestVolume((v) => Math.max(0, parseFloat((v - 0.05).toFixed(2))))
          break
        case 'KeyM':
          if (isHost) setHostMuted((m) => !m)
          else setGuestMuted((m) => !m)
          break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, isGuest, hostPlaying, hostPositionMs, hostDurationMs])

  // ─── Queue helpers ─────────────────────────────────────────────────────────

  const loadTrackFromQueue = useCallback(async (index: number) => {
    const track = queue[index]
    if (!track) return
    setSelectedTrack(track)
    setCurrentQueueIndex(index)
    setStreamingTrackId(null)
    const audio = hostAudioRef.current
    if (audio) { audio.src = filePathToUrl(track.filePath); audio.load() }
    addLog(`Queue: loaded ${track.fileName}`)
  }, [queue, addLog])

  const handleNextTrack = useCallback(async () => {
    const nextIndex = currentQueueIndex + 1
    if (nextIndex < queue.length) await loadTrackFromQueue(nextIndex)
  }, [currentQueueIndex, queue.length, loadTrackFromQueue])

  const handlePrevTrack = useCallback(async () => {
    const prevIndex = currentQueueIndex - 1
    if (prevIndex >= 0) await loadTrackFromQueue(prevIndex)
    else if (hostAudioRef.current) { hostAudioRef.current.currentTime = 0; setHostPositionMs(0) }
  }, [currentQueueIndex, loadTrackFromQueue])

  const removeFromQueue = useCallback((index: number) => {
    setQueue((q) => {
      const next = q.filter((_, i) => i !== index)
      if (index === currentQueueIndex) setCurrentQueueIndex(-1)
      else if (index < currentQueueIndex) setCurrentQueueIndex((ci) => ci - 1)
      return next
    })
  }, [currentQueueIndex])

  // ─── Playlists (IndexedDB) ─────────────────────────────────────────────────

  useEffect(() => {
    getAllPlaylists().then(setPlaylists).catch(() => {})
  }, [])

  const handleCreatePlaylist = useCallback(async () => {
    const name = newPlaylistName.trim()
    if (!name) { setPlaylistError('Enter a playlist name.'); return }
    const playlist: Playlist = {
      id: crypto.randomUUID(), name, tracks: [],
      createdAt: Date.now(), updatedAt: Date.now(),
    }
    await savePlaylist(playlist)
    setPlaylists((p) => [...p, playlist])
    setNewPlaylistName('')
    setPlaylistError(null)
    addLog(`Playlist "${name}" created`)
  }, [newPlaylistName, addLog])

  const handleSaveQueueAsPlaylist = useCallback(async (playlistId: string) => {
    const playlist = playlists.find((p) => p.id === playlistId)
    if (!playlist) return
    const updated: Playlist = { ...playlist, tracks: [...queue], updatedAt: Date.now() }
    await savePlaylist(updated)
    setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? updated : p)))
    addLog(`Saved queue to "${playlist.name}"`)
  }, [playlists, queue, addLog])

  const handleLoadPlaylist = useCallback(async (playlist: Playlist) => {
    setQueue(playlist.tracks)
    setCurrentQueueIndex(playlist.tracks.length > 0 ? 0 : -1)
    if (playlist.tracks[0]) await loadTrackFromQueue(0)
    addLog(`Loaded playlist "${playlist.name}"`)
  }, [addLog, loadTrackFromQueue])

  const handleDeletePlaylist = useCallback(async (id: string) => {
    await deletePlaylist(id)
    setPlaylists((p) => p.filter((pl) => pl.id !== id))
    addLog('Playlist deleted')
  }, [addLog])

  const handleAddTrackToPlaylist = useCallback(async (playlistId: string) => {
    const result = await window.hivebeats.pickAudioFile()
    if (result.canceled) return
    const track: TrackSelection = {
      id: crypto.randomUUID(),
      filePath: result.filePath,
      fileName: result.fileName,
      mimeType: result.mimeType,
    }
    
    setPlaylists((prev) => {
      const playlist = prev.find((p) => p.id === playlistId)
      if (!playlist) return prev
      const updated = { ...playlist, tracks: [...playlist.tracks, track], updatedAt: Date.now() }
      savePlaylist(updated).catch(() => {})
      return prev.map((p) => (p.id === playlistId ? updated : p))
    })
    addLog(`Added ${result.fileName} to playlist`)
  }, [addLog])

  // ─── Queue request system ──────────────────────────────────────────────────

  // Guest: suggest a song to host via text
  const handleGuestSuggestTrack = useCallback(async () => {
    const suggestion = guestSuggestion.trim()
    if (!suggestion) return
    const requestId = crypto.randomUUID()
    const msg: QueueSocketMsg = { type: 'QUEUE_REQUEST', requestId, suggestion, guestAlias: deviceAlias }
    await window.hivebeats.sendToHost(msg)
    setGuestPendingRequest({ id: requestId, suggestion })
    setGuestSuggestion('')
    addLog(`Requested: "${suggestion}"`)
  }, [guestSuggestion, deviceAlias, addLog])

  // Guest: suggest an audio file from their device
  const handleGuestSuggestFile = useCallback(async () => {
    if (!connectionTarget) return
    const result = await window.hivebeats.pickAudioFile()
    if (result.canceled || !result.filePath) return
    
    const filePath = result.filePath
    const fileName = result.fileName || filePath.split(/[/\\]/).pop() || 'Unknown File'
    
    addLog(`Uploading ${fileName} to host...`)
    try {
      const response = await window.hivebeats.uploadFileToHost(filePath, connectionTarget.host, connectionTarget.port, fileName)
      if (response.ok && response.path) {
        const requestId = crypto.randomUUID()
        const msg: QueueSocketMsg = { 
          type: 'QUEUE_REQUEST', 
          requestId, 
          suggestion: fileName, 
          guestAlias: deviceAlias,
          filePath: response.path // Path on the host machine
        }
        await window.hivebeats.sendToHost(msg)
        setGuestPendingRequest({ id: requestId, suggestion: fileName })
        addLog(`Successfully requested file: "${fileName}"`)
      }
    } catch (e) {
      addLog(`Failed to upload file to host: ${e}`)
    }
  }, [connectionTarget, deviceAlias, addLog])

  // Host: approve queue request
  const handleApproveQueueRequest = useCallback(async (request: QueueRequest) => {
    setPendingQueueRequests((qrs) => qrs.filter((r) => r.id !== request.id))
    await window.hivebeats.sendToGuest(request.guestId, {
      type: 'QUEUE_APPROVED', requestId: request.id,
    } as QueueSocketMsg)
    addLog(`Approved request from ${request.guestAlias}: "${request.suggestion}"`)
    
    let filePath = request.filePath;
    let fileName = request.suggestion;
    let mimeType = 'audio/mpeg';

    if (!filePath) {
      // If no file was provided (text request), prompt the host to pick one to fulfill it
      const result = await window.hivebeats.pickAudioFile()
      if (result.canceled || !result.filePath) return
      filePath = result.filePath
      fileName = result.fileName || filePath.split(/[/\\]/).pop() || 'Unknown'
      mimeType = result.mimeType || 'audio/mpeg'
    } else {
      // Guess mime type for uploaded files if not explicit
      if (fileName.toLowerCase().endsWith('.wav')) mimeType = 'audio/wav'
      else if (fileName.toLowerCase().endsWith('.flac')) mimeType = 'audio/flac'
      else if (fileName.toLowerCase().endsWith('.ogg')) mimeType = 'audio/ogg'
    }

    const track: TrackSelection = {
      id: crypto.randomUUID(),
      filePath,
      fileName,
      mimeType,
    }
    setQueue((q) => {
      const exists = q.some((t) => t.filePath === track.filePath)
      if (exists) return q
      return [...q, track]
    })
    addLog(`Added to queue: ${fileName}`)
  }, [addLog])

  // Host: deny queue request
  const handleDenyQueueRequest = useCallback(async (request: QueueRequest) => {
    setPendingQueueRequests((qrs) => qrs.filter((r) => r.id !== request.id))
    await window.hivebeats.sendToGuest(request.guestId, {
      type: 'QUEUE_DENIED', requestId: request.id,
    } as QueueSocketMsg)
    addLog(`Denied request from ${request.guestAlias}`)
  }, [addLog])

  // ─── Streaming helpers ─────────────────────────────────────────────────────

  const getBufferedAhead = useCallback((audio: HTMLAudioElement, positionSeconds: number) => {
    for (let index = 0; index < audio.buffered.length; index += 1) {
      const start = audio.buffered.start(index)
      const end = audio.buffered.end(index)
      if (start <= positionSeconds + GUEST_READY_POSITION_TOLERANCE_SECONDS && end > positionSeconds) {
        return end - positionSeconds
      }
    }
    return 0
  }, [])

  const areAllGuestsReady = useCallback((readyIds: Set<string>, guests: GuestInfo[]) => {
    if (guests.length === 0) return true
    return guests.every((guest) => readyIds.has(guest.id))
  }, [])

  const nextTransportEpoch = useCallback(() => {
    transportEpochRef.current += 1
    return transportEpochRef.current
  }, [])

  const clearHostTransportTimers = useCallback(() => {
    if (hostPlayTimerRef.current) { clearTimeout(hostPlayTimerRef.current); hostPlayTimerRef.current = null }
    if (hostPauseTimerRef.current) { clearTimeout(hostPauseTimerRef.current); hostPauseTimerRef.current = null }
  }, [])

  const clearGuestTransportTimers = useCallback(() => {
    if (guestPlayTimerRef.current) { clearTimeout(guestPlayTimerRef.current); guestPlayTimerRef.current = null }
    if (guestPauseTimerRef.current) { clearTimeout(guestPauseTimerRef.current); guestPauseTimerRef.current = null }
    if (guestSeekTimerRef.current) { clearTimeout(guestSeekTimerRef.current); guestSeekTimerRef.current = null }
    pendingCmdPlayRef.current = null  // also discard any buffered-but-not-yet-scheduled CMD_PLAY
  }, [])

  const startPlayback = useCallback((positionMs: number, explicitEpoch?: number) => {
    if (!selectedTrack) return
    clearHostTransportTimers()
    const epoch = explicitEpoch ?? nextTransportEpoch()
    const seq = hostCommandSeqRef.current++
    const playAt = Date.now() + HOST_PLAY_DELAY_MS
    const command: ExtendedPlayCommand = { type: 'CMD_PLAY', trackId: selectedTrack.id, playAt, positionMs, seq, epoch }
    const audio = hostAudioRef.current
    if (!audio) return
    audio.muted = false
    audio.currentTime = positionMs / 1000
    void window.hivebeats.broadcastToGuests(command)
    hostPlayTimerRef.current = setTimeout(() => {
      if (transportEpochRef.current !== epoch) return
      audio.play().catch(() => setHostError('Unable to start playback. Try again.'))
    }, Math.max(0, playAt - Date.now()))
    setHostPlaying(true)
    hostPlayingRef.current = true
    setPendingPlay(false)
    pendingPlayRef.current = false
  }, [nextTransportEpoch, selectedTrack, clearHostTransportTimers])

  const scheduleHostPause = useCallback((pauseAt: number, epoch: number) => {
    const audio = hostAudioRef.current
    if (!audio) return
    hostPauseTimerRef.current = setTimeout(() => {
      if (transportEpochRef.current !== epoch) return
      audio.pause()
      setHostPlaying(false)
      hostPlayingRef.current = false
    }, Math.max(0, pauseAt - Date.now()))
  }, [])

  const resetHostReadiness = useCallback(() => {
    guestReadyIdsRef.current.clear()
    setGuestList((current) => current.map((guest) => ({ ...guest, ready: false })))
    setGuestReadyRequested(false)
    setGuestReadyAcknowledged(false)
  }, [])

  const maybeStartPendingPlayback = useCallback(() => {
    if (!pendingPlayRef.current) return
    if (!areAllGuestsReady(guestReadyIdsRef.current, guestList)) return
    pendingPlayRef.current = false
    setPendingPlay(false)
    const audio = hostAudioRef.current
    const positionMs = audio ? audio.currentTime * 1000 : pendingPlaybackPositionRef.current
    startPlayback(positionMs)
  }, [areAllGuestsReady, guestList, startPlayback])

  const sendPlayToGuest = useCallback(async (clientId: string, positionMs: number, explicitEpoch?: number) => {
    if (!selectedTrack) return
    const epoch = explicitEpoch !== undefined ? explicitEpoch : nextTransportEpoch()
    const playAt = Date.now() + HOST_PLAY_DELAY_MS
    const command: ExtendedPlayCommand = { type: 'CMD_PLAY', trackId: selectedTrack.id, playAt, positionMs, seq: hostCommandSeqRef.current++, epoch }
    await window.hivebeats.sendToGuest(clientId, command)
  }, [nextTransportEpoch, selectedTrack])

  const requestGuestReadyAt = useCallback(async (clientId: string, positionMs: number) => {
    if (!selectedTrack) return
    const message: ReadyRequestMessage = { type: 'READY_REQUEST', trackId: selectedTrack.id, positionMs }
    guestReadyIdsRef.current.delete(clientId)
    setGuestList((current) => current.map((guest) => (guest.id === clientId ? { ...guest, ready: false } : guest)))
    await window.hivebeats.sendToGuest(clientId, message)
  }, [selectedTrack])

  const requestGuestReady = useCallback(async () => {
    if (!selectedTrack || guestList.length <= 0) return
    const audio = hostAudioRef.current
    const positionMs = audio ? audio.currentTime * 1000 : 0
    const message: ReadyRequestMessage = { type: 'READY_REQUEST', trackId: selectedTrack.id, positionMs }
    resetHostReadiness()
    await window.hivebeats.broadcastToGuests(message)
    addLog('Requested guests to get ready')
  }, [addLog, guestList.length, resetHostReadiness, selectedTrack])

  const checkGuestReady = useCallback(() => {
    if (guestReadySentRef.current) return
    const audio = guestAudioRef.current
    if (!audio || audio.buffered.length === 0) return
    const targetSeconds = guestReadyPositionMsRef.current / 1000
    const bufferedAhead = getBufferedAhead(audio, targetSeconds)
    if (bufferedAhead < GUEST_READY_BUFFER_SECONDS) return
    if (Math.abs(audio.currentTime - targetSeconds) > GUEST_READY_POSITION_TOLERANCE_SECONDS) {
      audio.currentTime = targetSeconds; return
    }
    if (audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    if (audio.readyState === HTMLMediaElement.HAVE_ENOUGH_DATA || bufferedAhead >= GUEST_READY_BUFFER_SECONDS) {
      guestReadySentRef.current = true
      guestStreamReadyRef.current = true
      setGuestStreamReady(true)
      addLog(`Guest ready at ${formatTime(guestReadyPositionMsRef.current)}`)
    }
  }, [addLog, getBufferedAhead])

  const trySendReadyAck = useCallback(async () => {
    if (!guestReadyRequestedRef.current) return
    if (!guestStreamReadyRef.current || !guestSyncReadyRef.current) return
    if (guestReadyAcknowledgedRef.current) return
    const audio = guestAudioRef.current
    if (!audio) return
    const message: ReadyAckMessage = {
      type: 'READY_ACK', trackId: guestTrackIdRef.current ?? 'unknown', positionMs: audio.currentTime * 1000,
    }
    await window.hivebeats.sendToHost(message)
    guestReadyAcknowledgedRef.current = true
    setGuestReadyAcknowledged(true)
    setGuestError(null)
    addLog('Ready sent to host')
  }, [addLog])

  const resetGuestStream = useCallback((mimeType: string, fileName: string, trackId: string, host: string, port: number) => {
    const audio = guestAudioRef.current
    if (!audio) return
    clearGuestTransportTimers()
    guestLastCommandIdRef.current = -1
    guestReadySentRef.current = false
    guestReadyAcknowledgedRef.current = false
    guestStreamReadyRef.current = false
    guestSyncReadyRef.current = false
    guestTrackIdRef.current = trackId
    setGuestStreamReady(false)
    setGuestSyncReady(false)
    setGuestReadyAcknowledged(false)
    setGuestTrackName(fileName)
    setGuestPositionMs(0)
    setGuestDurationMs(0)

    const ext = mimeType === 'audio/wav' ? '.wav' : mimeType === 'audio/flac' ? '.flac' : mimeType === 'audio/aac' ? '.aac' : mimeType === 'audio/mp4' ? '.m4a' : mimeType === 'audio/ogg' ? '.ogg' : '.mp3'
    const streamUrl = `http://${host}:${port}/stream${ext}?trackId=${trackId}`
    audio.src = streamUrl
    audio.load()
  }, [clearGuestTransportTimers])


  // ─── Discovery helpers ─────────────────────────────────────────────────────

  const pickHostAddress = (session: DiscoveredSession) => {
    const ipv4 = session.addresses.find((address) => /^\d{1,3}(\.\d{1,3}){3}$/.test(address))
    return ipv4 ?? session.host ?? ''
  }

  const discovered = useMemo<DiscoveredSession[]>(() => {
    const mdnsSessions = mdnsDiscovered.map((service) => ({
      source: 'mdns' as const, name: service.name, host: service.host,
      port: service.port, addresses: service.addresses, sessionCode: service.sessionCode,
    }))
    const udpSessions = udpDiscovered.map((announcement) => ({
      source: 'udp' as const, name: `HiveBeats-${announcement.code}`, host: announcement.host,
      port: announcement.port, addresses: [announcement.host], sessionCode: announcement.code,
    }))
    const unique = new Map<string, DiscoveredSession>()
    ;[...mdnsSessions, ...udpSessions].forEach((session) => {
      unique.set(`${session.sessionCode ?? session.name}-${session.host}-${session.port}`, session)
    })
    const all = Array.from(unique.values())
    return hostRunning ? all.filter((session) => session.sessionCode !== sessionCode) : all
  }, [hostRunning, mdnsDiscovered, sessionCode, udpDiscovered])

  // ─── Connection handlers ───────────────────────────────────────────────────

  const attemptConnect = useCallback(async (host: string, port: number, label: string) => {
    await window.hivebeats.connectToHost(host, port)
    addLog(`${label} ${host}:${port}`)
  }, [addLog])

  const connectToHost = async (host: string, port: number) => {
    if (!host) { setGuestError('Missing host address.'); return }
    if (guestAudioRef.current) {
      // Set to a tiny silent WAV file to successfully play and unlock the audio element!
      guestAudioRef.current.src = "data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhAAAAAA=="
      guestAudioRef.current.play()
        .then(() => {
          guestAudioRef.current?.pause()
          addLog('Guest audio player unlocked successfully')
        })
        .catch((err) => {
          console.warn('Unlock failed:', err)
        })
    }
    setConnectionTarget({ host, port })
    connectionTargetRef.current = { host, port }
    setRetryCount(0)
    setGuestError(null)
    await attemptConnect(host, port, 'Connecting to')
  }

  const scheduleRetry = useCallback(() => {
    if (!retryEnabled || !connectionTarget || retryCount >= maxRetries || retryTimerRef.current) return
    const nextAttempt = retryCount + 1
    const delay = 800 * 2 ** retryCount
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null
      setRetryCount(nextAttempt)
      attemptConnect(connectionTarget.host, connectionTarget.port, `Retry ${nextAttempt}/${maxRetries} to`)
    }, delay)
  }, [attemptConnect, connectionTarget, maxRetries, retryCount, retryEnabled])

  const sendHello = useCallback(async () => {
    const message: HostHelloMessage = { type: 'HELLO', deviceId, alias: deviceAlias }
    await window.hivebeats.sendToHost(message)
  }, [deviceAlias, deviceId])

  const handleNewCode = () => setSessionCode(generateSessionCode())

  // ─── Host audio actions ────────────────────────────────────────────────────

  useEffect(() => {
    if (!isHost) return
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (!hostAudioRef.current) return
          if (hostAudioRef.current.paused) {
            void hostAudioRef.current.play()
            setHostPlaying(true)
          } else {
            hostAudioRef.current.pause()
            setHostPlaying(false)
          }
          break
        case 'ArrowRight':
          e.preventDefault()
          if (hostAudioRef.current) hostAudioRef.current.currentTime += 5
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (hostAudioRef.current) hostAudioRef.current.currentTime -= 5
          break
        case 'ArrowUp':
          e.preventDefault()
          setHostVolume(v => Math.min(1, v + 0.05))
          break
        case 'ArrowDown':
          e.preventDefault()
          setHostVolume(v => Math.max(0, v - 0.05))
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isHost])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (isHost) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    // Only set to false if leaving the main window, not child elements
    if (e.currentTarget === e.target) setIsDragging(false)
  }

  const handleDropAudio = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (!isHost) return

    const file = e.dataTransfer.files[0]
    if (!file) return

    // Extract path from Electron File object
    const filePath = (file as any).path
    if (!filePath) return

    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i)) {
      addLog(`Unsupported file type: ${file.name}`)
      return
    }

    const track: TrackSelection = {
      id: crypto.randomUUID(), filePath: filePath,
      fileName: file.name, mimeType: file.type || 'audio/mpeg',
    }

    setSelectedTrack(track)
    setStreamingTrackId(null)
    resetHostReadiness()
    const audio = hostAudioRef.current
    if (audio) {
      if (!audioContextRef.current) setupVisualizer(audio)
      if (audioContextRef.current?.state === 'suspended') void audioContextRef.current.resume()
      audio.src = filePathToUrl(filePath)
      audio.load()
    }
    setQueue((q) => {
      const exists = q.some((t) => t.filePath === track.filePath)
      if (exists) return q
      const next = [...q, track]
      setCurrentQueueIndex(next.length - 1)
      return next
    })
    addLog(`Loaded ${file.name} via drop`)
  }

  const handlePickAudio = async () => {
    const result = await window.hivebeats.pickAudioFile()
    if (result.canceled) return
    const track: TrackSelection = {
      id: crypto.randomUUID(), filePath: result.filePath,
      fileName: result.fileName, mimeType: result.mimeType,
    }
    setSelectedTrack(track)
    setStreamingTrackId(null)
    resetHostReadiness()
    const audio = hostAudioRef.current
    if (audio) {
      if (!audioContextRef.current) setupVisualizer(audio)
      if (audioContextRef.current?.state === 'suspended') void audioContextRef.current.resume()
      audio.src = filePathToUrl(result.filePath)
      audio.load()
    }
    setQueue((q) => {
      const exists = q.some((t) => t.filePath === track.filePath)
      if (exists) return q
      const next = [...q, track]
      setCurrentQueueIndex(next.length - 1)
      return next
    })
    addLog(`Loaded ${result.fileName}`)
  }

  const handlePlay = async () => {
    if (!selectedTrack) { setHostError('Pick an audio file first.'); return }
    if (hostPlaying) return
    const audio = hostAudioRef.current
    if (!audio) return
    if (!audioContextRef.current) setupVisualizer(audio)
    if (audioContextRef.current?.state === 'suspended') void audioContextRef.current.resume()
    if (streamingTrackId !== selectedTrack.id) {
      await window.hivebeats.startStream(selectedTrack.filePath, selectedTrack.fileName, selectedTrack.mimeType, selectedTrack.id)
      setStreamingTrackId(selectedTrack.id)
      addLog('Streaming to guests')
    }
    const positionMs = audio.currentTime * 1000
    if (guestList.length > 0 && !areAllGuestsReady(guestReadyIdsRef.current, guestList)) {
      setPendingPlay(true)
      pendingPlayRef.current = true
      pendingPlaybackPositionRef.current = positionMs
      addLog('Waiting for guests to become ready...')
      await requestGuestReady()
      return
    }
    startPlayback(positionMs)
  }

  const handlePause = async () => {
    const audio = hostAudioRef.current
    if (!audio) return
    const epoch = nextTransportEpoch()
    const seq = hostCommandSeqRef.current++
    const pauseAt = Date.now() + HOST_PAUSE_DELAY_MS
    const positionMs = audio.currentTime * 1000
    clearHostTransportTimers()
    setPendingPlay(false)
    pendingPlayRef.current = false
    setHostPlaying(false)
    hostPlayingRef.current = false
    const command: ExtendedPauseCommand = { type: 'CMD_PAUSE', pauseAt, positionMs, seq, epoch }
    await window.hivebeats.broadcastToGuests(command)
    scheduleHostPause(pauseAt, epoch)
  }

  const handleStop = async () => {
    const audio = hostAudioRef.current
    if (!audio) return
    const epoch = nextTransportEpoch()
    clearHostTransportTimers()
    audio.pause(); audio.currentTime = 0
    setHostPlaying(false); hostPlayingRef.current = false
    setHostPositionMs(0); setStreamingTrackId(null)
    setPendingPlay(false); pendingPlayRef.current = false
    await window.hivebeats.stopStream()
    const command: ExtendedPauseCommand = { type: 'CMD_PAUSE', pauseAt: Date.now(), positionMs: 0, seq: hostCommandSeqRef.current++, epoch }
    await window.hivebeats.broadcastToGuests(command)
    resetHostReadiness()
  }

  const handleSeek = async (positionMs: number) => {
    if (!selectedTrack) return
    const audio = hostAudioRef.current
    if (!audio) return
    const epoch = nextTransportEpoch()
    const seq = hostCommandSeqRef.current++
    const playAt = Date.now() + HOST_PLAY_DELAY_MS
    audio.currentTime = positionMs / 1000
    const command: ExtendedSeekCommand = { type: 'CMD_SEEK', trackId: selectedTrack.id, playAt, positionMs, seq, epoch }
    clearHostTransportTimers(); setPendingPlay(false); pendingPlayRef.current = false
    await window.hivebeats.broadcastToGuests(command)
    resetHostReadiness()
  }

  const handleStartHost = async () => {
    await window.hivebeats.startHost(hostPort)
    if (mdnsEnabled) await window.hivebeats.advertiseSession(sessionCode, hostPort)
    if (udpEnabled) await window.hivebeats.startUdpBroadcast(sessionCode, hostPort, broadcastPort, broadcastIntervalMs, deviceId)
    setHostRunning(true); setHostError(null)
    addLog(`Host started on ${hostPort}`)
  }

  const handleStopHost = async () => {
    nextTransportEpoch(); clearHostTransportTimers()
    await window.hivebeats.stopHost()
    await window.hivebeats.stopAdvertise()
    await window.hivebeats.stopUdpBroadcast()
    await window.hivebeats.stopStream()
    setHostRunning(false); setGuestList([])
    setStreamingTrackId(null); setPendingPlay(false); pendingPlayRef.current = false
    guestReadyIdsRef.current.clear()
    addLog('Host stopped')
  }

  const handleDisconnect = async () => {
    clearGuestTransportTimers()
    await window.hivebeats.disconnectFromHost()
    setConnectionTarget(null)
    connectionTargetRef.current = null
    setRetryCount(0)
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
    setGuestConnected(false); setGuestHostId('')
    setGuestTrackName(''); setGuestPositionMs(0); setGuestDurationMs(0)
    setGuestPendingRequest(null)
    addLog('Guest disconnected manually')
  }

  // ─── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    window.hivebeats.getLocalIp().then(setLocalIp).catch(console.error)
  }, [])

  // mDNS + UDP discovery
  useEffect(() => {
    const toKey = (service: MdnsSessionAnnouncement) => `${service.name}-${service.port}`
    let cleanupUp = () => {}
    let cleanupDown = () => {}
    let cleanupUdpAnnouncement = () => {}
    let cleanupUdpError = () => {}
    if (mdnsEnabled) {
      cleanupUp = window.hivebeats.onServiceUp((service) => {
        setMdnsDiscovered((current) => {
          const key = toKey(service)
          if (!current.some((item) => toKey(item) === key)) addLog(`mDNS: ${service.sessionCode ?? service.name} found`)
          return [...current.filter((item) => toKey(item) !== key), service]
        })
      })
      cleanupDown = window.hivebeats.onServiceDown((service) => {
        setMdnsDiscovered((current) => current.filter((item) => toKey(item) !== toKey(service)))
        addLog(`mDNS: ${service.sessionCode ?? service.name} left`)
      })
      window.hivebeats.startDiscovery()
    } else { setMdnsDiscovered([]); window.hivebeats.stopDiscovery() }
    if (udpEnabled) {
      cleanupUdpAnnouncement = window.hivebeats.onUdpAnnouncement((announcement) => {
        setUdpDiscovered((current) => {
          const key = `${announcement.code}-${announcement.host}-${announcement.port}`
          if (!current.some((item) => `${item.code}-${item.host}-${item.port}` === key)) addLog(`UDP: ${announcement.code} at ${announcement.host}`)
          return [...current.filter((item) => `${item.code}-${item.host}-${item.port}` !== key), announcement]
        })
      })
      cleanupUdpError = window.hivebeats.onUdpError((error) => setUdpError(error.message))
      window.hivebeats.startUdpListen(broadcastPort, deviceId)
    } else { setUdpDiscovered([]); setUdpError(null); window.hivebeats.stopUdpListen() }
    return () => {
      cleanupUp(); cleanupDown(); cleanupUdpAnnouncement(); cleanupUdpError()
      window.hivebeats.stopDiscovery(); window.hivebeats.stopUdpListen()
    }
  }, [addLog, broadcastPort, deviceId, mdnsEnabled, udpEnabled])

  // Host audio events
  useEffect(() => {
    const audio = hostAudioRef.current
    if (!audio) return
    const handleTimeUpdate = () => { if (!isScrubbing.current) setHostPositionMs(audio.currentTime * 1000) }
    const handleLoadedMetadata = () => setHostDurationMs(audio.duration * 1000)
    const handleEnded = async () => {
      setHostPlaying(false); hostPlayingRef.current = false; setHostPositionMs(0)
      const nextIndex = currentQueueIndex + 1
      if (nextIndex < queue.length) { await loadTrackFromQueue(nextIndex); setTimeout(() => void handlePlay(), 300) }
    }
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('ended', handleEnded)
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrack, currentQueueIndex, queue])

  // FIX: Guest audio position tracking — was missing entirely
  useEffect(() => {
    const audio = guestAudioRef.current
    if (!audio) return
    const handleTimeUpdate = () => setGuestPositionMs(audio.currentTime * 1000)
    const handleLoadedMetadata = () => setGuestDurationMs(audio.duration * 1000)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [guestTrackId]) // re-run when a new track arrives

  // Guest sync pings
  useEffect(() => {
    if (guestConnected) {
      const sendPing = () => window.hivebeats.sendToHost({ type: 'SYNC_PING', t0: Date.now() } as SyncPingMessage)
      sendPing()
      syncTimerRef.current = setInterval(sendPing, SYNC_INTERVAL_MS)
    }
    return () => { if (syncTimerRef.current) { clearInterval(syncTimerRef.current); syncTimerRef.current = null } }
  }, [guestConnected])

  // Guest canplay events
  useEffect(() => {
    const audio = guestAudioRef.current
    if (!audio) return
    const handleGuestCanPlay = () => { checkGuestReady(); void trySendReadyAck() }
    const handleGuestCanPlayThrough = () => {
      if (guestReadyAcknowledgedRef.current) return
      guestStreamReadyRef.current = true; setGuestStreamReady(true)
      guestSyncReadyRef.current = true; setGuestSyncReady(true)
      guestReadySentRef.current = true
      addLog('Guest audio can play through (ready)')
      void trySendReadyAck()
    }
    const handleGuestError = () => {
      const err = audio.error
      addLog(`Guest audio element error: ${err?.message || 'unknown error'} (code ${err?.code})`)
      setGuestError(`Audio element error: ${err?.message || 'unknown error'} (code ${err?.code})`)
    }
    audio.addEventListener('canplay', handleGuestCanPlay)
    audio.addEventListener('canplaythrough', handleGuestCanPlayThrough)
    audio.addEventListener('seeked', handleGuestCanPlay)
    audio.addEventListener('loadedmetadata', handleGuestCanPlay)
    audio.addEventListener('progress', handleGuestCanPlay)
    audio.addEventListener('error', handleGuestError)
    return () => {
      audio.removeEventListener('canplay', handleGuestCanPlay)
      audio.removeEventListener('canplaythrough', handleGuestCanPlayThrough)
      audio.removeEventListener('seeked', handleGuestCanPlay)
      audio.removeEventListener('loadedmetadata', handleGuestCanPlay)
      audio.removeEventListener('progress', handleGuestCanPlay)
      audio.removeEventListener('error', handleGuestError)
    }
  }, [checkGuestReady, trySendReadyAck, addLog])

  // Host advertisement sync
  useEffect(() => {
    if (!hostRunning) return
    if (mdnsEnabled) window.hivebeats.advertiseSession(sessionCode, hostPort)
    else window.hivebeats.stopAdvertise()
    if (udpEnabled) window.hivebeats.startUdpBroadcast(sessionCode, hostPort, broadcastPort, broadcastIntervalMs, deviceId)
    else window.hivebeats.stopUdpBroadcast()
  }, [broadcastIntervalMs, broadcastPort, deviceId, hostPort, hostRunning, mdnsEnabled, sessionCode, udpEnabled])

  // Socket messages
  useEffect(() => {
    const cleanupStatus = window.hivebeats.onSocketStatus((status: SocketStatusPayload) => {
      if (status.role === 'host') {
        if (status.status === 'client-connected') {
          setGuestList((current) => {
            if (!status.address || !status.clientId) return current
            if (current.some((guest) => guest.id === status.clientId)) return current
            return [...current, { id: status.clientId, alias: 'Guest', address: status.address, ready: false }]
          })
          if (status.clientId) guestReadyIdsRef.current.delete(status.clientId)
          addLog(`Guest connected (${status.address})`)
        }
        if (status.status === 'client-disconnected') {
          setGuestList((current) => current.filter((guest) => guest.id !== status.clientId))
          if (status.clientId) guestReadyIdsRef.current.delete(status.clientId)
          addLog('Guest disconnected')
          maybeStartPendingPlayback()
        }
        if (status.status === 'error') { setHostError(status.message); addLog(`Host error: ${status.message}`) }
      }
      if (status.role === 'guest') {
        if (status.status === 'connected') {
          setGuestConnected(true); setGuestSyncReady(false)
          guestSyncReadyRef.current = false; guestReadyRequestedRef.current = false; guestReadyAcknowledgedRef.current = false
          setGuestError(null); sendHello(); addLog('Guest connected to host')
          if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
          setRetryCount(0)
        }
        if (status.status === 'disconnected') {
          setGuestConnected(false); setGuestHostId('')
          setGuestSyncReady(false); guestSyncReadyRef.current = false
          guestReadyRequestedRef.current = false; guestReadyAcknowledgedRef.current = false
          setGuestReadyRequested(false); setGuestReadyAcknowledged(false)
          addLog('Guest disconnected from host')
          scheduleRetry()
        }
        if (status.status === 'error') { setGuestError(status.message); addLog(`Guest error: ${status.message}`); scheduleRetry() }
      }
    })

    const cleanupMessage = window.hivebeats.onSocketMessage((payload: SocketMessagePayload) => {
      if (payload.role === 'host' && typeof payload.message === 'object' && payload.message) {
        const message = payload.message as { type: string }

        if (message.type === 'HELLO' && payload.clientId) {
          const helloMsg = payload.message as HostHelloMessage
          const clientId = payload.clientId
          const reply: HostWelcomeMessage = { type: 'WELCOME', sessionCode, hostId: deviceId }
          
          if (helloMsg.alias === 'Scanner') {
            setGuestList((current) => current.filter((guest) => guest.id !== clientId))
            window.hivebeats.sendToGuest(clientId, reply)
            setTimeout(() => void window.hivebeats.kickGuest(clientId), 200)
            return
          }

          setGuestList((current) => current.map((guest) => guest.id === clientId ? { ...guest, alias: helloMsg.alias } : guest))
          window.hivebeats.sendToGuest(clientId, reply)
          if (selectedTrack) {
            void window.hivebeats.startStreamForGuest(clientId, selectedTrack.filePath, selectedTrack.fileName, selectedTrack.mimeType, selectedTrack.id)
              .then(() => {
                const audio = hostAudioRef.current
                const positionMs = audio ? audio.currentTime * 1000 : 0
                void requestGuestReadyAt(clientId, positionMs)
              })
          }
        }

        // Queue request from guest
        if (message.type === 'QUEUE_REQUEST' && payload.clientId) {
          const qMsg = message as unknown as QueueSocketMsg & { type: 'QUEUE_REQUEST' }
          const guest = guestList.find((g) => g.id === payload.clientId)
          setPendingQueueRequests((qrs) => [...qrs, {
            id: qMsg.requestId,
            suggestion: qMsg.suggestion,
            guestId: payload.clientId!,
            guestAlias: guest?.alias ?? qMsg.guestAlias,
            filePath: qMsg.filePath,
          }])
          addLog(`Queue request from ${guest?.alias ?? qMsg.guestAlias}: "${qMsg.suggestion}"`)
        }

        const streamMessage = payload.message as StreamMessage | ReadyAckMessage
        if (streamMessage.type === 'SYNC_PING' && payload.clientId) {
          const t1 = Date.now()
          const pong: SyncPongMessage = { type: 'SYNC_PONG', t0: (streamMessage as SyncPingMessage).t0, t1, t2: Date.now() }
          window.hivebeats.sendToGuest(payload.clientId, pong)
        }
        if (streamMessage.type === 'READY_ACK' && payload.clientId) {
          guestReadyIdsRef.current.add(payload.clientId)
          setGuestList((current) => current.map((guest) => guest.id === payload.clientId ? { ...guest, ready: true } : guest))
          addLog(`Guest ready: ${payload.clientId.slice(0, 6)}`)
          if (pendingPlayRef.current) maybeStartPendingPlayback()
          else if (hostPlayingRef.current) {
            const audio = hostAudioRef.current
            const positionMs = audio ? audio.currentTime * 1000 + HOST_PLAY_DELAY_MS : 0
            void sendPlayToGuest(payload.clientId, positionMs, transportEpochRef.current)
          }
        }
      }

      if (payload.role === 'guest' && typeof payload.message === 'object' && payload.message) {
        const message = payload.message as { type: string, [key: string]: any }
        if (message.type === 'WELCOME') {
          setGuestHostId(message.hostId as string)
          setSessionCode(message.sessionCode as string)
          addLog(`Joined session ${message.sessionCode as string}`)
        }

        // Queue responses from host
        if (message.type === 'QUEUE_APPROVED') {
          const qMsg = message as unknown as QueueSocketMsg & { type: 'QUEUE_APPROVED' }
          if (guestPendingRequest?.id === qMsg.requestId) {
            setGuestPendingRequest(null)
            addLog(`Host approved: "${guestPendingRequest.suggestion}"`)
          }
        }
        if (message.type === 'QUEUE_DENIED') {
          const qMsg = message as unknown as QueueSocketMsg & { type: 'QUEUE_DENIED' }
          if (guestPendingRequest?.id === qMsg.requestId) {
            setGuestPendingRequest(null)
            addLog('Host denied queue request')
          }
        }

        const streamMessage = payload.message as { type: string, [key: string]: any }
        if (streamMessage.type === 'SYNC_PONG') {
          const t3 = Date.now()
          const pong = streamMessage as unknown as SyncPongMessage
          const offset = ((pong.t1 - pong.t0) + (pong.t2 - t3)) / 2
          setClockOffsetMs(offset); clockOffsetRef.current = offset
          setGuestSyncReady(true); guestSyncReadyRef.current = true
          addLog('Guest sync ready')
          // Apply any CMD_PLAY that arrived before this sync completed, now that we have a fresh offset.
          if (pendingCmdPlayRef.current) {
            const { command: pendingCmd, incomingEpoch: pendingEpoch } = pendingCmdPlayRef.current
            pendingCmdPlayRef.current = null
            const audio = guestAudioRef.current
            if (audio) {
              clearGuestTransportTimers()
              const delay = Math.max(0, pendingCmd.playAt - offset - Date.now())
              audio.currentTime = pendingCmd.positionMs / 1000
              const epoch = pendingEpoch ?? transportEpochRef.current
              guestPlayTimerRef.current = setTimeout(() => {
                if (transportEpochRef.current !== epoch) return
                audio.play().catch(() => setGuestError('Unable to start playback on guest.'))
              }, delay)
              addLog(`Applied buffered CMD_PLAY after sync (delay ${delay}ms)`)
            }
          }
          void trySendReadyAck(); return
        }
        if (streamMessage.type === 'READY_REQUEST') {
          guestReadyRequestedRef.current = true; guestReadyAcknowledgedRef.current = false
          guestReadyPositionMsRef.current = streamMessage.positionMs as number
          setGuestReadyRequested(true); setGuestReadyAcknowledged(false)
          guestReadySentRef.current = false; guestStreamReadyRef.current = false
          setGuestStreamReady(false); setGuestSyncReady(false); guestSyncReadyRef.current = false
          window.hivebeats.sendToHost({ type: 'SYNC_PING', t0: Date.now() })
          addLog('Host requested readiness')
          checkGuestReady(); void trySendReadyAck(); return
        }
        if (streamMessage.type === 'STREAM_INIT') {
          resetGuestStream(streamMessage.mimeType as string, streamMessage.fileName as string, streamMessage.trackId as string, connectionTargetRef.current?.host || '', connectionTargetRef.current?.port || 7400)
          guestTrackIdRef.current = streamMessage.trackId as string
          setGuestTrackId(streamMessage.trackId as string)
          setGuestError(null)
          // Always refresh the clock offset after a stream reset, regardless of ready-request state.
          // This ensures CMD_PLAY is processed with a fresh offset rather than a potentially stale one.
          pendingCmdPlayRef.current = null
          window.hivebeats.sendToHost({ type: 'SYNC_PING', t0: Date.now() })
          return
        }


        const playCmd = streamMessage as unknown as ExtendedPlayCommand
        const pauseCmd = streamMessage as unknown as ExtendedPauseCommand
        const seekCmd = streamMessage as unknown as ExtendedSeekCommand
        const incomingEpoch = playCmd.epoch ?? pauseCmd.epoch ?? seekCmd.epoch
        if (incomingEpoch !== undefined) {
          if (incomingEpoch < transportEpochRef.current) { addLog(`Ignoring stale transport (epoch ${incomingEpoch})`); return }
          if (incomingEpoch > transportEpochRef.current) { transportEpochRef.current = incomingEpoch; clearGuestTransportTimers() }
        }
        const seq = (playCmd.seq ?? pauseCmd.seq ?? seekCmd.seq) as number | undefined
        if (seq !== undefined) {
          if (seq <= guestLastCommandIdRef.current) { addLog(`Ignoring stale command (seq ${seq})`); return }
          guestLastCommandIdRef.current = seq
        }

        const audio = guestAudioRef.current
        if (!audio) return

        if (playCmd.type === 'CMD_PLAY') {
          clearGuestTransportTimers()
          // If clock sync hasn't been established yet, buffer this command and apply
          // it once SYNC_PONG arrives with a fresh offset. This prevents playing
          // earlier than the host due to an uncalibrated clock offset.
          if (!guestSyncReadyRef.current) {
            pendingCmdPlayRef.current = { command: playCmd, incomingEpoch }
            addLog('CMD_PLAY buffered: awaiting clock sync')
            return
          }
          const delay = Math.max(0, playCmd.playAt - clockOffsetRef.current - Date.now())
          audio.currentTime = playCmd.positionMs / 1000
          const epoch = incomingEpoch ?? transportEpochRef.current
          guestPlayTimerRef.current = setTimeout(() => {
            if (transportEpochRef.current !== epoch) return
            audio.play().catch(() => setGuestError('Unable to start playback on guest.'))
          }, delay); return
        }
        if (pauseCmd.type === 'CMD_PAUSE') {
          clearGuestTransportTimers()
          const delay = Math.max(0, pauseCmd.pauseAt - clockOffsetRef.current - Date.now())
          audio.currentTime = pauseCmd.positionMs / 1000
          const epoch = incomingEpoch ?? transportEpochRef.current
          guestPauseTimerRef.current = setTimeout(() => {
            if (transportEpochRef.current !== epoch) return
            audio.pause()
          }, delay)
          guestReadyRequestedRef.current = false; guestReadyAcknowledgedRef.current = false
          setGuestReadyRequested(false); setGuestReadyAcknowledged(false); return
        }
        if (seekCmd.type === 'CMD_SEEK') {
          clearGuestTransportTimers()
          const delay = Math.max(0, seekCmd.playAt - clockOffsetRef.current - Date.now())
          audio.currentTime = seekCmd.positionMs / 1000
          const epoch = incomingEpoch ?? transportEpochRef.current
          guestSeekTimerRef.current = setTimeout(() => {
            if (transportEpochRef.current !== epoch) return
            audio.play().catch(() => setGuestError('Unable to resume after seek.'))
          }, delay)
        }
      }
    })

    return () => { cleanupStatus(); cleanupMessage() }
  }, [
    addLog, checkGuestReady, clearGuestTransportTimers,
    deviceId, guestList, guestPendingRequest, guestTrackId,
    maybeStartPendingPlayback, requestGuestReadyAt, resetGuestStream,
    scheduleRetry, sendHello, selectedTrack, sendPlayToGuest,
    sessionCode, trySendReadyAck,
  ])

  // Cleanup
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      if (hostPlayTimerRef.current) clearTimeout(hostPlayTimerRef.current)
      if (hostPauseTimerRef.current) clearTimeout(hostPauseTimerRef.current)
      if (guestPlayTimerRef.current) clearTimeout(guestPlayTimerRef.current)
      if (guestPauseTimerRef.current) clearTimeout(guestPauseTimerRef.current)
      if (guestSeekTimerRef.current) clearTimeout(guestSeekTimerRef.current)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  useEffect(() => {
    if (!retryEnabled && retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
    if (!connectionTarget) setRetryCount(0)
  }, [connectionTarget, retryEnabled])

  // ─── Derived values ─────────────────────────────────────────────────────────

  const progressPercent = hostDurationMs > 0 ? (hostPositionMs / hostDurationMs) * 100 : 0
  const hostVolPercent = hostMuted ? 0 : hostVolume * 100
  const guestVolPercent = guestMuted ? 0 : guestVolume * 100
  const guestProgressPercent = guestDurationMs > 0 ? (guestPositionMs / guestDurationMs) * 100 : 0

  // ─── Render: Host Now Playing ───────────────────────────────────────────────

  const renderHostPlayer = () => (
    <>
      {/* Session */}
      <div className="panel panel--accent panel--session">
        <p className="panel-title">Your Session</p>
        <div style={{ display: 'flex', flexDirection: 'row', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
          <div className="session-code-display" aria-live="polite" style={{ flex: 1, margin: 0 }}>{sessionCode}</div>
          <div style={{ background: 'white', padding: '6px', borderRadius: '8px' }}>
            <QRCodeSVG value={`hivebeats://${localIp}:${hostPort}?code=${sessionCode}`} size={64} />
          </div>
        </div>
        <div className="btn-row">
          <button className="btn btn--ghost" onClick={handleNewCode}>New Code</button>
          <button className="btn btn--danger" onClick={handleStopHost}>Stop Host</button>
        </div>
        <div className="meta-row">
          <span><span className="status-dot status-dot--live" style={{ display: 'inline-block', marginRight: 5 }} />Live</span>
          <span>{guestList.length} guest{guestList.length !== 1 ? 's' : ''}</span>
          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{deviceAlias}</span>
        </div>
        {/* Queue permission toggle */}
        <label className="toggle">
          <input type="checkbox" checked={queueRequestsAllowed} onChange={(e) => setQueueRequestsAllowed(e.target.checked)} />
          <span className="switch" aria-hidden="true" />
          <span className="toggle-label">Allow guests to request songs</span>
        </label>
        {hostError ? <div className="alert alert--error" role="alert">⚠ {hostError}</div> : null}
      </div>

      {/* Pending queue requests from guests */}
      {pendingQueueRequests.length > 0 && (
        <div className="panel panel--requests">
          <p className="panel-title">🎵 Song Requests</p>
          <div className="queue-requests-list">
            {pendingQueueRequests.map((req) => (
              <div key={req.id} className="queue-request-item">
                <div className="queue-request-info">
                  <span className="queue-request-guest">{req.guestAlias}</span>
                  <span className="queue-request-song">"{req.suggestion}"</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn--approve" onClick={() => void handleApproveQueueRequest(req)} aria-label="Approve request">
                    <IconCheck /> Approve
                  </button>
                  <button className="btn btn--deny" onClick={() => void handleDenyQueueRequest(req)} aria-label="Deny request">
                    <IconClose />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Host audio controls */}
      <div className="panel">
        <p className="panel-title">Now Playing</p>

        {/* Track info */}
        <div className="now-playing-track">
          <div className={`track-artwork ${hostPlaying ? 'track-artwork--playing' : ''}`}>
            <IconMusic />
          </div>
          <div className="track-details">
            {selectedTrack ? (
              <>
                <div className="track-name" title={selectedTrack.fileName}>{selectedTrack.fileName}</div>
                <div className="track-sub">{formatTime(hostPositionMs)} / {formatTime(hostDurationMs)}</div>
              </>
            ) : (
              <>
                <div className="track-name" style={{ color: 'var(--text-muted)' }}>No track selected</div>
                <div className="track-sub">Choose an audio file to start</div>
              </>
            )}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {playlists.length > 0 && (
              <select 
                className="btn btn--ghost" 
                onChange={(e) => {
                  const id = e.target.value;
                  const pl = playlists.find(p => p.id === id);
                  if (pl) handleLoadPlaylist(pl);
                  e.target.value = "";
                }}
                defaultValue=""
                style={{ appearance: 'none', cursor: 'pointer', paddingRight: '24px' }}
                aria-label="Load saved playlist"
              >
                <option value="" disabled>Load Playlist...</option>
                {playlists.map(pl => (
                  <option key={pl.id} value={pl.id}>{pl.name} ({pl.tracks.length})</option>
                ))}
              </select>
            )}
            <button className="btn btn--ghost" style={{ flexShrink: 0 }} onClick={handlePickAudio}>
              <IconPlus /> Choose File
            </button>
          </div>
        </div>

        {/* Visualizer */}
        <div className="visualizer-wrap">
          <canvas ref={visualizerCanvasRef} className="visualizer-canvas" width={600} height={80} aria-hidden="true" />
          {!hostPlaying && (
            <div className="visualizer-idle">{selectedTrack ? 'Paused — press play' : 'No track loaded'}</div>
          )}
        </div>

        {/* Progress */}
        <div className="progress-container">
          <input
            type="range" className="timeline"
            style={{ '--progress': `${progressPercent}%` } as React.CSSProperties}
            min={0} max={Math.max(1, hostDurationMs)}
            value={Math.min(hostPositionMs, hostDurationMs)}
            aria-label="Track position"
            onChange={(e) => { isScrubbing.current = true; const v = Number(e.target.value); setHostPositionMs(v); if (hostAudioRef.current) hostAudioRef.current.currentTime = v / 1000 }}
            onMouseUp={(e) => { isScrubbing.current = false; void handleSeek(Number(e.currentTarget.value)) }}
            onTouchEnd={(e) => { isScrubbing.current = false; void handleSeek(Number(e.currentTarget.value)) }}
            disabled={!selectedTrack}
          />
          <div className="progress-times"><span>{formatTime(hostPositionMs)}</span><span>{formatTime(hostDurationMs)}</span></div>
        </div>

        {/* Controls & Volume row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', marginTop: 24, gap: 16 }}>
          
          {/* Left: Speed */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Speed</span>
            <div className="speed-pills" role="group" aria-label="Playback speed" style={{ margin: 0 }}>
              {PLAYBACK_SPEEDS.map((s) => (
                <button key={s} type="button"
                  className={`speed-pill ${playbackRate === s ? 'speed-pill--active' : ''}`}
                  onClick={() => setPlaybackRate(s)} aria-pressed={playbackRate === s}>
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Center: Playback Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, justifyContent: 'center' }}>
            <button className="ctrl-btn" onClick={() => void handlePrevTrack()} disabled={!selectedTrack || currentQueueIndex <= 0} aria-label="Previous" style={{ transform: 'scale(1.2)' }}>
              <IconSkipPrev />
            </button>
            {hostPlaying ? (
              <button className="play-btn-main" onClick={() => void handlePause()} aria-label="Pause" style={{ width: 56, height: 56, boxShadow: '0 4px 15px rgba(255,107,53,0.3)' }}>
                <IconPause />
              </button>
            ) : (
              <button className="play-btn-main" onClick={() => void handlePlay()} disabled={!selectedTrack} aria-label="Play" style={{ width: 56, height: 56, boxShadow: '0 4px 15px rgba(255,107,53,0.3)' }}>
                <IconPlay />
              </button>
            )}
            <button className="ctrl-btn" onClick={() => void handleNextTrack()} disabled={!selectedTrack || currentQueueIndex >= queue.length - 1} aria-label="Next" style={{ transform: 'scale(1.2)' }}>
              <IconSkipNext />
            </button>
          </div>

          {/* Right: Volume */}
          <div className="control-row" style={{ width: '150px', marginLeft: 'auto', marginBottom: 0 }}>
            <button className="ctrl-btn" onClick={() => setHostMuted((m) => !m)} aria-label={hostMuted ? 'Unmute' : 'Mute'}>
              {hostMuted || hostVolume === 0 ? <IconVolumeMute /> : <IconVolumeFull />}
            </button>
            <input type="range" className="volume-slider"
              style={{ '--vol-progress': `${hostVolPercent}%`, flex: 1 } as React.CSSProperties}
              min={0} max={1} step={0.01} value={hostMuted ? 0 : hostVolume}
              aria-label="Host volume"
              onChange={(e) => { const v = Number(e.target.value); setHostVolume(v); if (v > 0) setHostMuted(false) }}
            />
          </div>
        </div>

        {/* Footer Actions & Status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--glass-border)', paddingTop: 16, marginTop: 8 }}>
          
          {/* Status Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className={`status-dot ${streamingTrackId ? 'status-dot--live' : ''}`} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {streamingTrackId ? 'STREAMING' : 'IDLE'} • CLOCK SYNC: {clockOffsetMs.toFixed(0)}MS
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn--danger" onClick={handleStop} disabled={!selectedTrack} style={{ padding: '8px 16px', fontSize: '0.8rem' }}>
              <IconStop /> Stop
            </button>
          </div>
        </div>
      </div>

      {/* Guest list */}
      {guestList.length > 0 && (
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p className="panel-title" style={{ margin: 0 }}>Connected Guests</p>
            <button
              className="btn btn--ghost"
              onClick={requestGuestReady}
              disabled={!selectedTrack || guestList.length === 0}
              style={{ padding: '5px 12px', fontSize: '0.75rem' }}
              title="Ask all guests to re-buffer and re-sync clocks. Use if a guest stays on WAITING after you pick a track."
            >
              ↺ Re-sync
            </button>
          </div>
          <div className="guest-list">
            {guestList.map((guest) => (
              <div key={guest.id} className="guest-item">
                <div className="guest-avatar"><IconHeadphones /></div>
                <span style={{ fontWeight: 600, fontSize: '0.88rem', flex: 1 }}>{guest.alias}</span>
                <span className="guest-meta">{guest.address}</span>
                <span className={`badge ${guest.ready ? 'badge--ready' : 'badge--waiting'}`}>
                  {guest.ready ? 'READY' : 'WAITING'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )

  // ─── Render: Guest Now Playing ──────────────────────────────────────────────

  const renderGuestPlayer = () => (
    <>
      {/* Now Listening — main guest card */}
      <div className="panel panel--guest-now-playing">
        <div className="guest-np-header">
          <span className="panel-title" style={{ fontSize: '0.72rem' }}>Now Listening</span>
          <div className="guest-status-badges">
            <span className={`guest-status-badge ${guestStreamReady ? 'guest-status-badge--ready' : ''}`}>
              {guestStreamReady ? '● Stream' : '○ Stream'}
            </span>
            <span className={`guest-status-badge ${guestSyncReady ? 'guest-status-badge--ready' : ''}`}>
              {guestSyncReady ? '● Synced' : '○ Sync'}
            </span>
          </div>
        </div>

        {/* Track info */}
        <div className="now-playing-track">
          <div className="track-artwork track-artwork--guest">
            <IconHeadphones />
          </div>
          <div className="track-details">
            {guestTrackName ? (
              <>
                <div className="track-name" title={guestTrackName}>{guestTrackName}</div>
                <div className="track-sub">
                  {formatTime(guestPositionMs)} / {formatTime(guestDurationMs)}
                  {' · '}from {guestHostId ? guestHostId.slice(0, 6) : 'host'}
                </div>
              </>
            ) : (
              <>
                <div className="track-name" style={{ color: 'var(--text-muted)' }}>Waiting for host…</div>
                <div className="track-sub">Host hasn't started playback yet</div>
              </>
            )}
          </div>
        </div>

        {/* Guest progress bar (read-only — host controls position) */}
        {guestTrackName && (
          <div className="progress-container">
            <div className="guest-progress-bar">
              <div className="guest-progress-fill" style={{ width: `${guestProgressPercent}%` }} />
            </div>
            <div className="progress-times">
              <span>{formatTime(guestPositionMs)}</span>
              <span>{formatTime(guestDurationMs)}</span>
            </div>
          </div>
        )}

        {/* ── GUEST VOLUME CONTROL (the key fix) ── */}
        <div className="guest-volume-section">
          <p className="panel-title" style={{ marginBottom: 4 }}>Your Volume</p>
          <div className="control-row">
            <button className="ctrl-btn" onClick={() => setGuestMuted((m) => !m)} aria-label={guestMuted ? 'Unmute' : 'Mute'}>
              {guestMuted || guestVolume === 0 ? <IconVolumeMute /> : <IconVolumeFull />}
            </button>
            <input
              type="range" className="volume-slider"
              style={{ '--vol-progress': `${guestVolPercent}%`, flex: 1 } as React.CSSProperties}
              min={0} max={1} step={0.01}
              value={guestMuted ? 0 : guestVolume}
              aria-label="Guest volume"
              aria-valuetext={`${Math.round(guestVolPercent)}%`}
              onChange={(e) => {
                const v = Number(e.target.value)
                setGuestVolume(v)
                if (v > 0) setGuestMuted(false)
              }}
            />
            <span className="control-val">{Math.round(guestVolPercent)}%</span>
          </div>
        </div>


        {guestError ? <div className="alert alert--error" role="alert">⚠ {guestError}</div> : null}
      </div>

      {/* Session info */}
      <div className="panel">
        <p className="panel-title">Session</p>
        <div className="session-code-display" style={{ fontSize: '1.4rem' }}>{sessionCode}</div>
        <div className="meta-row">
          <span><span className="status-dot status-dot--connected" style={{ display: 'inline-block', marginRight: 5 }} />Connected</span>
          {guestHostId && <span>Host: {guestHostId.slice(0, 6)}</span>}
          <span>Offset: {clockOffsetMs.toFixed(0)}ms</span>
        </div>
      </div>
    </>
  )

  // ─── Render: Discover + Join (shared) ──────────────────────────────────────

  const renderJoinSection = () => (
    <div className="panel">
      <p className="panel-title">Join a Session</p>
      <div className="join-row">
        <input className="input" placeholder="Host IP (e.g. 192.168.1.5)"
          aria-label="Manual host IP" value={manualHost}
          onChange={(e) => setManualHost(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void connectToHost(manualHost, joinPort)} />
        <button className="btn btn--primary"
          onClick={() => void connectToHost(manualHost, joinPort)}
          disabled={!manualHost}>
          {guestConnected ? 'Reconnect' : 'Join'}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="pill">Port {joinPort}</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {connectionTarget && !guestConnected && retryEnabled && retryCount > 0
            ? `Retrying ${retryCount}/${maxRetries}…` : ''}
        </span>
      </div>

      <div style={{ marginTop: '4px', paddingTop: '16px', borderTop: '1px solid var(--glass-border)' }}>
        <p className="panel-title" style={{ marginBottom: '12px' }}>Discovered on LAN</p>
        {discovered.length > 0 ? (
          <div className="session-list">
            {discovered.map((service) => {
              const hostAddress = pickHostAddress(service)
              return (
                <div key={`${service.name}-${service.port}`} className="session-item">
                  <div>
                    <div className="session-title">{service.sessionCode ?? service.name}</div>
                    <div className="session-meta">{hostAddress || 'Unknown'}:{service.port}</div>
                    <span className={`badge badge--${service.source}`}>{service.source.toUpperCase()}</span>
                  </div>
                  <button className="btn btn--ghost" style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    onClick={() => void connectToHost(hostAddress, service.port)}
                    disabled={!hostAddress}>Connect</button>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'var(--bg-layer2)', borderRadius: '8px', border: '1px dashed var(--glass-border)' }}>
            <span style={{ display: 'inline-block', marginRight: '8px' }}>⟳</span>
            Scanning for local sessions...
          </div>
        )}
      </div>

      {guestError ? <div className="alert alert--error" role="alert">⚠ {guestError}</div> : null}
      {udpError ? <div className="alert alert--warn" role="alert">⚠ UDP: {udpError}</div> : null}
    </div>
  )

  // ─── Render: Host Queue ─────────────────────────────────────────────────────

  const renderHostQueue = () => (
    <div className="panel">
      <p className="panel-title">Play Queue</p>
      <div className="btn-row">
        <button className="btn btn--primary" onClick={handlePickAudio}><IconPlus /> Add Track</button>
      </div>
      {queue.length === 0 ? (
        <p className="hint">Queue is empty. Add tracks to get started.</p>
      ) : (
        <div className="queue-list" role="list">
          {queue.map((track, i) => (
            <div key={track.id} role="listitem"
              className={`queue-item ${i === currentQueueIndex ? 'queue-item--active' : ''}`}
              onClick={() => void loadTrackFromQueue(i)} style={{ cursor: 'pointer' }}>
              <span className="queue-item__index">{i === currentQueueIndex && hostPlaying ? '♪' : i + 1}</span>
              <span className="queue-item__name" title={track.fileName}>{track.fileName}</span>
              <button type="button" className="queue-item__remove"
                onClick={(e) => { e.stopPropagation(); removeFromQueue(i) }}
                aria-label={`Remove ${track.fileName}`}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ─── Render: Guest Queue ────────────────────────────────────────────────────

  const renderGuestQueue = () => (
    <div className="panel">
      <p className="panel-title">Request a Song</p>
      {!queueRequestsAllowed ? (
        <div className="alert alert--warn">Host has disabled song requests.</div>
      ) : (
        <>
          <p className="hint" style={{ marginBottom: 8 }}>
            Type a song name to suggest it to the host. The host can approve or deny your request.
          </p>
          <p className="hint" style={{ marginBottom: 8 }}>
            If you have local music and you want to share it, you can upload an audio file directly to the host.
          </p>
          {guestPendingRequest ? (
            <div className="guest-pending-request">
              <IconQueue />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Request pending…</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>"{guestPendingRequest.suggestion}"</div>
              </div>
              <button className="btn btn--ghost" style={{ marginLeft: 'auto', fontSize: '0.78rem' }}
                onClick={() => setGuestPendingRequest(null)}>Cancel</button>
            </div>
          ) : (
            <div className="join-row" style={{ display: 'flex', gap: '8px' }}>
              <input className="input" placeholder="Song name or artist…"
                value={guestSuggestion}
                onChange={(e) => setGuestSuggestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleGuestSuggestTrack()}
                aria-label="Song suggestion" style={{ flex: 1 }} />
              <button className="btn btn--primary"
                disabled={!guestSuggestion.trim() || !guestConnected}
                onClick={() => void handleGuestSuggestTrack()} title="Request by name">
                <IconSend />
              </button>
              <button className="btn btn--ghost" 
                disabled={!guestConnected}
                onClick={() => void handleGuestSuggestFile()} title="Upload audio file">
                <IconPlus /> File
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )

  // ─── Render: Playlists (host full CRUD / guest read+suggest) ───────────────

  const renderPlaylists = () => (
    <div className="panel">
      <p className="panel-title">Playlists</p>

      <div style={{ display: 'grid', gap: 8 }}>
        <div className="join-row">
          <input className="input input--compact" placeholder="New playlist name…"
            value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleCreatePlaylist()} />
          <button className="btn btn--primary" onClick={() => void handleCreatePlaylist()}><IconPlus /></button>
        </div>
        {playlistError && <div className="alert alert--error">{playlistError}</div>}
      </div>

      {isGuest && (
        <p className="hint" style={{ marginBottom: 4 }}>
          These are your local playlists. You can suggest songs from them to the host.
        </p>
      )}
      {!isHost && !isGuest && (
        <p className="hint" style={{ marginBottom: 4 }}>
          Manage your playlists here before joining a session.
        </p>
      )}

      {playlists.length === 0 ? (
        <p className="hint">No playlists yet. Create one above.</p>
      ) : (
        <div className="playlist-list" role="list">
          {playlists.map((pl) => (
            <div key={pl.id} className="playlist-item" role="listitem" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="playlist-item__name">{pl.name}</div>
                  <div className="playlist-item__count">{pl.tracks.length} track{pl.tracks.length !== 1 ? 's' : ''}</div>
                </div>
                <div className="playlist-item__actions">
                  {isHost && (
                    <button className="btn btn--ghost" style={{ fontSize: '0.78rem', padding: '5px 10px' }}
                      onClick={() => void handleLoadPlaylist(pl)}>Play / Load</button>
                  )}
                  {isHost && queue.length > 0 && (
                    <button className="btn btn--ghost" style={{ fontSize: '0.78rem', padding: '5px 10px' }}
                      onClick={() => void handleSaveQueueAsPlaylist(pl.id)}>Save Q</button>
                  )}
                  {(isGuest || (!isHost && !isGuest)) && pl.tracks.length > 0 && (
                    <button className="btn btn--ghost" style={{ fontSize: '0.78rem', padding: '5px 10px' }}
                      onClick={() => {
                        const track = pl.tracks[0]
                        if (track) {
                          setGuestSuggestion(track.fileName)
                          setActiveView('queue')
                        }
                      }}>Suggest Top</button>
                  )}
                  <button className="btn btn--ghost" style={{ fontSize: '0.78rem', padding: '5px 10px' }}
                    onClick={() => void handleAddTrackToPlaylist(pl.id)}>+ Add Track</button>
                  <button className="btn btn--danger" style={{ padding: '5px 8px' }}
                    onClick={() => void handleDeletePlaylist(pl.id)}><IconTrash /></button>
                </div>
              </div>
              
              {/* Expand to show tracks */}
              {pl.tracks.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--bg-layer1)', padding: '6px', borderRadius: '6px' }}>
                  {pl.tracks.map((track, i) => (
                    <div key={track.id} style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i + 1}. {track.fileName}</span>
                      {isGuest && (
                        <button className="btn btn--ghost" style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                          onClick={() => {
                            setGuestSuggestion(track.fileName)
                            setActiveView('queue')
                          }}>Suggest</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ─── Render: Network ────────────────────────────────────────────────────────

  const renderNetwork = () => (
    <>
      <div className="panel">
        <p className="panel-title">Network Settings</p>
        <div className="settings-grid">
          <label className="field">
            <span className="field-label">Host port</span>
            <input className="input input--compact" value={hostPortInput} inputMode="numeric"
              onChange={(e) => setHostPortInput(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Join port</span>
            <input className="input input--compact" value={joinPortInput} inputMode="numeric"
              onChange={(e) => setJoinPortInput(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">UDP broadcast port</span>
            <input className="input input--compact" value={broadcastPortInput} inputMode="numeric"
              onChange={(e) => setBroadcastPortInput(e.target.value)} />
          </label>
        </div>
        <div className="toggle-row">
          <label className="toggle">
            <input type="checkbox" checked={mdnsEnabled} onChange={(e) => setMdnsEnabled(e.target.checked)} />
            <span className="switch" aria-hidden="true" /><span className="toggle-label">mDNS discovery</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={udpEnabled} onChange={(e) => setUdpEnabled(e.target.checked)} />
            <span className="switch" aria-hidden="true" /><span className="toggle-label">UDP fallback</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={retryEnabled} onChange={(e) => setRetryEnabled(e.target.checked)} />
            <span className="switch" aria-hidden="true" /><span className="toggle-label">Auto-retry</span>
          </label>
        </div>
        <p className="hint">Tip: keep mDNS + UDP enabled for best LAN discovery.</p>
      </div>
      <div className="panel">
        <p className="panel-title">Activity Log</p>
        {logs.length === 0 ? <p className="hint">No activity yet.</p> : (
          <div className="log-list" aria-live="polite">
            {logs.map((entry) => <div key={entry.id} className="log-item">{entry.message}</div>)}
          </div>
        )}
      </div>
    </>
  )

  // ─── Render: Settings ───────────────────────────────────────────────────────

  const renderSettings = () => (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="panel">
        <p className="panel-title">Appearance</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.85rem' }}>Theme</span>
          <select 
            className="input input--compact" 
            style={{ width: 'auto', minWidth: '120px' }}
            value={theme} 
            onChange={(e) => setTheme(e.target.value as any)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>
      <div className="panel">
        <p className="panel-title">Keyboard Shortcuts</p>
      <div style={{ display: 'grid', gap: 10, fontSize: '0.85rem' }}>
        {[
          ['Space', 'Play / Pause (host)'],
          ['← / →', 'Seek ±10 seconds (host)'],
          ['↑ / ↓', 'Volume ±5%'],
          ['M', 'Toggle mute'],
        ].map(([key, desc]) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <code style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '3px 10px', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--accent-bright)' }}>{key}</code>
            <span style={{ color: 'var(--text-secondary)', flex: 1, textAlign: 'right' }}>{desc}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
  )

  // ─── Main view routing ──────────────────────────────────────────────────────

  const renderIdlePlayer = () => (
  <>
    <div className="landing-grid">
      {/* ── Your Session / Start Host ── */}
      <div className="panel panel--accent panel--session landing-card-host">
        <p className="panel-title">Your Session</p>
        <div className="session-code-display" aria-live="polite">{sessionCode}</div>
        <div className="btn-row">
          <button className="btn btn--ghost" onClick={handleNewCode} aria-label="Generate new code">New Code</button>
          <button className="btn btn--primary btn--hero" onClick={() => void handleStartHost()}
            aria-label={`Start hosting on port ${hostPort}`}>
            🎙 Host on {hostPort}
          </button>
        </div>
        <div className="meta-row">
          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Start a session so others can join via LAN</span>
          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{deviceAlias}</span>
        </div>
        {hostError ? <div className="alert alert--error" role="alert">⚠ {hostError}</div> : null}
      </div>

      {/* ── Join a Session ── */}
      <div className="landing-card-join">
        {renderJoinSection()}
      </div>
    </div>

    {/* ── Banner ── */}
    <div className="landing-banner">
      <div className="landing-banner-title">Made by Bees of the Hive</div>
      <div className="landing-banner-quote">"The hive mind is in the music. Listen together."</div>
    </div>
  </>
  )

  const renderMainContent = () => {
    switch (activeView) {
      case 'player':
        if (isHost) return renderHostPlayer()
        if (isGuest) return renderGuestPlayer()
        return renderIdlePlayer()

      case 'queue':
        if (isHost) return renderHostQueue()
        if (isGuest) return renderGuestQueue()
        return <div className="panel"><p className="hint">Join or host a session first.</p></div>

      case 'playlists':
        return renderPlaylists()

      case 'network':
        return renderNetwork()

      case 'settings':
        return renderSettings()
    }
  }

  // ─── Player bar ─────────────────────────────────────────────────────────────

  // FIX: player bar is now fully role-aware
  const playerBarTitle = isGuest
    ? (guestTrackName || 'Waiting for host…')
    : (selectedTrack?.fileName ?? 'No track selected')

  const playerBarSub = isGuest
    ? `${formatTime(guestPositionMs)} / ${formatTime(guestDurationMs)}`
    : `${formatTime(hostPositionMs)} / ${formatTime(hostDurationMs)}`

  const playerBarProgress = isGuest ? guestProgressPercent : progressPercent

  // ─── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className="app" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDropAudio}>
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <IconPlus />
            <h2>Drop Audio File</h2>
            <p>Load track into Now Playing</p>
          </div>
        </div>
      )}
      {/* ── Header ── */}
      <header className="app__header">
        <div className="brand">
          <div className="brand-icon" aria-hidden="true" />
          HiveBeats
        </div>
        <div className="header-status">
          {isHost && (
            <><span className="status-dot status-dot--live" /><span>Hosting · {guestList.length} guest{guestList.length !== 1 ? 's' : ''}</span></>
          )}
          {isGuest && (
            <><span className="status-dot status-dot--connected" /><span>Connected to session</span></>
          )}
        </div>

        {/* FIX: Disconnect / Stop Host icon in header */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="header-info-icon" title="Local audio sessions over Wi-Fi">
            <IconWifi />
          </div>
          {isHost && (
            <button className="header-action-btn" onClick={handleStopHost} title="Stop hosting session" aria-label="Stop hosting session">
              <IconDisconnect />
              <span>Stop</span>
            </button>
          )}
          {isGuest && (
            <button className="header-action-btn header-action-btn--danger" onClick={() => void handleDisconnect()} title="Disconnect from session" aria-label="Disconnect from session">
              <IconDisconnect />
              <span>Disconnect</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Sidebar ── */}
      <nav className="app__sidebar" aria-label="Main navigation">
        <span className="nav-section-label">Player</span>
        <button className={`nav-btn ${activeView === 'player' ? 'nav-btn--active' : ''}`}
          onClick={() => setActiveView('player')} aria-current={activeView === 'player' ? 'page' : undefined}>
          {isGuest ? <IconHeadphones /> : <IconMusic />}
          {isGuest ? 'Listening' : 'Now Playing'}
        </button>
        <button className={`nav-btn ${activeView === 'queue' ? 'nav-btn--active' : ''}`}
          onClick={() => setActiveView('queue')} aria-current={activeView === 'queue' ? 'page' : undefined}>
          <IconQueue />
          {isGuest ? 'Request Song' : 'Queue'}
          {isHost && queue.length > 0 && <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{queue.length}</span>}
          {isHost && pendingQueueRequests.length > 0 && (
            <span className="nav-badge">{pendingQueueRequests.length}</span>
          )}
        </button>
        <button className={`nav-btn ${activeView === 'playlists' ? 'nav-btn--active' : ''}`}
          onClick={() => setActiveView('playlists')} aria-current={activeView === 'playlists' ? 'page' : undefined}>
          <IconList />
          Playlists
          {playlists.length > 0 && <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{playlists.length}</span>}
        </button>

        <span className="nav-section-label">Session</span>
        <button className={`nav-btn ${activeView === 'network' ? 'nav-btn--active' : ''}`}
          onClick={() => setActiveView('network')} aria-current={activeView === 'network' ? 'page' : undefined}>
          <IconWifi /> Network
          {logs.length > 0 && <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{logs.length}</span>}
        </button>
        <button className={`nav-btn ${activeView === 'settings' ? 'nav-btn--active' : ''}`}
          onClick={() => setActiveView('settings')} aria-current={activeView === 'settings' ? 'page' : undefined}>
          <IconSettings /> Settings
        </button>
      </nav>

      {/* ── Main content ── */}
      <main className="app__main" aria-label="Main content">
        {renderMainContent()}
      </main>

      {/* ── Bottom player bar ── */}
      <div className="player-bar" role="region" aria-label="Playback controls">
        {/* Left: track info */}
        <div className="player-bar__track">
          <div className="player-bar__artwork" aria-hidden="true">
            {isGuest ? <IconHeadphones /> : <IconMusic />}
          </div>
          <div className="player-bar__meta">
            <div className="player-bar__title">{playerBarTitle}</div>
            <div className="player-bar__sub">{playerBarSub}</div>
          </div>
        </div>

        {/* Center: controls + progress */}
        <div className="player-bar__controls">
          <div className="player-bar__buttons">
            {/* Prev/next — host only */}
            <button className="ctrl-btn"
              onClick={() => void handlePrevTrack()}
              disabled={!isHost || currentQueueIndex <= 0}
              aria-label="Previous track"
              style={{ opacity: isGuest ? 0.2 : undefined }}>
              <IconSkipPrev />
            </button>

            {hostPlaying ? (
              <button className="play-btn-main" onClick={() => void handlePause()} disabled={!isHost} aria-label="Pause">
                <IconPause />
              </button>
            ) : (
              <button className="play-btn-main" onClick={() => void handlePlay()} disabled={!isHost || !selectedTrack} aria-label="Play">
                <IconPlay />
              </button>
            )}

            <button className="ctrl-btn"
              onClick={() => void handleNextTrack()}
              disabled={!isHost || currentQueueIndex >= queue.length - 1}
              aria-label="Next track"
              style={{ opacity: isGuest ? 0.2 : undefined }}>
              <IconSkipNext />
            </button>
          </div>

          <div className="player-bar__progress">
            <span className="player-bar__time">{isGuest ? formatTime(guestPositionMs) : formatTime(hostPositionMs)}</span>
            <input type="range" className="timeline"
              style={{ '--progress': `${playerBarProgress}%`, flex: 1, cursor: isGuest ? 'default' : 'pointer' } as React.CSSProperties}
              min={0} max={Math.max(1, isGuest ? guestDurationMs : hostDurationMs)}
              value={isGuest ? guestPositionMs : Math.min(hostPositionMs, hostDurationMs)}
              aria-label="Track position"
              onChange={(e) => {
                if (isGuest) return
                isScrubbing.current = true
                const v = Number(e.target.value)
                setHostPositionMs(v)
                if (hostAudioRef.current) hostAudioRef.current.currentTime = v / 1000
              }}
              onMouseUp={(e) => {
                if (isGuest) return
                isScrubbing.current = false
                void handleSeek(Number(e.currentTarget.value))
              }}
              onTouchEnd={(e) => {
                if (isGuest) return
                isScrubbing.current = false
                void handleSeek(Number(e.currentTarget.value))
              }}
              disabled={isGuest || !selectedTrack || !isHost}
            />
            <span className="player-bar__time">{isGuest ? formatTime(guestDurationMs) : formatTime(hostDurationMs)}</span>
          </div>
        </div>

        {/* Right: volume — FIX: shows GUEST volume when in guest mode */}
        <div className="player-bar__right">
          <div className="volume-control">
            {isGuest ? (
              <>
                <button className="ctrl-btn" onClick={() => setGuestMuted((m) => !m)} aria-label={guestMuted ? 'Unmute' : 'Mute'}>
                  {guestMuted || guestVolume === 0 ? <IconVolumeMute /> : <IconVolumeFull />}
                </button>
                <input type="range" className="volume-slider"
                  style={{ '--vol-progress': `${guestVolPercent}%` } as React.CSSProperties}
                  min={0} max={1} step={0.01} value={guestMuted ? 0 : guestVolume}
                  aria-label="Your volume"
                  onChange={(e) => { const v = Number(e.target.value); setGuestVolume(v); if (v > 0) setGuestMuted(false) }} />
              </>
            ) : (
              <>
                <button className="ctrl-btn" onClick={() => setHostMuted((m) => !m)} aria-label={hostMuted ? 'Unmute' : 'Mute'}>
                  {hostMuted || hostVolume === 0 ? <IconVolumeMute /> : <IconVolumeFull />}
                </button>
                <input type="range" className="volume-slider"
                  style={{ '--vol-progress': `${hostVolPercent}%` } as React.CSSProperties}
                  min={0} max={1} step={0.01} value={hostMuted ? 0 : hostVolume}
                  aria-label="Volume"
                  onChange={(e) => { const v = Number(e.target.value); setHostVolume(v); if (v > 0) setHostMuted(false) }} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Hidden audio */}
      <audio ref={hostAudioRef} className="hidden-audio" preload="auto" aria-hidden="true" />
      <audio ref={guestAudioRef} className="hidden-audio" preload="auto" aria-hidden="true" />
    </div>
  )
}

export default App
