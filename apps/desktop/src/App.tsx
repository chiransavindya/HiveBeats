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
  const [pendingPlay, setPendingPlay] = useState(false)
  const [hostPortInput, setHostPortInput] = useState('7400')
  const [joinPortInput, setJoinPortInput] = useState('7400')
  const [broadcastPortInput, setBroadcastPortInput] = useState('7401')
  const [mdnsEnabled, setMdnsEnabled] = useState(true)
  const [udpEnabled, setUdpEnabled] = useState(true)
  const [retryEnabled, setRetryEnabled] = useState(true)
  const [connectionTarget, setConnectionTarget] = useState<{
    host: string
    port: number
  } | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hostPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hostPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hostAudioRef = useRef<HTMLAudioElement | null>(null)
  const guestAudioRef = useRef<HTMLAudioElement | null>(null)
  const mediaSourceRef = useRef<MediaSource | null>(null)
  const sourceBufferRef = useRef<SourceBuffer | null>(null)
  const chunkQueueRef = useRef<Uint8Array[]>([])
  const streamEndPendingRef = useRef(false)
  const guestBufferedBytesRef = useRef(0)
  const guestReadySentRef = useRef(false)
  const pendingPlayRef = useRef(false)
  const guestStreamReadyRef = useRef(false)
  const guestSyncReadyRef = useRef(false)
  const clockOffsetRef = useRef(0)
  const pendingPlaybackPositionRef = useRef(0)

  const hostPort = Number(hostPortInput) || 7400
  const joinPort = Number(joinPortInput) || hostPort
  const broadcastPort = Number(broadcastPortInput) || 7401
  const broadcastIntervalMs = 3000
  const maxRetries = 3
  const showHostControls = hostRunning
  const showGuestControls = guestConnected && !hostRunning
  const deviceId = useMemo(() => crypto.randomUUID(), [])
  const deviceAlias = useMemo(() => `Desktop-${deviceId.slice(0, 4)}`, [deviceId])

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
    if (hostRunning) {
      return all.filter((session) => session.sessionCode !== sessionCode)
    }
    return all
  }, [hostRunning, mdnsDiscovered, sessionCode, udpDiscovered])

  const addLog = useCallback((message: string) => {
    setLogs((current) => {
      const entry = { id: crypto.randomUUID(), message }
      return [entry, ...current].slice(0, 6)
    })
  }, [])

  const attemptConnect = useCallback(
    async (host: string, port: number, label: string) => {
      await window.hivebeats.connectToHost(host, port)
      addLog(`${label} ${host}:${port}`)
    },
    [addLog],
  )

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
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }

  const appendNextChunk = useCallback(() => {
    const sourceBuffer = sourceBufferRef.current
    if (!sourceBuffer || sourceBuffer.updating) return
    const chunk = chunkQueueRef.current.shift()
    if (chunk) {
      const buffer = Uint8Array.from(chunk).buffer
      sourceBuffer.appendBuffer(buffer)
      return
    }
    if (streamEndPendingRef.current && mediaSourceRef.current?.readyState === 'open') {
      streamEndPendingRef.current = false
      mediaSourceRef.current.endOfStream()
    }
  }, [])

  const checkGuestReady = useCallback(() => {
    if (guestReadySentRef.current) return
    const audio = guestAudioRef.current
    if (!audio || audio.buffered.length === 0) return
    const bufferedEnd = audio.buffered.end(audio.buffered.length - 1)
    const bufferedAhead = bufferedEnd - audio.currentTime
    if (bufferedAhead >= 2.5) {
      guestReadySentRef.current = true
      guestStreamReadyRef.current = true
      setGuestStreamReady(true)
      window.hivebeats.sendToHost({
        type: 'STREAM_READY',
        trackId: guestTrackId ?? 'unknown',
      })
    }
  }, [guestTrackId])

  const scheduleHostPlay = (playAt: number) => {
    const audio = hostAudioRef.current
    if (!audio) return
    if (hostPlayTimerRef.current) {
      clearTimeout(hostPlayTimerRef.current)
    }
    const delay = Math.max(0, playAt - Date.now())
    hostPlayTimerRef.current = setTimeout(() => {
      audio.play().catch(() => {
        setHostError('Unable to start playback. Try again.')
      })
    }, delay)
  }

  const scheduleHostPause = (pauseAt: number) => {
    const audio = hostAudioRef.current
    if (!audio) return
    if (hostPauseTimerRef.current) {
      clearTimeout(hostPauseTimerRef.current)
    }
    const delay = Math.max(0, pauseAt - Date.now())
    hostPauseTimerRef.current = setTimeout(() => {
      audio.pause()
      setHostPlaying(false)
    }, delay)
  }

  const resetGuestStream = useCallback(
    (mimeType: string, fileName: string) => {
      const audio = guestAudioRef.current
      if (!audio) return

      if (mediaSourceRef.current) {
        mediaSourceRef.current = null
      }

      chunkQueueRef.current = []
      streamEndPendingRef.current = false
      guestBufferedBytesRef.current = 0
      guestReadySentRef.current = false
      guestStreamReadyRef.current = false
      setGuestStreamReady(false)
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
          })
          appendNextChunk()
        } catch {
          setGuestError('Stream mime type not supported on this device.')
        }
      })
    },
    [appendNextChunk, checkGuestReady],
  )

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

    const audio = hostAudioRef.current
    if (audio) {
      audio.src = filePathToUrl(result.filePath)
      audio.muted = false
      audio.volume = 1
      audio.load()
    }

    addLog(`Loaded ${result.fileName}`)
  }

  const startPlayback = useCallback(
    async (positionMs: number) => {
      if (!selectedTrack) return
      const playAt = Date.now() + 800
      const command: PlayCommandMessage = {
        type: 'CMD_PLAY',
        trackId: selectedTrack.id,
        playAt,
        positionMs,
      }

      await window.hivebeats.broadcastToGuests(command)
      const audio = hostAudioRef.current
      if (!audio) return
      audio.muted = false
      audio.volume = 1
      scheduleHostPlay(playAt)
      setHostPlaying(true)
      setPendingPlay(false)
      pendingPlayRef.current = false
    },
    [selectedTrack],
  )

  const maybeStartPendingPlayback = useCallback(() => {
    if (!pendingPlayRef.current) return
    if (!guestStreamReadyRef.current) return
    if (!guestSyncReadyRef.current) return

    pendingPlayRef.current = false
    setPendingPlay(false)
    startPlayback(pendingPlaybackPositionRef.current)
  }, [startPlayback])

  const handlePlay = async () => {
    if (!selectedTrack) {
      setHostError('Pick an audio file first.')
      return
    }

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

    if (guestCount > 0 && (!guestStreamReadyRef.current || !guestSyncReadyRef.current)) {
      setPendingPlay(true)
      pendingPlayRef.current = true
      pendingPlaybackPositionRef.current = positionMs
      addLog('Buffering guest before play...')
      setTimeout(() => {
        if (pendingPlayRef.current) {
          startPlayback(positionMs)
        }
      }, 1500)
      return
    }

    await startPlayback(positionMs)
  }

  const handlePause = async () => {
    const audio = hostAudioRef.current
    if (!audio) return

    const pauseAt = Date.now() + 200
    const positionMs = audio.currentTime * 1000

    const command: PauseCommandMessage = {
      type: 'CMD_PAUSE',
      pauseAt,
      positionMs,
    }

    await window.hivebeats.broadcastToGuests(command)
    scheduleHostPause(pauseAt)
  }

  const handleStop = async () => {
    const audio = hostAudioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    setHostPlaying(false)
    setHostPositionMs(0)
    setStreamingTrackId(null)
    await window.hivebeats.stopStream()
    setPendingPlay(false)
    pendingPlayRef.current = false

    const command: PauseCommandMessage = {
      type: 'CMD_PAUSE',
      pauseAt: Date.now(),
      positionMs: 0,
    }

    await window.hivebeats.broadcastToGuests(command)
  }

  const handleSeek = async (positionMs: number) => {
    if (!selectedTrack) return
    const audio = hostAudioRef.current
    if (!audio) return

    const playAt = Date.now() + 800
    audio.currentTime = positionMs / 1000

    const command: SeekCommandMessage = {
      type: 'CMD_SEEK',
      trackId: selectedTrack.id,
      playAt,
      positionMs,
    }

    await window.hivebeats.broadcastToGuests(command)
    if (hostPlaying) {
      scheduleHostPlay(playAt)
    }
  }

  const handleStartHost = async () => {
    await window.hivebeats.startHost(hostPort)
    if (mdnsEnabled) {
      await window.hivebeats.advertiseSession(sessionCode, hostPort)
    }
    if (udpEnabled) {
      await window.hivebeats.startUdpBroadcast(
        sessionCode,
        hostPort,
        broadcastPort,
        broadcastIntervalMs,
        deviceId,
      )
    }
    setHostRunning(true)
    setHostError(null)
    addLog(`Host started on ${hostPort}`)
  }

  const handleStopHost = async () => {
    await window.hivebeats.stopHost()
    await window.hivebeats.stopAdvertise()
    await window.hivebeats.stopUdpBroadcast()
    await window.hivebeats.stopStream()
    setHostRunning(false)
    setGuestCount(0)
    setGuestList([])
    setStreamingTrackId(null)
    addLog('Host stopped')
  }

  const sendHello = useCallback(async () => {
    const message: HostHelloMessage = {
      type: 'HELLO',
      deviceId,
      alias: deviceAlias,
    }
    await window.hivebeats.sendToHost(message)
  }, [deviceAlias, deviceId])

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

  const handleDisconnect = async () => {
    await window.hivebeats.disconnectFromHost()
    setConnectionTarget(null)
    setRetryCount(0)
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
    addLog('Guest disconnected manually')
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

  const pickHostAddress = (session: DiscoveredSession) => {
    const ipv4 = session.addresses.find((address) => /^\d{1,3}(\.\d{1,3}){3}$/.test(address))
    return ipv4 ?? session.host ?? ''
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
          if (!exists) {
            addLog(`mDNS: ${service.sessionCode ?? service.name} found`)
          }
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
          if (!exists) {
            addLog(`UDP: ${announcement.code} at ${announcement.host}`)
          }
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

    const handleTimeUpdate = () => {
      setHostPositionMs(audio.currentTime * 1000)
    }

    const handleLoadedMetadata = () => {
      setHostDurationMs(audio.duration * 1000)
    }

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
      syncTimerRef.current = setInterval(sendPing, 30000)
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
    if (!hostRunning) return

    if (mdnsEnabled) {
      window.hivebeats.advertiseSession(sessionCode, hostPort)
    } else {
      window.hivebeats.stopAdvertise()
    }

    if (udpEnabled) {
      window.hivebeats.startUdpBroadcast(
        sessionCode,
        hostPort,
        broadcastPort,
        broadcastIntervalMs,
        deviceId,
      )
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
            return [...current, { id: status.clientId, alias: 'Guest', address: status.address }]
          })
          addLog(`Guest connected (${status.address})`)
        }
        if (status.status === 'client-disconnected') {
          setGuestCount((count) => Math.max(0, count - 1))
          setGuestList((current) => current.filter((guest) => guest.id !== status.clientId))
          addLog('Guest disconnected')
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
          const reply: HostWelcomeMessage = {
            type: 'WELCOME',
            sessionCode,
            hostId: deviceId,
          }
          setGuestList((current) =>
            current.map((guest) =>
              guest.id === payload.clientId
                ? { ...guest, alias: message.alias }
                : guest,
            ),
          )
          window.hivebeats.sendToGuest(payload.clientId, reply)
        }

        const streamMessage = payload.message as StreamMessage
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

        if (streamMessage.type === 'STREAM_READY') {
          setGuestStreamReady(true)
          guestStreamReadyRef.current = true
          if (pendingPlayRef.current) {
            const audio = hostAudioRef.current
            const positionMs = audio ? audio.currentTime * 1000 : 0
            setTimeout(() => {
              startPlayback(positionMs)
            }, 50)
          }
        }
      }

      if (payload.role === 'guest' && typeof payload.message === 'object' && payload.message) {
        const message = payload.message as HostWelcomeMessage
        if (message.type === 'WELCOME') {
          setGuestHostId(message.hostId)
          addLog(`Joined session ${message.sessionCode}`)
        }

        const streamMessage = payload.message as StreamMessage
        if (streamMessage.type === 'SYNC_PONG') {
          const t3 = Date.now()
          const offset = ((streamMessage.t1 - streamMessage.t0) + (streamMessage.t2 - t3)) / 2
          setClockOffsetMs(offset)
          clockOffsetRef.current = offset
          setGuestSyncReady(true)
          guestSyncReadyRef.current = true
          maybeStartPendingPlayback()
        }

        if (streamMessage.type === 'STREAM_INIT') {
          resetGuestStream(streamMessage.mimeType, streamMessage.fileName)
          setGuestTrackId(streamMessage.trackId)
          setGuestError(null)
          return
        }

        if (streamMessage.type === 'STREAM_CHUNK') {
          const chunkMessage = streamMessage as StreamChunkMessage
          chunkQueueRef.current.push(decodeBase64(chunkMessage.data))
          guestBufferedBytesRef.current += chunkMessage.data.length
          appendNextChunk()
          checkGuestReady()
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

        const audio = guestAudioRef.current
        if (!audio) return

        if (streamMessage.type === 'CMD_PLAY') {
          const playCommand = streamMessage as PlayCommandMessage
          const localPlayTime = playCommand.playAt - clockOffsetRef.current
          const delay = Math.max(0, localPlayTime - Date.now())
          audio.currentTime = playCommand.positionMs / 1000
          setTimeout(() => {
            audio.play().catch(() => {
              setGuestError('Unable to start playback on guest.')
            })
          }, delay)
          return
        }

        if (streamMessage.type === 'CMD_PAUSE') {
          const pauseCommand = streamMessage as PauseCommandMessage
          const localPauseTime = pauseCommand.pauseAt - clockOffsetRef.current
          const delay = Math.max(0, localPauseTime - Date.now())
          audio.currentTime = pauseCommand.positionMs / 1000
          setTimeout(() => {
            audio.pause()
          }, delay)
          return
        }

        if (streamMessage.type === 'CMD_SEEK') {
          const seekCommand = streamMessage as SeekCommandMessage
          const localPlayTime = seekCommand.playAt - clockOffsetRef.current
          const delay = Math.max(0, localPlayTime - Date.now())
          audio.currentTime = seekCommand.positionMs / 1000
          setTimeout(() => {
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
    deviceAlias,
    deviceId,
    guestTrackId,
    maybeStartPendingPlayback,
    resetGuestStream,
    scheduleRetry,
    sessionCode,
    sendHello,
    startPlayback,
  ])

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      if (hostPlayTimerRef.current) {
        clearTimeout(hostPlayTimerRef.current)
        hostPlayTimerRef.current = null
      }
      if (hostPauseTimerRef.current) {
        clearTimeout(hostPauseTimerRef.current)
        hostPauseTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!retryEnabled && retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
    if (!connectionTarget) {
      setRetryCount(0)
    }
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

      <audio ref={hostAudioRef} className="hidden-audio" />
      <audio ref={guestAudioRef} className="hidden-audio" />
    </div>
  )
}

export default App
