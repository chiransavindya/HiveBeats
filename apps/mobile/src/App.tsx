import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Appearance,
  StyleSheet,
  View,
  Platform,
  StatusBar,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import NetInfo from '@react-native-community/netinfo'
import { StatusBar as ExpoStatusBar } from 'expo-status-bar'
import { useKeepAwake } from 'expo-keep-awake'

import { useSessionStore } from './store/sessionStore'
import { clockSync } from './services/clockSync'
import type { TabId } from './types/session'

import BottomTabBar from './components/BottomTabBar'
import PlayerMiniBar from './components/PlayerMiniBar'

import HomeScreen from './screens/HomeScreen'
import HostSessionScreen from './screens/HostSessionScreen'
import GuestSessionScreen from './screens/GuestSessionScreen'
import QueueScreen from './screens/QueueScreen'
import PlaylistsScreen from './screens/PlaylistsScreen'
import NetworkScreen from './screens/NetworkScreen'
import SettingsScreen from './screens/SettingsScreen'
import { audioService } from './services/audioService'
import { udpDiscovery } from './services/udpDiscovery'
import { socketClient } from './services/socketClient'
import { loadTheme, loadNetworkSettings } from './lib/asyncStorage'
import { useAppTheme } from './hooks/useAppTheme'
import type { AppThemeColors } from './theme/theme'

// Guest re-syncs to the host timeline when its DECODE position drifts more than
// this. Kept loose enough that we don't seek (and re-buffer) on every tick — the
// small steady-state gap is handled by GUEST_AUDIO_LEAD_MS, not by seeking.
const DRIFT_CORRECTION_MS = 400
// Minimum gap between corrective seeks, so we never glitch the audio repeatedly.
const DRIFT_COOLDOWN_MS = 2500
// The phone plays a buffered HTTP stream, so its audio comes out of the speaker
// LATER than the host's local file even when decode positions match. We start the
// guest this many ms ahead to cancel that output-latency difference. Tune per
// setup: raise it if the phone still lags the PC, lower it if the phone runs ahead.
const GUEST_AUDIO_LEAD_MS = 150
// If the guest was paused longer than this, treat the HTTP stream as stale on
// resume and reload it — a progressive stream connection usually dies after idle.
const STALE_STREAM_MS = 20000
// Safety clamp on scheduled play/seek delays. If a bad clock offset produced a
// nonsensical future time, never let it strand the guest: play/seek wait at most
// a little beyond the host's 2s lead. (Pause is applied immediately, never scheduled.)
const MAX_PLAY_SCHEDULE_MS = 5000

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  )
}

