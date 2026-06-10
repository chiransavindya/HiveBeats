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

  const maybeApplyPendingPlay = () => {
    const msg = pendingPlayRef.current
    if (!msg || !guestStreamLoadedRef.current || !clockSync.isSynced()) return

    pendingPlayRef.current = null
    const positionMs = Number(msg.positionMs ?? 0)
    const playAt = Number(msg.playAt ?? Date.now())
    const delay = Math.max(0, clockSync.toLocalTime(playAt) - Date.now())

    useSessionStore.setState({ guestPositionMs: positionMs })
    const seekStartedAt = Date.now()
    void audioService.seek(positionMs)
      .catch((err) => pushLog(`Play seek failed: ${err.message}`))
      .finally(() => {
        const remainingDelay = Math.max(0, delay - (Date.now() - seekStartedAt))
        scheduleGuestCommand(() => {
          void audioService.play()
          useSessionStore.setState({ hostPlaying: true })
        }, remainingDelay)
      })
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
          const positionMs = Number(msg.positionMs ?? 0)
          const playAt = Number(msg.playAt ?? Date.now())
          const localPlayAt = clockSync.toLocalTime(playAt)
          const delay = Math.max(0, localPlayAt - Date.now())

          if (!guestStreamLoadedRef.current || !clockSync.isSynced()) {
            pendingPlayRef.current = msg
            pushLog('CMD_PLAY queued until stream and sync are ready')
            return
          }
          
          // Only seek if we are out of sync by more than 1.5 seconds, or if starting from the beginning
          const currentPos = useSessionStore.getState().guestPositionMs
          useSessionStore.setState({ guestPositionMs: positionMs })

          clearGuestCommandTimers()
          const needsSeek = Math.abs(currentPos - positionMs) > 1500 || positionMs < 100
          const seekStartedAt = Date.now()
          const readyToSchedule = needsSeek
            ? audioService.seek(positionMs).catch((err) => pushLog(`Play seek failed: ${err.message}`))
            : Promise.resolve()
          void readyToSchedule.finally(() => {
            const remainingDelay = Math.max(0, delay - (Date.now() - seekStartedAt))
            scheduleGuestCommand(() => {
              void audioService.play()
              useSessionStore.setState({ hostPlaying: true })
            }, remainingDelay)
          })
          break
        }

        case 'CMD_PAUSE': {
          const pauseAt = Number(msg.pauseAt ?? Date.now())
          const localPauseAt = clockSync.toLocalTime(pauseAt)
          const delay = Math.max(0, localPauseAt - Date.now())
          clearGuestCommandTimers()
          scheduleGuestCommand(() => {
            void audioService.pause()
            useSessionStore.setState({ hostPlaying: false })
          }, delay)
          break
        }

        case 'CMD_SEEK': {
          const positionMs = Number(msg.positionMs ?? 0)
          useSessionStore.setState({ guestPositionMs: positionMs })
          void audioService.seek(positionMs)
          break
        }

        case 'SYNC_PONG': {
          const t3 = Date.now()
          const t0 = Number(msg.t0 ?? 0)
          const t1 = Number(msg.t1 ?? 0)
          const t2 = Number(msg.t2 ?? 0)
          const offset = ((t1 - t0) + (t2 - t3)) / 2
          clockSync.applyOffset(offset)
          useSessionStore.setState({
            clockOffsetMs: offset,
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

          clearGuestCommandTimers()
          pendingPlayRef.current = null
          pendingReadyRef.current = null
          readyAckInFlightRef.current = false
          guestStreamLoadedRef.current = false
          guestLoadingTrackRef.current = trackId
          useSessionStore.setState({
            guestTrackName: String(msg.fileName ?? ''),
            guestStreamReady: false,
            guestSyncReady: false,
            guestPositionMs: 0,
            guestDurationMs: 0,
          })
          pushLog(`Track: ${String(msg.fileName ?? '')}`)
          
          audioService.load(streamUrl, false, useSessionStore.getState().guestMuted ? 0 : useSessionStore.getState().guestVolume)
            .then(({ durationMs }) => {
              if (guestLoadingTrackRef.current !== trackId) return
              guestStreamLoadedRef.current = true
              useSessionStore.setState({ guestStreamReady: true })
              if (durationMs > 0) useSessionStore.setState({ guestDurationMs: durationMs })
              pushLog('Stream loaded')
              maybeSendReadyAck()
              maybeApplyPendingPlay()
            })
            .catch(err => {
              if (guestLoadingTrackRef.current !== trackId) return
              pushLog(`Stream load failed: ${err.message}`)
              useSessionStore.setState({
                guestError: `Stream load failed: ${err.message}`,
                guestStreamReady: false,
              })
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
      readyAckInFlightRef.current = false
      guestStreamLoadedRef.current = false
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
