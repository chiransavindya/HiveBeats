import { useEffect, useState } from 'react'
import {
  Appearance,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { StatusBar as ExpoStatusBar } from 'expo-status-bar'
import { useKeepAwake } from 'expo-keep-awake'

import { useSessionStore } from './store/sessionStore'
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

export default function App() {
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

  const [activeTab, setActiveTab] = useState<TabId>('player')

  // Keep screen awake during live sessions
  useKeepAwake(isSessionLive ? 'session-active' : undefined as unknown as string)

  // ── Load persisted state on startup ────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      await loadPlaylistsFromStorage()

      const savedTheme = await loadTheme()
      setTheme(savedTheme)

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

    const { udpEnabled, broadcastPortInput, hostAddress } = useSessionStore.getState()

    if (!udpEnabled) return

    const port = Number(broadcastPortInput) || 7400

    udpDiscovery.startListening(
      port,
      (session) => {
        addDiscoveredSession(session)
        pushLog(`Found host: ${session.sessionCode} @ ${session.hostAddress}`)
      },
      hostAddress,
    )

    return () => udpDiscovery.stopListening()
  }, [isGuestConnected, addDiscoveredSession, pushLog])

  // ── Socket client message handler (guest incoming messages) ───────────────
  useEffect(() => {
    if (!isGuestConnected) return

    const handleMessage = (msg: Record<string, unknown>) => {
      const type = msg.type as string
      pushLog(`← ${type}`)

      switch (type) {
        case 'WELCOME':
          // Host acknowledged our HELLO
          pushLog(`Host: ${String(msg.hostId ?? '')}`)
          break

        case 'CMD_PLAY': {
          const positionMs = Number(msg.positionMs ?? 0)
          const playAt = Number(msg.playAt ?? Date.now())
          const delay = Math.max(0, playAt - Date.now())
          useSessionStore.setState({ guestPositionMs: positionMs })
          setTimeout(() => {
            void audioService.play()
            useSessionStore.setState({ hostPlaying: true })
          }, delay)
          break
        }

        case 'CMD_PAUSE': {
          const pauseAt = Number(msg.pauseAt ?? Date.now())
          const delay = Math.max(0, pauseAt - Date.now())
          setTimeout(() => {
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

        case 'SYNC_PING': {
          // Reply with pong so host can calculate our clock offset
          const t0 = Number(msg.t0 ?? 0)
          socketClient.sendToHost({ type: 'SYNC_PONG', t0, t1: Date.now() })
          break
        }

        case 'STREAM_INIT':
          useSessionStore.setState({
            guestTrackName: String(msg.fileName ?? ''),
            guestStreamReady: false,
            guestSyncReady: false,
            guestPositionMs: 0,
            guestDurationMs: 0,
          })
          pushLog(`Track: ${String(msg.fileName ?? '')}`)
          break

        default:
          break
      }
    }

    const handleDisconnect = () => {
      pushLog('Disconnected from host')
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
      if (status.isLoaded) {
        _setHostPosition(status.positionMs)
        _setHostDuration(status.durationMs)
        _setHostPlaying(status.isPlaying)
        if (status.didJustFinish) {
          void nextTrack()
        }
      } else {
        _setHostPlaying(false)
      }
    })
  }, [_setHostPosition, _setHostDuration, _setHostPlaying, nextTrack])

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
    <SafeAreaView style={styles.root}>
      <ExpoStatusBar style="light" />

      <View style={styles.screenArea}>
        {renderScreen()}
      </View>

      <PlayerMiniBar />

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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#06111f',
  },
  screenArea: {
    flex: 1,
  },
})