function MainApp() {
  const {
    hostRunning,
    guestConnected,
    isSessionLive,
    theme,
    setTheme,
    setNetworkState,
    addDiscoveredSession,
    loadPlaylistsFromStorage,
    _setHostPosition,
    _setHostDuration,
    _setHostPlaying,
    nextTrack,
    pushLog,
    setHostPortInput,
    setJoinPortInput,
    setBroadcastPortInput,
    setMdnsEnabled,
    setUdpEnabled,
    setRetryEnabled,
    leaveSession,
    // guest audio state setters (for incoming socket messages)
    guestConnected: isGuestConnected,
  } = useSessionStore()

  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])

  const [activeTab, setActiveTab] = useState<TabId>('player')
  const pendingPlayRef = useRef<Record<string, unknown> | null>(null)
  const pendingReadyRef = useRef<{ trackId: string; positionMs: number } | null>(null)
  const guestCommandTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const guestStreamLoadedRef = useRef(false)
  const guestLoadingTrackRef = useRef<string | null>(null)
  const readyAckInFlightRef = useRef(false)
  // Command ordering — mirror the desktop guest so stale/duplicate commands are dropped.
  const guestEpochRef = useRef(0)
  const guestLastSeqRef = useRef(-1)
  // Playback anchor for continuous drift correction. When the guest is playing,
  // the expected position at any moment is anchorPositionMs + (serverNow - anchorServerMs).
  // serverNow is derived from the synced host clock. null = not playing / no anchor.
  const playbackAnchorRef = useRef<{ positionMs: number; serverMs: number } | null>(null)
  const lastDriftSeekRef = useRef(0)
  // Last stream we were told to load, so we can transparently reload it if the
  // HTTP connection goes stale (e.g. after a long pause) or the first load failed.
  const lastStreamRef = useRef<{ streamUrl: string; trackId: string } | null>(null)
  // True while a stream load is in flight, so we never kick off a second concurrent
  // load (the host re-sends STREAM_INIT alongside CMD_PLAY on the first play, which
  // otherwise races two loads and the first play() lands on a torn-down player).
  const streamLoadingRef = useRef(false)
  // Wall-clock time the guest was last paused, used to detect a stale stream on resume.
  const pausedSinceRef = useRef(0)

  const clearGuestCommandTimers = () => {
    guestCommandTimersRef.current.forEach(clearTimeout)
    guestCommandTimersRef.current = []
  }

  const scheduleGuestCommand = (callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      guestCommandTimersRef.current = guestCommandTimersRef.current.filter((item) => item !== timer)
      callback()
    }, Math.max(0, delay))
    guestCommandTimersRef.current.push(timer)
  }

  // Decide whether an incoming transport command should be applied, based on the
  // host's epoch (a new transport "session" — play/pause/seek/stop) and seq
  // (monotonic command counter). Drops stale and duplicate commands so the guest
  // never ends up in a different play state than the host.
  const shouldApplyCommand = (msg: Record<string, unknown>): boolean => {
    const epoch = msg.epoch as number | undefined
    if (epoch !== undefined) {
      if (epoch < guestEpochRef.current) return false
      if (epoch > guestEpochRef.current) {
        guestEpochRef.current = epoch
        guestLastSeqRef.current = -1
        clearGuestCommandTimers()
      }
    }
    const seq = msg.seq as number | undefined
    if (seq !== undefined) {
      if (seq <= guestLastSeqRef.current) return false
      guestLastSeqRef.current = seq
    }
    return true
  }

  // Load (or reload) the guest's HTTP audio stream. Retries once on failure to
  // ride out transient host/network hiccups. Resolves true on success. Concurrent
  // calls are de-duped via streamLoadingRef so two loads never race each other.
  const loadGuestStream = async (streamUrl: string, trackId: string, attempt = 0): Promise<boolean> => {
    if (attempt === 0) {
      if (streamLoadingRef.current) return false // a load is already in flight
      streamLoadingRef.current = true
    }
    lastStreamRef.current = { streamUrl, trackId }
    guestLoadingTrackRef.current = trackId
    guestStreamLoadedRef.current = false
    const { guestMuted, guestVolume } = useSessionStore.getState()
    try {
      const { durationMs } = await audioService.load(streamUrl, false, guestMuted ? 0 : guestVolume)
      if (guestLoadingTrackRef.current !== trackId) { streamLoadingRef.current = false; return false }
      guestStreamLoadedRef.current = true
      streamLoadingRef.current = false
      useSessionStore.setState({ guestStreamReady: true, guestError: null })
      if (durationMs > 0) useSessionStore.setState({ guestDurationMs: durationMs })
      pushLog('Stream loaded')
      return true
    } catch (err) {
      if (guestLoadingTrackRef.current !== trackId) { streamLoadingRef.current = false; return false }
      if (attempt < 1) {
        pushLog('Stream load failed — retrying…')
        return loadGuestStream(streamUrl, trackId, attempt + 1)
      }
      streamLoadingRef.current = false
      const message = err instanceof Error ? err.message : String(err)
      pushLog(`Stream load failed: ${message}`)
      useSessionStore.setState({ guestError: `Stream load failed: ${message}`, guestStreamReady: false })
      return false
    }
  }

  // expo-audio sometimes swallows the first play() issued right after a seek/buffer
  // (the "first press is silent, second works" symptom). After starting playback we
  // verify it actually began and re-issue play() a few times if not. Bails out the
  // moment the host is no longer playing, so it never fights a pause.
  const ensureGuestPlaying = (attempt: number) => {
    if (attempt >= 4) return
    scheduleGuestCommand(() => {
      if (!useSessionStore.getState().hostPlaying) return
      if (!audioService.isPlaying()) {
        void audioService.play()
        ensureGuestPlaying(attempt + 1)
      }
    }, 350)
  }

  // Single path for starting guest playback in sync with the host. Seeks to the
  // host position plus the output-latency lead, waits until the shared `playAt`
  // instant (converted to local time, clamped), then plays and records the anchor
  // the drift corrector uses. Used by CMD_PLAY, resume-after-seek and queued plays.
  const scheduleGuestPlayback = (basePositionMs: number, playAt: number) => {
    const target = Math.max(0, basePositionMs + GUEST_AUDIO_LEAD_MS)
    const delay = Math.min(MAX_PLAY_SCHEDULE_MS, Math.max(0, clockSync.toLocalTime(playAt) - Date.now()))
    useSessionStore.setState({ guestPositionMs: basePositionMs })
    clearGuestCommandTimers()
    const seekStartedAt = Date.now()
    void audioService.seek(target)
      .catch((err) => pushLog(`Play seek failed: ${err.message}`))
      .finally(() => {
        const remainingDelay = Math.max(0, delay - (Date.now() - seekStartedAt))
        scheduleGuestCommand(() => {
          void audioService.play()
          // Anchor: at server time `playAt`, the decode position is `target`.
          playbackAnchorRef.current = { positionMs: target, serverMs: playAt }
          useSessionStore.setState({ hostPlaying: true })
          ensureGuestPlaying(0)
        }, remainingDelay)
      })
  }

  const maybeApplyPendingPlay = () => {
    const msg = pendingPlayRef.current
    if (!msg || !guestStreamLoadedRef.current || !clockSync.isSynced()) return

    pendingPlayRef.current = null
    scheduleGuestPlayback(Number(msg.positionMs ?? 0), Number(msg.playAt ?? Date.now()))
  }

  const maybeSendReadyAck = () => {
    const pending = pendingReadyRef.current
    if (!pending || !guestStreamLoadedRef.current || !clockSync.isSynced()) return
    if (readyAckInFlightRef.current) return

    readyAckInFlightRef.current = true
    void audioService.seek(pending.positionMs)
      .then(() => {
        if (pendingReadyRef.current !== pending) return
        pendingReadyRef.current = null
        socketClient.sendToHost({
          type: 'READY_ACK',
          trackId: pending.trackId,
          positionMs: pending.positionMs,
        })
        useSessionStore.setState({ guestPositionMs: pending.positionMs, guestStreamReady: true, guestSyncReady: true })
        pushLog('→ READY_ACK')
        maybeApplyPendingPlay()
      })
      .catch((err) => {
        pushLog(`Ready seek failed: ${err.message}`)
      })
      .finally(() => {
        readyAckInFlightRef.current = false
      })
  }

  // Keep screen awake during live sessions
  useKeepAwake(isSessionLive ? 'session-active' : undefined as unknown as string)

  // ── Load persisted state on startup ────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      await loadPlaylistsFromStorage()

      const savedTheme = await loadTheme()
      setTheme(savedTheme)
      const schemeToApply = savedTheme === 'system' ? Appearance.getColorScheme() ?? 'dark' : savedTheme
      Appearance.setColorScheme(schemeToApply)

      const ns = await loadNetworkSettings()
      setHostPortInput(ns.hostPort)
      setJoinPortInput(ns.joinPort)
      setBroadcastPortInput(ns.broadcastPort)
      setMdnsEnabled(ns.mdnsEnabled)
      setUdpEnabled(ns.udpEnabled)
      setRetryEnabled(ns.retryEnabled)

      await audioService.configure()
    })()
  }, [])

  // ── Network info listener ──────────────────────────────────────────────────
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const connected = state.isConnected ?? false
      const isWifi = state.type === 'wifi'
      const label = connected
        ? isWifi
          ? `Wi-Fi${state.details && 'ssid' in state.details && state.details.ssid ? ` · ${state.details.ssid}` : ''}`
          : state.type.toUpperCase()
        : 'No connection'

      let ip = '0.0.0.0'
      if (
        state.isConnected &&
        state.type === 'wifi' &&
        state.details &&
        'ipAddress' in state.details &&
        state.details.ipAddress
      ) {
        ip = state.details.ipAddress as string
      }

      setNetworkState(connected, label, ip)

      // Keep discovery subnet in sync whenever IP changes
      if (ip && ip !== '0.0.0.0') {
        udpDiscovery.updateDeviceIp(ip)
      }
    })
    return unsub
  }, [setNetworkState])

  // ── LAN discovery (subnet WebSocket scan) — guest side ────────────────────
  useEffect(() => {
    if (isGuestConnected) {
      // Already connected — stop scanning
      udpDiscovery.stopListening()
      return
    }

    const { udpEnabled, hostPortInput, hostAddress } = useSessionStore.getState()

    if (!udpEnabled) return

    const port = Number(hostPortInput) || 7400

    udpDiscovery.startListening(
      port,
      (session) => {
        const isNew = !useSessionStore.getState().discoveredSessions.some(
          (s) => s.sessionCode === session.sessionCode
        )
        addDiscoveredSession(session)
        if (isNew) {
          pushLog(`Found host: ${session.sessionCode} @ ${session.hostAddress}`)
        }
      },
      hostAddress,
    )

    // Ping host every 3s if we connect, but since we are handling connection below, 
    // we'll do the ping interval in a separate useEffect
    return () => udpDiscovery.stopListening()
  }, [isGuestConnected])

  useEffect(() => {
    if (isGuestConnected) {
      const sendPing = () => socketClient.sendToHost({ type: 'SYNC_PING', t0: Date.now() })
      sendPing()
      const interval = setInterval(sendPing, 3000)
      return () => clearInterval(interval)
    }
  }, [isGuestConnected, addDiscoveredSession, pushLog])

  // ── Socket client message handler (guest incoming messages) ───────────────
  useEffect(() => {
    if (!isGuestConnected) return

    const handleMessage = (msg: Record<string, unknown>) => {
      const type = msg.type as string
      if (type !== 'SYNC_PONG') {
        pushLog(`← ${type}`)
      }

      switch (type) {
        case 'WELCOME':
          // Host acknowledged our HELLO
          pushLog(`Host: ${String(msg.hostId ?? '')}`)
          break

        case 'CMD_PLAY': {
          if (!shouldApplyCommand(msg)) { pushLog('CMD_PLAY ignored (stale)'); break }
          const positionMs = Number(msg.positionMs ?? 0)
          const playAt = Number(msg.playAt ?? Date.now())

          // Detect a stale stream: the first load failed, or we are resuming after a
          // long pause where the progressive HTTP connection has likely dropped (the
          // "paused >40s and only the PC plays" symptom). Reload before resuming.
          const pausedMs = pausedSinceRef.current ? Date.now() - pausedSinceRef.current : 0
          const streamStale = !guestStreamLoadedRef.current || pausedMs > STALE_STREAM_MS
          pausedSinceRef.current = 0

          if (streamStale || !clockSync.isSynced()) {
            pendingPlayRef.current = msg
            // Only kick a reload if one isn't already in flight (e.g. from a
            // just-received STREAM_INIT). The in-flight load applies the pending play.
            if (streamStale && lastStreamRef.current && !streamLoadingRef.current) {
              pushLog('Reloading stream before resume')
              const { streamUrl, trackId } = lastStreamRef.current
              void loadGuestStream(streamUrl, trackId).then((ok) => { if (ok) maybeApplyPendingPlay() })
            } else {
              pushLog('CMD_PLAY queued until stream is ready')
            }
            break
          }

          scheduleGuestPlayback(positionMs, playAt)
          break
        }

        case 'CMD_PAUSE': {
          if (!shouldApplyCommand(msg)) { pushLog('CMD_PAUSE ignored (stale)'); break }
          const positionMs = Number(msg.positionMs ?? NaN)
          // A pause is a "stop now" — apply it immediately and unconditionally rather
          // than on a timer. Deferring it (or seeking right after) risks expo-audio
          // staying in the playing state, which is the "host paused but mobile keeps
          // playing" bug. Being a few hundred ms early on a pause is inaudible.
          clearGuestCommandTimers()
          // Cancel any queued play — otherwise it would resurrect playback on the
          // next SYNC_PONG / stream-load and leave the guest playing while the host is paused.
          pendingPlayRef.current = null
          playbackAnchorRef.current = null
          pausedSinceRef.current = Date.now()
          void audioService.pause()
          // Reflect the host's pause position in the UI; resume re-seeks anyway, so we
          // don't seek the player here (a seek can nudge expo-audio back into playing).
          if (Number.isFinite(positionMs)) useSessionStore.setState({ guestPositionMs: positionMs })
          useSessionStore.setState({ hostPlaying: false })
          break
        }

        case 'CMD_SEEK': {
          if (!shouldApplyCommand(msg)) { pushLog('CMD_SEEK ignored (stale)'); break }
          const positionMs = Number(msg.positionMs ?? 0)
          const playAt = Number(msg.playAt ?? Date.now())
          const wasPlaying = useSessionStore.getState().hostPlaying

          clearGuestCommandTimers()
          playbackAnchorRef.current = null
          pausedSinceRef.current = 0

          if (wasPlaying) {
            // Mirror the desktop guest: resume playback after a seek so scrubbing
            // doesn't leave the guest silent while the host plays on.
            scheduleGuestPlayback(positionMs, playAt)
          } else {
            useSessionStore.setState({ guestPositionMs: positionMs })
            void audioService.seek(positionMs).catch((err) => pushLog(`Seek failed: ${err.message}`))
          }
          break
        }

        case 'SYNC_PONG': {
          const t3 = Date.now()
          const t0 = Number(msg.t0 ?? 0)
          const t1 = Number(msg.t1 ?? 0)
          const t2 = Number(msg.t2 ?? 0)
          const offset = ((t1 - t0) + (t2 - t3)) / 2
          const rtt = (t3 - t0) - (t2 - t1)
          clockSync.applySample(offset, rtt)
          useSessionStore.setState({
            clockOffsetMs: clockSync.getOffset(),
            guestSyncReady: true,
          })
          maybeSendReadyAck()
          maybeApplyPendingPlay()
          break
        }

        case 'READY_REQUEST': {
          const positionMs = Number(msg.positionMs ?? 0)
          const trackId = String(msg.trackId ?? 'unknown')
          pushLog(`← READY_REQUEST at ${positionMs}ms`)
          pendingReadyRef.current = { trackId, positionMs }
          useSessionStore.setState({ guestStreamReady: false })
          socketClient.sendToHost({ type: 'SYNC_PING', t0: Date.now() })

          if (!guestStreamLoadedRef.current) break

          maybeSendReadyAck()
          break
        }

        case 'STREAM_INIT': {
          const hostIp = socketClient.getHost()
          const hostPort = socketClient.getPort()
          const mimeType = String(msg.mimeType || 'audio/mpeg')
          const ext = mimeType === 'audio/wav' ? '.wav' : mimeType === 'audio/flac' ? '.flac' : mimeType === 'audio/aac' ? '.aac' : mimeType === 'audio/mp4' ? '.m4a' : mimeType === 'audio/ogg' ? '.ogg' : '.mp3'
          const streamUrl = `http://${hostIp}:${hostPort}/stream${ext}?trackId=${msg.trackId}`
          const trackId = String(msg.trackId ?? '')

          // The host re-sends STREAM_INIT for the current track on the first play
          // (handlePlay calls startStream right before broadcasting CMD_PLAY). If it's
          // the same stream we already have loaded/loading, don't tear it down — that
          // teardown is exactly what made the first play silent. Just keep going.
          const sameStream = lastStreamRef.current?.streamUrl === streamUrl &&
            (guestStreamLoadedRef.current || streamLoadingRef.current)
          if (sameStream) {
            pushLog('STREAM_INIT (same track) — keeping loaded stream')
            break
          }

          clearGuestCommandTimers()
          pendingPlayRef.current = null
          pendingReadyRef.current = null
          playbackAnchorRef.current = null
          readyAckInFlightRef.current = false
          pausedSinceRef.current = 0
          guestStreamLoadedRef.current = false
          useSessionStore.setState({
            guestTrackName: String(msg.fileName ?? ''),
            guestStreamReady: false,
            guestSyncReady: false,
            guestPositionMs: 0,
            guestDurationMs: 0,
          })
          pushLog(`Track: ${String(msg.fileName ?? '')}`)

          void loadGuestStream(streamUrl, trackId).then((ok) => {
            if (!ok) return
            maybeSendReadyAck()
            maybeApplyPendingPlay()
          })
          break
        }

        default:
          break
      }
    }

    const handleDisconnect = () => {
      pushLog('Disconnected from host')
      clearGuestCommandTimers()
      pendingPlayRef.current = null
      pendingReadyRef.current = null
      playbackAnchorRef.current = null
      lastStreamRef.current = null
      pausedSinceRef.current = 0
      streamLoadingRef.current = false
      readyAckInFlightRef.current = false
      guestStreamLoadedRef.current = false
      guestEpochRef.current = 0
      guestLastSeqRef.current = -1
      void leaveSession()
    }

    const handleError = (err: Error) => {
      pushLog(`Socket error: ${err.message}`)
    }

    socketClient.on('message', handleMessage)
    socketClient.on('disconnected', handleDisconnect)
    socketClient.on('error', handleError)

    return () => {
      socketClient.off('message', handleMessage)
      socketClient.off('disconnected', handleDisconnect)
      socketClient.off('error', handleError)
    }
  }, [isGuestConnected, pushLog, leaveSession])

  // ── Audio service status listener ──────────────────────────────────────────
  useEffect(() => {
    audioService.onStatusUpdate((status) => {
      const isGuest = useSessionStore.getState().guestConnected
      if (status.isLoaded) {
        if (isGuest) {
          // ── Continuous drift correction ──────────────────────────────────
          // The guest streams over HTTP (buffering + decode latency) while the
          // host plays a local file, so the two decoders drift apart. We compare
          // the guest's actual position against where the host's timeline says it
          // should be, and nudge with a seek when the gap is audible. This is what
          // keeps "one voice, one speaker" alignment over the whole track.
          const anchor = playbackAnchorRef.current
          const hostPlaying = useSessionStore.getState().hostPlaying
          if (
            anchor && hostPlaying && clockSync.isSynced() &&
            !status.isBuffering && status.durationMs > 0
          ) {
            const serverNow = clockSync.toServerTime(Date.now())
            const expected = anchor.positionMs + (serverNow - anchor.serverMs)
            const drift = status.positionMs - expected
            const now = Date.now()
            if (
              Math.abs(drift) > DRIFT_CORRECTION_MS &&
              expected > 0 && expected < status.durationMs - 500 &&
              now - lastDriftSeekRef.current > DRIFT_COOLDOWN_MS
            ) {
              lastDriftSeekRef.current = now
              void audioService.seek(expected)
              pushLog(`Drift ${Math.round(drift)}ms — re-synced to host`)
            }
          }
          useSessionStore.setState({
            guestPositionMs: status.positionMs,
            guestDurationMs: status.durationMs,
            guestStreamReady: status.isLoaded && !status.isBuffering,
          })
        } else {
          _setHostPosition(status.positionMs)
          _setHostDuration(status.durationMs)
          _setHostPlaying(status.isPlaying)
          if (status.didJustFinish) {
            void nextTrack()
          }
        }
      } else {
        if (!isGuest) {
          _setHostPlaying(false)
        }
      }
    })
  }, [_setHostPosition, _setHostDuration, _setHostPlaying, nextTrack])

  useEffect(() => {
    return () => {
      clearGuestCommandTimers()
    }
  }, [])

  // ── Route the player tab ───────────────────────────────────────────────────
  const renderPlayerTab = () => {
    if (hostRunning) return <HostSessionScreen />
    if (guestConnected) return <GuestSessionScreen />
    return <HomeScreen />
  }

  const renderScreen = () => {
    switch (activeTab) {
      case 'player': return renderPlayerTab()
      case 'queue': return <QueueScreen />
      case 'playlists': return <PlaylistsScreen />
      case 'network': return <NetworkScreen />
      case 'settings': return <SettingsScreen />
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <ExpoStatusBar style={themeColors.blurTint === 'light' ? 'dark' : 'light'} backgroundColor="transparent" translucent />

      <View style={styles.screenArea}>
        {renderScreen()}
      </View>

      {activeTab !== 'player' && <PlayerMiniBar />}

      <BottomTabBar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab)
          useSessionStore.getState().setActiveTab(tab)
        }}
      />
    </SafeAreaView>
  )
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.background,
  },
  screenArea: {
    flex: 1,
  },
})
