import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { generateSessionCode } from './lib/sessionCode'
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
  StreamChunkMessage,
  StreamEndMessage,
  StreamMessage,
  SyncPingMessage,
  SyncPongMessage,
} from './types/streaming'
import './App.css'

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

type TrackSelection = {
  id: string
  filePath: string
  fileName: string
  mimeType: string
}

// Extended command messages with sequence number
type ExtendedPlayCommand = PlayCommandMessage & { seq: number; epoch: number }
type ExtendedPauseCommand = PauseCommandMessage & { seq: number; epoch: number }
type ExtendedSeekCommand = SeekCommandMessage & { seq: number; epoch: number }

const SYNC_INTERVAL_MS = 5000
const HOST_PLAY_DELAY_MS = 1200
const HOST_PAUSE_DELAY_MS = 80
const GUEST_READY_BUFFER_SECONDS = 2.5
const GUEST_READY_POSITION_TOLERANCE_SECONDS = 0.15

function App() {
  const [sessionCode, setSessionCode] = useState(() => generateSessionCode())
  const [mdnsDiscovered, setMdnsDiscovered] = useState<MdnsSessionAnnouncement[]>([])
  const [udpDiscovered, setUdpDiscovered] = useState<UdpAnnouncement[]>([])
  const [manualHost, setManualHost] = useState('')
  const [hostRunning, setHostRunning] = useState(false)
  const [guestConnected, setGuestConnected] = useState(false)
  const [guestCount, setGuestCount] = useState(0)
  const [guestHostId, setGuestHostId] = useState('')
  const [guestList, setGuestList] = useState<GuestInfo[]>([])
  const [hostError, setHostError] = useState<string | null>(null)
  const [guestError, setGuestError] = useState<string | null>(null)
  const [udpError, setUdpError] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [selectedTrack, setSelectedTrack] = useState<TrackSelection | null>(null)
  const [streamingTrackId, setStreamingTrackId] = useState<string | null>(null)
  const [guestTrackId, setGuestTrackId] = useState<string | null>(null)
  const [hostPlaying, setHostPlaying] = useState(false)
  const [hostDurationMs, setHostDurationMs] = useState(0)
  const [hostPositionMs, setHostPositionMs] = useState(0)
  const [guestTrackName, setGuestTrackName] = useState('')
  const [clockOffsetMs, setClockOffsetMs] = useState(0)
  const [guestVolume, setGuestVolume] = useState(0.9)
  const [guestMuted, setGuestMuted] = useState(false)
  const [guestStreamReady, setGuestStreamReady] = useState(false)
  const [guestSyncReady, setGuestSyncReady] = useState(false)
  const [guestReadyRequested, setGuestReadyRequested] = useState(false)
  const [guestReadyAcknowledged, setGuestReadyAcknowledged] = useState(false)
  const [pendingPlay, setPendingPlay] = useState(false)
  const [hostPortInput, setHostPortInput] = useState('7400')
  const [joinPortInput, setJoinPortInput] = useState('7400')
  const [broadcastPortInput, setBroadcastPortInput] = useState('7401')
  const [mdnsEnabled, setMdnsEnabled] = useState(true)
  const [udpEnabled, setUdpEnabled] = useState(true)
  const [retryEnabled, setRetryEnabled] = useState(true)
  const [connectionTarget, setConnectionTarget] = useState<{ host: string; port: number } | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hostPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hostPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const guestPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const guestPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const guestSeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hostAudioRef = useRef<HTMLAudioElement | null>(null)
  const guestAudioRef = useRef<HTMLAudioElement | null>(null)
  const mediaSourceRef = useRef<MediaSource | null>(null)
  const sourceBufferRef = useRef<SourceBuffer | null>(null)
  const chunkQueueRef = useRef<Uint8Array[]>([])
  const streamEndPendingRef = useRef(false)
  const guestBufferedBytesRef = useRef(0)
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
  const transportEpochRef = useRef(0)

  const hostPort = Number(hostPortInput) || 7400
  const joinPort = Number(joinPortInput) || hostPort
  const broadcastPort = Number(broadcastPortInput) || 7401
  const broadcastIntervalMs = 3000
  const maxRetries = 3
  const showHostControls = hostRunning
  const showGuestControls = guestConnected && !hostRunning
  const deviceId = useMemo(() => crypto.randomUUID(), [])
  const deviceAlias = useMemo(() => `Desktop-${deviceId.slice(0, 4)}`, [deviceId])

  const addLog = useCallback((message: string) => {
    setLogs((current) => [{ id: crypto.randomUUID(), message }, ...current].slice(0, 6))
  }, [])

  const formatTime = (ms: number) => {
    if (!Number.isFinite(ms)) return '0:00'
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const filePathToUrl = (filePath: string) => {
    const normalized = filePath.replace(/\\/g, '/')
    const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`
    return `hivebeats://file${withLeadingSlash}`
  }

  const decodeBase64 = (data: string) => {
    const binary = atob(data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return bytes
  }

  const getBufferedAhead = useCallback((audio: HTMLAudioElement, positionSeconds: number) => {
    for (let index = 0; index < audio.buffered.length; index += 1) {
      const start = audio.buffered.start(index)
      const end = audio.buffered.end(index)
      if (
        start <= positionSeconds + GUEST_READY_POSITION_TOLERANCE_SECONDS &&
        end > positionSeconds
      ) {
        return end - positionSeconds
      }
    }

    return 0
  }, [])

  const appendNextChunk = useCallback(() => {
    const sourceBuffer = sourceBufferRef.current
    if (!sourceBuffer || sourceBuffer.updating) return

    const chunk = chunkQueueRef.current.shift()
    if (chunk) {
      sourceBuffer.appendBuffer(Uint8Array.from(chunk).buffer)
      return
    }

    if (streamEndPendingRef.current && mediaSourceRef.current?.readyState === 'open') {
      streamEndPendingRef.current = false
      mediaSourceRef.current.endOfStream()
    }
  }, [])

  const areAllGuestsReady = useCallback((readyIds: Set<string>, guests: GuestInfo[]) => {
    if (guests.length === 0) return true
    return guests.every((guest) => readyIds.has(guest.id))
  }, [])

  const nextTransportEpoch = useCallback(() => {
    transportEpochRef.current += 1
    return transportEpochRef.current
  }, [])

  // Clear all host transport timers
  const clearHostTransportTimers = useCallback(() => {
    if (hostPlayTimerRef.current) {
      clearTimeout(hostPlayTimerRef.current)
      hostPlayTimerRef.current = null
    }
    if (hostPauseTimerRef.current) {
      clearTimeout(hostPauseTimerRef.current)
      hostPauseTimerRef.current = null
    }
  }, [])

  // Clear all guest transport timers
  const clearGuestTransportTimers = useCallback(() => {
    if (guestPlayTimerRef.current) {
      clearTimeout(guestPlayTimerRef.current)
      guestPlayTimerRef.current = null
    }
    if (guestPauseTimerRef.current) {
      clearTimeout(guestPauseTimerRef.current)
      guestPauseTimerRef.current = null
    }
    if (guestSeekTimerRef.current) {
      clearTimeout(guestSeekTimerRef.current)
      guestSeekTimerRef.current = null
    }
  }, [])

  const startPlayback = useCallback(
    (positionMs: number, epoch = nextTransportEpoch()) => {
      if (!selectedTrack) return

      clearHostTransportTimers()

      const seq = hostCommandSeqRef.current++
      const playAt = Date.now() + HOST_PLAY_DELAY_MS
      const command: ExtendedPlayCommand = {
        type: 'CMD_PLAY',
        trackId: selectedTrack.id,
        playAt,
        positionMs,
        seq,
        epoch,
      }

      const audio = hostAudioRef.current
      if (!audio) return

      audio.muted = false
      audio.volume = 1

      void window.hivebeats.broadcastToGuests(command)
      hostPlayTimerRef.current = setTimeout(() => {
        if (transportEpochRef.current !== epoch) return
        audio.play().catch(() => {
          setHostError('Unable to start playback. Try again.')
        })
      }, Math.max(0, playAt - Date.now()))

      setHostPlaying(true)
      setPendingPlay(false)
      pendingPlayRef.current = false
    },
    [nextTransportEpoch, selectedTrack, clearHostTransportTimers],
  )

  const scheduleHostPause = useCallback((pauseAt: number, epoch: number) => {
    const audio = hostAudioRef.current
    if (!audio) return
    hostPauseTimerRef.current = setTimeout(() => {
      if (transportEpochRef.current !== epoch) return
      audio.pause()
      setHostPlaying(false)
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

  const sendPlayToGuest = useCallback(
    async (clientId: string, positionMs: number) => {
      if (!selectedTrack) return

      const epoch = nextTransportEpoch()
      const playAt = Date.now() + HOST_PLAY_DELAY_MS
      const command: ExtendedPlayCommand = {
        type: 'CMD_PLAY',
        trackId: selectedTrack.id,
        playAt,
        positionMs,
        seq: hostCommandSeqRef.current++,
        epoch,
      }

      await window.hivebeats.sendToGuest(clientId, command)
    },
    [nextTransportEpoch, selectedTrack],
  )

  const requestGuestReadyAt = useCallback(
    async (clientId: string, positionMs: number) => {
      if (!selectedTrack) return

      const message: ReadyRequestMessage = {
        type: 'READY_REQUEST',
        trackId: selectedTrack.id,
        positionMs,
      }

      guestReadyIdsRef.current.delete(clientId)
      setGuestList((current) =>
        current.map((guest) => (guest.id === clientId ? { ...guest, ready: false } : guest)),
      )
      await window.hivebeats.sendToGuest(clientId, message)
    },
    [selectedTrack],
  )

  const requestGuestReady = useCallback(async () => {
    if (!selectedTrack) return
    if (guestCount <= 0) return

    const audio = hostAudioRef.current
    const positionMs = audio ? audio.currentTime * 1000 : 0
    const message: ReadyRequestMessage = {
      type: 'READY_REQUEST',
      trackId: selectedTrack.id,
      positionMs,
    }

    resetHostReadiness()
    await window.hivebeats.broadcastToGuests(message)
    addLog('Requested guests to get ready')
  }, [addLog, guestCount, resetHostReadiness, selectedTrack])

  const checkGuestReady = useCallback(() => {
    if (guestReadySentRef.current) return
    const audio = guestAudioRef.current
    if (!audio || audio.buffered.length === 0) return

    const targetSeconds = guestReadyPositionMsRef.current / 1000
    const bufferedAhead = getBufferedAhead(audio, targetSeconds)
    if (bufferedAhead < GUEST_READY_BUFFER_SECONDS) return

    if (Math.abs(audio.currentTime - targetSeconds) > GUEST_READY_POSITION_TOLERANCE_SECONDS) {
      audio.currentTime = targetSeconds
      return
    }

    if (audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

    if (bufferedAhead >= GUEST_READY_BUFFER_SECONDS) {
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
      type: 'READY_ACK',
      trackId: guestTrackIdRef.current ?? 'unknown',
      positionMs: audio.currentTime * 1000,
    }

    await window.hivebeats.sendToHost(message)
    guestReadyAcknowledgedRef.current = true
    setGuestReadyAcknowledged(true)
    setGuestError(null)
    addLog('Ready sent to host')
  }, [addLog])

  const resetGuestStream = useCallback(
    (mimeType: string, fileName: string) => {
      const audio = guestAudioRef.current
      if (!audio) return

      // Reset guest timer and command sequence
      clearGuestTransportTimers()
      guestLastCommandIdRef.current = -1

      mediaSourceRef.current = null
      sourceBufferRef.current = null
      chunkQueueRef.current = []
      streamEndPendingRef.current = false
      guestBufferedBytesRef.current = 0
      guestReadySentRef.current = false
      guestReadyAcknowledgedRef.current = false
      guestStreamReadyRef.current = false
      guestSyncReadyRef.current = false
      guestTrackIdRef.current = null
      setGuestStreamReady(false)
      setGuestSyncReady(false)
      setGuestReadyAcknowledged(false)
      setGuestTrackName(fileName)

      const mediaSource = new MediaSource()
      mediaSourceRef.current = mediaSource
      audio.src = URL.createObjectURL(mediaSource)

      mediaSource.addEventListener('sourceopen', () => {
        if (!mediaSourceRef.current || mediaSourceRef.current.readyState !== 'open') return
        try {
          const sourceBuffer = mediaSource.addSourceBuffer(mimeType)
          sourceBufferRef.current = sourceBuffer
          sourceBuffer.addEventListener('updateend', () => {
            appendNextChunk()
            checkGuestReady()
            void trySendReadyAck()
          })
          appendNextChunk()
        } catch {
          setGuestError('Stream mime type not supported on this device.')
        }
      })
    },
    [appendNextChunk, checkGuestReady, clearGuestTransportTimers, trySendReadyAck],
  )

  const handleGuestReady = async () => {
    if (!guestSyncReadyRef.current) {
      await window.hivebeats.sendToHost({ type: 'SYNC_PING', t0: Date.now() })
    }
    checkGuestReady()
    await trySendReadyAck()
  }

  const pickHostAddress = (session: DiscoveredSession) => {
    const ipv4 = session.addresses.find((address) => /^\d{1,3}(\.\d{1,3}){3}$/.test(address))
    return ipv4 ?? session.host ?? ''
  }

  const discovered = useMemo<DiscoveredSession[]>(() => {
    const mdnsSessions = mdnsDiscovered.map((service) => ({
      source: 'mdns' as const,
      name: service.name,
      host: service.host,
      port: service.port,
      addresses: service.addresses,
      sessionCode: service.sessionCode,
    }))

    const udpSessions = udpDiscovered.map((announcement) => ({
      source: 'udp' as const,
      name: `HiveBeats-${announcement.code}`,
      host: announcement.host,
      port: announcement.port,
      addresses: [announcement.host],
      sessionCode: announcement.code,
    }))

    const unique = new Map<string, DiscoveredSession>()
    ;[...mdnsSessions, ...udpSessions].forEach((session) => {
      unique.set(`${session.sessionCode ?? session.name}-${session.host}-${session.port}`, session)
    })

    const all = Array.from(unique.values())
    return hostRunning ? all.filter((session) => session.sessionCode !== sessionCode) : all
  }, [hostRunning, mdnsDiscovered, sessionCode, udpDiscovered])

  const attemptConnect = useCallback(
    async (host: string, port: number, label: string) => {
      await window.hivebeats.connectToHost(host, port)
      addLog(`${label} ${host}:${port}`)
    },
    [addLog],
  )

  const connectToHost = async (host: string, port: number) => {
    if (!host) {
      setGuestError('Missing host address. Try manual IP entry.')
      return
    }
    setConnectionTarget({ host, port })
    setRetryCount(0)
    setGuestError(null)
    await attemptConnect(host, port, 'Connecting to')
  }

  const scheduleRetry = useCallback(() => {
    if (!retryEnabled || !connectionTarget) return
    if (retryCount >= maxRetries) return
    if (retryTimerRef.current) return

    const nextAttempt = retryCount + 1
    const delay = 800 * 2 ** retryCount

    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null
      setRetryCount(nextAttempt)
      attemptConnect(connectionTarget.host, connectionTarget.port, `Retry ${nextAttempt}/${maxRetries} to`)
    }, delay)
  }, [attemptConnect, connectionTarget, maxRetries, retryCount, retryEnabled])

  const sendHello = useCallback(async () => {
    const message: HostHelloMessage = {
      type: 'HELLO',
      deviceId,
      alias: deviceAlias,
    }
    await window.hivebeats.sendToHost(message)
  }, [deviceAlias, deviceId])

  const handleNewCode = () => {
    setSessionCode(generateSessionCode())
  }

  const handlePickAudio = async () => {
    const result = await window.hivebeats.pickAudioFile()
    if (result.canceled) return

    const track: TrackSelection = {
      id: crypto.randomUUID(),
      filePath: result.filePath,
      fileName: result.fileName,
      mimeType: result.mimeType,
    }

    setSelectedTrack(track)
    setStreamingTrackId(null)
    resetHostReadiness()

    const audio = hostAudioRef.current
    if (audio) {
      audio.src = filePathToUrl(result.filePath)
      audio.muted = false
      audio.volume = 1
      audio.load()
    }

    addLog(`Loaded ${result.fileName}`)
  }

  const handlePlay = async () => {
    if (!selectedTrack) {
      setHostError('Pick an audio file first.')
      return
    }

    if (hostPlaying) return

    const audio = hostAudioRef.current
    if (!audio) return

    if (streamingTrackId !== selectedTrack.id) {
      await window.hivebeats.startStream(
        selectedTrack.filePath,
        selectedTrack.fileName,
        selectedTrack.mimeType,
        selectedTrack.id,
      )
      setStreamingTrackId(selectedTrack.id)
      addLog('Streaming to guests')
    }

    const positionMs = audio.currentTime * 1000

    if (guestCount > 0 && !areAllGuestsReady(guestReadyIdsRef.current, guestList)) {
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

    const command: ExtendedPauseCommand = {
      type: 'CMD_PAUSE',
      pauseAt,
      positionMs,
      seq,
      epoch,
    }

    await window.hivebeats.broadcastToGuests(command)
    scheduleHostPause(pauseAt, epoch)
  }

  const handleStop = async () => {
    const audio = hostAudioRef.current
    if (!audio) return

    const epoch = nextTransportEpoch()
    clearHostTransportTimers()

    audio.pause()
    audio.currentTime = 0
    setHostPlaying(false)
    setHostPositionMs(0)
    setStreamingTrackId(null)
    setPendingPlay(false)
    pendingPlayRef.current = false

    await window.hivebeats.stopStream()

    const command: ExtendedPauseCommand = {
      type: 'CMD_PAUSE',
      pauseAt: Date.now(),
      positionMs: 0,
      seq: hostCommandSeqRef.current++,
      epoch,
    }

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

    const command: ExtendedSeekCommand = {
      type: 'CMD_SEEK',
      trackId: selectedTrack.id,
      playAt,
      positionMs,
      seq,
      epoch,
    }

    clearHostTransportTimers()
    setPendingPlay(false)
    pendingPlayRef.current = false

    await window.hivebeats.broadcastToGuests(command)
    resetHostReadiness()
  }

  const handleStartHost = async () => {
    await window.hivebeats.startHost(hostPort)
    if (mdnsEnabled) {
      await window.hivebeats.advertiseSession(sessionCode, hostPort)
    }
    if (udpEnabled) {
      await window.hivebeats.startUdpBroadcast(sessionCode, hostPort, broadcastPort, broadcastIntervalMs, deviceId)
    }
    setHostRunning(true)
    setHostError(null)
    addLog(`Host started on ${hostPort}`)
  }

  const handleStopHost = async () => {
    nextTransportEpoch()
    clearHostTransportTimers()
    await window.hivebeats.stopHost()
    await window.hivebeats.stopAdvertise()
    await window.hivebeats.stopUdpBroadcast()
    await window.hivebeats.stopStream()
    setHostRunning(false)
    setGuestCount(0)
    setGuestList([])
    setStreamingTrackId(null)
    setPendingPlay(false)
    pendingPlayRef.current = false
    guestReadyIdsRef.current.clear()
    addLog('Host stopped')
  }

  const handleDisconnect = async () => {
    clearGuestTransportTimers()
    await window.hivebeats.disconnectFromHost()
    setConnectionTarget(null)
    setRetryCount(0)
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
    addLog('Guest disconnected manually')
  }

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
          const exists = current.some((item) => toKey(item) === key)
          if (!exists) addLog(`mDNS: ${service.sessionCode ?? service.name} found`)
          const filtered = current.filter((item) => toKey(item) !== key)
          return [...filtered, service]
        })
      })

      cleanupDown = window.hivebeats.onServiceDown((service) => {
        setMdnsDiscovered((current) => current.filter((item) => toKey(item) !== toKey(service)))
        addLog(`mDNS: ${service.sessionCode ?? service.name} left`)
      })

      window.hivebeats.startDiscovery()
    } else {
      setMdnsDiscovered([])
      window.hivebeats.stopDiscovery()
    }

    if (udpEnabled) {
      cleanupUdpAnnouncement = window.hivebeats.onUdpAnnouncement((announcement) => {
        setUdpDiscovered((current) => {
          const key = `${announcement.code}-${announcement.host}-${announcement.port}`
          const exists = current.some((item) => `${item.code}-${item.host}-${item.port}` === key)
          if (!exists) addLog(`UDP: ${announcement.code} at ${announcement.host}`)
          const filtered = current.filter((item) => `${item.code}-${item.host}-${item.port}` !== key)
          return [...filtered, announcement]
        })
      })

      cleanupUdpError = window.hivebeats.onUdpError((error) => {
        setUdpError(error.message)
      })

      window.hivebeats.startUdpListen(broadcastPort, deviceId)
    } else {
      setUdpDiscovered([])
      setUdpError(null)
      window.hivebeats.stopUdpListen()
    }

    return () => {
      cleanupUp()
      cleanupDown()
      cleanupUdpAnnouncement()
      cleanupUdpError()
      window.hivebeats.stopDiscovery()
      window.hivebeats.stopUdpListen()
    }
  }, [addLog, broadcastPort, deviceId, mdnsEnabled, udpEnabled])

  useEffect(() => {
    const audio = hostAudioRef.current
    if (!audio) return

    const handleTimeUpdate = () => setHostPositionMs(audio.currentTime * 1000)
    const handleLoadedMetadata = () => setHostDurationMs(audio.duration * 1000)
    const handleEnded = () => {
      setHostPlaying(false)
      setHostPositionMs(0)
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [selectedTrack])

  useEffect(() => {
    if (guestConnected) {
      const sendPing = () => {
        const ping: SyncPingMessage = { type: 'SYNC_PING', t0: Date.now() }
        window.hivebeats.sendToHost(ping)
      }

      sendPing()
      syncTimerRef.current = setInterval(sendPing, SYNC_INTERVAL_MS)
    }

    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current)
        syncTimerRef.current = null
      }
    }
  }, [guestConnected])

  useEffect(() => {
    const audio = guestAudioRef.current
    if (!audio) return
    audio.volume = guestMuted ? 0 : guestVolume
  }, [guestMuted, guestVolume])

  useEffect(() => {
    const audio = guestAudioRef.current
    if (!audio) return

    const handleGuestCanPlay = () => {
      checkGuestReady()
      void trySendReadyAck()
    }

    audio.addEventListener('canplay', handleGuestCanPlay)
    audio.addEventListener('seeked', handleGuestCanPlay)
    audio.addEventListener('loadedmetadata', handleGuestCanPlay)
    audio.addEventListener('progress', handleGuestCanPlay)

    return () => {
      audio.removeEventListener('canplay', handleGuestCanPlay)
      audio.removeEventListener('seeked', handleGuestCanPlay)
      audio.removeEventListener('loadedmetadata', handleGuestCanPlay)
      audio.removeEventListener('progress', handleGuestCanPlay)
    }
  }, [checkGuestReady, trySendReadyAck])

  useEffect(() => {
    if (!hostRunning) return

    if (mdnsEnabled) {
      window.hivebeats.advertiseSession(sessionCode, hostPort)
    } else {
      window.hivebeats.stopAdvertise()
    }

    if (udpEnabled) {
      window.hivebeats.startUdpBroadcast(sessionCode, hostPort, broadcastPort, broadcastIntervalMs, deviceId)
    } else {
      window.hivebeats.stopUdpBroadcast()
    }
  }, [broadcastIntervalMs, broadcastPort, deviceId, hostPort, hostRunning, mdnsEnabled, sessionCode, udpEnabled])

  useEffect(() => {
    const cleanupStatus = window.hivebeats.onSocketStatus((status: SocketStatusPayload) => {
      if (status.role === 'host') {
        if (status.status === 'client-connected') {
          setGuestCount((count) => count + 1)
          setGuestList((current) => {
            if (!status.address || !status.clientId) return current
            if (current.some((guest) => guest.id === status.clientId)) return current
            return [...current, { id: status.clientId, alias: 'Guest', address: status.address, ready: false }]
          })
          if (status.clientId) {
            guestReadyIdsRef.current.delete(status.clientId)
          }
          addLog(`Guest connected (${status.address})`)
        }
        if (status.status === 'client-disconnected') {
          setGuestCount((count) => Math.max(0, count - 1))
          setGuestList((current) => current.filter((guest) => guest.id !== status.clientId))
          if (status.clientId) {
            guestReadyIdsRef.current.delete(status.clientId)
          }
          addLog('Guest disconnected')
          maybeStartPendingPlayback()
        }
        if (status.status === 'error') {
          setHostError(status.message)
          addLog(`Host error: ${status.message}`)
        }
      }

      if (status.role === 'guest') {
        if (status.status === 'connected') {
          setGuestConnected(true)
          setGuestSyncReady(false)
          guestSyncReadyRef.current = false
          guestReadyRequestedRef.current = false
          guestReadyAcknowledgedRef.current = false
          setGuestError(null)
          sendHello()
          addLog('Guest connected to host')
          if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current)
            retryTimerRef.current = null
          }
          setRetryCount(0)
        }
        if (status.status === 'disconnected') {
          setGuestConnected(false)
          setGuestHostId('')
          setGuestSyncReady(false)
          guestSyncReadyRef.current = false
          guestReadyRequestedRef.current = false
          guestReadyAcknowledgedRef.current = false
          setGuestReadyRequested(false)
          setGuestReadyAcknowledged(false)
          addLog('Guest disconnected from host')
          scheduleRetry()
        }
        if (status.status === 'error') {
          setGuestError(status.message)
          addLog(`Guest error: ${status.message}`)
          scheduleRetry()
        }
      }
    })

    const cleanupMessage = window.hivebeats.onSocketMessage((payload: SocketMessagePayload) => {
      if (payload.role === 'host' && typeof payload.message === 'object' && payload.message) {
        const message = payload.message as HostHelloMessage
        if (message.type === 'HELLO' && payload.clientId) {
          const clientId = payload.clientId
          const reply: HostWelcomeMessage = {
            type: 'WELCOME',
            sessionCode,
            hostId: deviceId,
          }
          setGuestList((current) =>
            current.map((guest) =>
              guest.id === clientId
                ? { ...guest, alias: message.alias }
                : guest,
            ),
          )
          window.hivebeats.sendToGuest(clientId, reply)

          if (selectedTrack) {
            void window.hivebeats
              .startStreamForGuest(
                clientId,
                selectedTrack.filePath,
                selectedTrack.fileName,
                selectedTrack.mimeType,
                selectedTrack.id,
              )
              .then(() => {
                const audio = hostAudioRef.current
                const positionMs = audio ? audio.currentTime * 1000 : 0
                void requestGuestReadyAt(clientId, positionMs)
              })
          }
        }

        const streamMessage = payload.message as StreamMessage | ReadyAckMessage
        if (streamMessage.type === 'SYNC_PING' && payload.clientId) {
          const t1 = Date.now()
          const pong: SyncPongMessage = {
            type: 'SYNC_PONG',
            t0: streamMessage.t0,
            t1,
            t2: Date.now(),
          }
          window.hivebeats.sendToGuest(payload.clientId, pong)
        }

        if (streamMessage.type === 'READY_ACK' && payload.clientId) {
          guestReadyIdsRef.current.add(payload.clientId)
          setGuestList((current) =>
            current.map((guest) =>
              guest.id === payload.clientId ? { ...guest, ready: true } : guest,
            ),
          )
          addLog(`Guest ready: ${payload.clientId.slice(0, 6)}`)
          if (pendingPlayRef.current) {
            maybeStartPendingPlayback()
          } else if (hostPlaying) {
            const audio = hostAudioRef.current
            const positionMs = audio ? audio.currentTime * 1000 + HOST_PLAY_DELAY_MS : 0
            void sendPlayToGuest(payload.clientId, positionMs)
          }
        }
      }

      if (payload.role === 'guest' && typeof payload.message === 'object' && payload.message) {
        const message = payload.message as HostWelcomeMessage
        if (message.type === 'WELCOME') {
          setGuestHostId(message.hostId)
          addLog(`Joined session ${message.sessionCode}`)
        }

        const streamMessage = payload.message as StreamMessage | ReadyRequestMessage
        if (streamMessage.type === 'SYNC_PONG') {
          const t3 = Date.now()
          const offset = ((streamMessage.t1 - streamMessage.t0) + (streamMessage.t2 - t3)) / 2
          setClockOffsetMs(offset)
          clockOffsetRef.current = offset
          setGuestSyncReady(true)
          guestSyncReadyRef.current = true
          addLog('Guest sync ready')
          void trySendReadyAck()
          return
        }

        if (streamMessage.type === 'READY_REQUEST') {
          guestReadyRequestedRef.current = true
          guestReadyAcknowledgedRef.current = false
          guestReadyPositionMsRef.current = streamMessage.positionMs
          setGuestReadyRequested(true)
          setGuestReadyAcknowledged(false)
          guestReadySentRef.current = false
          guestStreamReadyRef.current = false
          setGuestStreamReady(false)
          setGuestSyncReady(false)
          guestSyncReadyRef.current = false
          window.hivebeats.sendToHost({ type: 'SYNC_PING', t0: Date.now() })
          addLog('Host requested readiness')
          checkGuestReady()
          void trySendReadyAck()
          return
        }

        if (streamMessage.type === 'STREAM_INIT') {
          resetGuestStream(streamMessage.mimeType, streamMessage.fileName)
          guestTrackIdRef.current = streamMessage.trackId
          setGuestTrackId(streamMessage.trackId)
          setGuestError(null)
          if (guestReadyRequestedRef.current) {
            window.hivebeats.sendToHost({ type: 'SYNC_PING', t0: Date.now() })
          }
          return
        }

        if (streamMessage.type === 'STREAM_CHUNK') {
          const chunkMessage = streamMessage as StreamChunkMessage
          chunkQueueRef.current.push(decodeBase64(chunkMessage.data))
          guestBufferedBytesRef.current += chunkMessage.data.length
          appendNextChunk()
          checkGuestReady()
          void trySendReadyAck()
          return
        }

        if (streamMessage.type === 'STREAM_END') {
          const endMessage = streamMessage as StreamEndMessage
          if (endMessage.trackId === guestTrackId) {
            streamEndPendingRef.current = true
            appendNextChunk()
          }
          return
        }

        // Handle transport commands with epoch + sequence guards
        const playCommand = streamMessage as ExtendedPlayCommand
        const pauseCommand = streamMessage as ExtendedPauseCommand
        const seekCommand = streamMessage as ExtendedSeekCommand

        const incomingEpoch = playCommand.epoch ?? pauseCommand.epoch ?? seekCommand.epoch
        if (incomingEpoch !== undefined) {
          if (incomingEpoch < transportEpochRef.current) {
            addLog(`Ignoring stale transport (epoch ${incomingEpoch} < ${transportEpochRef.current})`)
            return
          }
          if (incomingEpoch > transportEpochRef.current) {
            transportEpochRef.current = incomingEpoch
            clearGuestTransportTimers()
          }
        }

        // Sequence number handling: ignore duplicates/stale commands within the same epoch
        const seq = (playCommand.seq ?? pauseCommand.seq ?? seekCommand.seq) as number | undefined
        if (seq !== undefined) {
          if (seq <= guestLastCommandIdRef.current) {
            addLog(`Ignoring duplicate/stale command (seq ${seq} <= ${guestLastCommandIdRef.current})`)
            return
          }
          guestLastCommandIdRef.current = seq
        }

        const audio = guestAudioRef.current
        if (!audio) return

        if (playCommand.type === 'CMD_PLAY') {
          clearGuestTransportTimers()
          const localPlayTime = playCommand.playAt - clockOffsetRef.current
          const delay = Math.max(0, localPlayTime - Date.now())
          audio.currentTime = playCommand.positionMs / 1000
          const epoch = incomingEpoch ?? transportEpochRef.current
          guestPlayTimerRef.current = setTimeout(() => {
            if (transportEpochRef.current !== epoch) return
            audio.play().catch(() => {
              setGuestError('Unable to start playback on guest.')
            })
          }, delay)
          return
        }

        if (pauseCommand.type === 'CMD_PAUSE') {
          clearGuestTransportTimers()
          const localPauseTime = pauseCommand.pauseAt - clockOffsetRef.current
          const delay = Math.max(0, localPauseTime - Date.now())
          audio.currentTime = pauseCommand.positionMs / 1000
          const epoch = incomingEpoch ?? transportEpochRef.current
          guestPauseTimerRef.current = setTimeout(() => {
            if (transportEpochRef.current !== epoch) return
            audio.pause()
          }, delay)
          guestReadyRequestedRef.current = false
          guestReadyAcknowledgedRef.current = false
          setGuestReadyRequested(false)
          setGuestReadyAcknowledged(false)
          return
        }

        if (seekCommand.type === 'CMD_SEEK') {
          clearGuestTransportTimers()
          const localPlayTime = seekCommand.playAt - clockOffsetRef.current
          const delay = Math.max(0, localPlayTime - Date.now())
          audio.currentTime = seekCommand.positionMs / 1000
          const epoch = incomingEpoch ?? transportEpochRef.current
          guestSeekTimerRef.current = setTimeout(() => {
            if (transportEpochRef.current !== epoch) return
            audio.play().catch(() => {
              setGuestError('Unable to resume after seek.')
            })
          }, delay)
        }
      }
    })

    return () => {
      cleanupStatus()
      cleanupMessage()
    }
  }, [
    addLog,
    appendNextChunk,
    checkGuestReady,
    clearGuestTransportTimers,
    deviceAlias,
    deviceId,
    guestList,
    guestTrackId,
    hostPlaying,
    maybeStartPendingPlayback,
    requestGuestReadyAt,
    resetGuestStream,
    scheduleRetry,
    sendHello,
    selectedTrack,
    sendPlayToGuest,
    sessionCode,
    trySendReadyAck,
  ])

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      if (hostPlayTimerRef.current) clearTimeout(hostPlayTimerRef.current)
      if (hostPauseTimerRef.current) clearTimeout(hostPauseTimerRef.current)
      if (guestPlayTimerRef.current) clearTimeout(guestPlayTimerRef.current)
      if (guestPauseTimerRef.current) clearTimeout(guestPauseTimerRef.current)
      if (guestSeekTimerRef.current) clearTimeout(guestSeekTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!retryEnabled && retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
    if (!connectionTarget) setRetryCount(0)
  }, [connectionTarget, retryEnabled])

  return (
    <div className="app">
      <header className="app__header">
        <div className="brand">HiveBeats</div>
        <p className="subtitle">Local audio sessions over Wi-Fi</p>
      </header>

      <section className="card card--muted">
        <h2>Network settings</h2>
        <div className="settings-grid">
          <label className="field">
            <span className="field-label">Host port</span>
            <input
              className="input input--compact"
              value={hostPortInput}
              onChange={(event) => setHostPortInput(event.target.value)}
              inputMode="numeric"
            />
          </label>
          <label className="field">
            <span className="field-label">Join port</span>
            <input
              className="input input--compact"
              value={joinPortInput}
              onChange={(event) => setJoinPortInput(event.target.value)}
              inputMode="numeric"
            />
          </label>
          <label className="field">
            <span className="field-label">UDP broadcast port</span>
            <input
              className="input input--compact"
              value={broadcastPortInput}
              onChange={(event) => setBroadcastPortInput(event.target.value)}
              inputMode="numeric"
            />
          </label>
        </div>
        <div className="toggle-row">
          <label className="toggle">
            <input
              type="checkbox"
              checked={mdnsEnabled}
              onChange={(event) => setMdnsEnabled(event.target.checked)}
            />
            <span className="switch" aria-hidden="true" />
            <span className="toggle-label">mDNS discovery</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={udpEnabled}
              onChange={(event) => setUdpEnabled(event.target.checked)}
            />
            <span className="switch" aria-hidden="true" />
            <span className="toggle-label">UDP fallback</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={retryEnabled}
              onChange={(event) => setRetryEnabled(event.target.checked)}
            />
            <span className="switch" aria-hidden="true" />
            <span className="toggle-label">Auto-retry</span>
          </label>
        </div>
        <p className="hint">Tip: keep mDNS + UDP enabled for best LAN discovery reliability.</p>
      </section>

      <section className="card">
        <h1>Start a session</h1>
        <p className="hint">Device alias: {deviceAlias}</p>
        <div className="code" aria-live="polite">
          {sessionCode}
        </div>
        <div className="button-row">
          <button type="button" className="btn" onClick={handleNewCode}>
            Generate new code
          </button>
          {hostRunning ? (
            <button type="button" className="btn btn--ghost" onClick={handleStopHost}>
              Stop host
            </button>
          ) : (
            <button type="button" className="btn" onClick={handleStartHost}>
              Start host on {hostPort}
            </button>
          )}
        </div>
        <div className="meta-row">
          <span>Guests connected: {guestCount}</span>
          <span>Host status: {hostRunning ? 'Live' : 'Stopped'}</span>
        </div>
        {hostError ? <div className="alert alert--error">Host error: {hostError}</div> : null}
        {guestList.length > 0 ? (
          <div className="guest-list">
            {guestList.map((guest) => (
              <div key={guest.id} className="guest-item">
                <span>{guest.alias}</span>
                <span className="guest-meta">{guest.address}</span>
                <span className={`badge ${guest.ready ? 'badge--udp' : 'badge--mdns'}`}>
                  {guest.ready ? 'READY' : 'WAITING'}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {showHostControls ? (
        <section className="card">
          <h2>Host audio</h2>
          <div className="audio-row">
            <button type="button" className="btn" onClick={handlePickAudio}>
              Choose audio file
            </button>
            {selectedTrack ? (
              <div className="track-meta">
                <div className="track-name">{selectedTrack.fileName}</div>
                <div className="track-sub">
                  {formatTime(hostPositionMs)} / {formatTime(hostDurationMs)}
                </div>
              </div>
            ) : (
              <p className="hint">No track selected yet.</p>
            )}
          </div>
          <div className="transport transport--primary">
            <button type="button" className="btn" onClick={handlePlay} disabled={!selectedTrack}>
              Play
            </button>
            <button type="button" className="btn btn--ghost" onClick={requestGuestReady} disabled={!selectedTrack || guestCount === 0}>
              Request guest ready
            </button>
            <button type="button" className="btn btn--ghost" onClick={handlePause} disabled={!selectedTrack}>
              Pause
            </button>
            <button type="button" className="btn btn--ghost" onClick={handleStop} disabled={!selectedTrack}>
              Stop
            </button>
          </div>
          <input
            type="range"
            className="timeline"
            min={0}
            max={Math.max(1, hostDurationMs)}
            value={Math.min(hostPositionMs, hostDurationMs)}
            onChange={(event) => {
              const value = Number(event.target.value)
              setHostPositionMs(value)
              const audio = hostAudioRef.current
              if (audio) {
                audio.currentTime = value / 1000
              }
            }}
            onMouseUp={(event) => handleSeek(Number(event.currentTarget.value))}
            onTouchEnd={(event) => handleSeek(Number(event.currentTarget.value))}
            disabled={!selectedTrack}
          />
          <div className="meta-row">
            <span>Stream: {streamingTrackId ? 'Active' : 'Idle'}</span>
            <span>Guest track: {guestTrackName || 'Waiting for stream'}</span>
            <span>Clock offset: {clockOffsetMs.toFixed(0)}ms</span>
            <span>Guest ready: {guestStreamReady ? 'Yes' : 'No'}</span>
            <span>Sync ready: {guestSyncReady ? 'Yes' : 'No'}</span>
            <span>Pending play: {pendingPlay ? 'Yes' : 'No'}</span>
          </div>
        </section>
      ) : null}

      {showGuestControls ? (
        <section className="card">
          <h2>Guest volume</h2>
          <div className="guest-controls">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setGuestMuted((current) => !current)}
            >
              {guestMuted ? 'Unmute' : 'Mute'}
            </button>
            <div className="volume-row">
              <span className="volume-label">Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={guestMuted ? 0 : guestVolume}
                onChange={(event) => setGuestVolume(Number(event.target.value))}
              />
            </div>
          </div>
          <div className="meta-row" style={{ marginTop: '1rem' }}>
            <span>Stream ready: {guestStreamReady ? 'Yes' : 'No'}</span>
            <span>Sync ready: {guestSyncReady ? 'Yes' : 'No'}</span>
            <span>Host asked: {guestReadyRequested ? 'Yes' : 'No'}</span>
            <span>Sent: {guestReadyAcknowledged ? 'Yes' : 'No'}</span>
          </div>
          <div className="button-row" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="btn"
              onClick={handleGuestReady}
              disabled={!guestReadyRequested || guestReadyAcknowledged}
            >
              I'm Ready
            </button>
          </div>
        </section>
      ) : null}

      <section className="card card--muted">
        <h2>Join a session</h2>
        <div className="join-row">
          <input
            className="input"
            placeholder="Manual host IP (192.168.x.x)"
            aria-label="Manual host IP"
            value={manualHost}
            onChange={(event) => setManualHost(event.target.value)}
          />
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => connectToHost(manualHost, joinPort)}
            disabled={!manualHost}
          >
            {guestConnected ? 'Reconnect' : 'Join'}
          </button>
        </div>
        <div className="join-row">
          <div className="pill">Join port: {joinPort}</div>
          {guestConnected ? (
            <button type="button" className="btn btn--ghost" onClick={handleDisconnect}>
              Disconnect
            </button>
          ) : null}
        </div>
        <p className="hint">
          Guest status: {guestConnected ? 'Connected' : 'Disconnected'}
          {guestHostId ? ` | Host: ${guestHostId.slice(0, 6)}` : ''}
          {connectionTarget && !guestConnected && retryEnabled && retryCount > 0
            ? ` | Retry ${retryCount}/${maxRetries}`
            : ''}
        </p>
        {guestError ? <div className="alert alert--error">Guest error: {guestError}</div> : null}
        {udpError ? <div className="alert alert--warn">UDP notice: {udpError}</div> : null}
      </section>

      <section className="card">
        <h2>Discovered sessions</h2>
        {discovered.length === 0 ? (
          <p className="hint">No sessions found yet. Start one on another device.</p>
        ) : (
          <div className="session-list">
            {discovered.map((service) => {
              const hostAddress = pickHostAddress(service)
              return (
                <div key={`${service.name}-${service.port}`} className="session-item">
                  <div>
                    <div className="session-title">{service.sessionCode ?? service.name}</div>
                    <div className="session-meta">
                      {hostAddress || 'Unknown host'}:{service.port}
                    </div>
                    <span className={`badge badge--${service.source}`}>
                      {service.source.toUpperCase()}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => connectToHost(hostAddress, service.port)}
                    disabled={!hostAddress}
                  >
                    Join
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="card card--muted">
        <h2>Connection log</h2>
        {logs.length === 0 ? (
          <p className="hint">No activity yet.</p>
        ) : (
          <div className="log-list">
            {logs.map((entry) => (
              <div key={entry.id} className="log-item">
                {entry.message}
              </div>
            ))}
          </div>
        )}
      </section>

      <audio ref={hostAudioRef} className="hidden-audio" preload="auto" />
      <audio ref={guestAudioRef} className="hidden-audio" preload="auto" />
    </div>
  )
}

export default App
