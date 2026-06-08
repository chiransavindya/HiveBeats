import { useEffect, useRef, useState } from 'react'
import {
  Appearance,
  Platform,
  SafeAreaView,
  StatusBar,
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
  } = useSessionStore()

  const [activeTab, setActiveTab] = useState<TabId>('player')

  // Keep screen awake during live sessions
  useKeepAwake(isSessionLive ? 'session-active' : undefined as unknown as string)

  // ── Load persisted state on startup ────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      // Load playlists
      await loadPlaylistsFromStorage()

      // Load theme
      const savedTheme = await loadTheme()
      setTheme(savedTheme)

      // Load network settings
      const ns = await loadNetworkSettings()
      setHostPortInput(ns.hostPort)
      setJoinPortInput(ns.joinPort)
      setBroadcastPortInput(ns.broadcastPort)
      setMdnsEnabled(ns.mdnsEnabled)
      setUdpEnabled(ns.udpEnabled)
      setRetryEnabled(ns.retryEnabled)

      // Configure audio
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

      // Get IP address on Android; on iOS it's available differently
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
    })
    return unsub
  }, [setNetworkState])

  // ── UDP discovery listener (guest side) ───────────────────────────────────
  useEffect(() => {
    const { udpEnabled, broadcastPortInput } = useSessionStore.getState()
    if (!guestConnected && udpEnabled) {
      udpDiscovery.startListening(Number(broadcastPortInput) || 7401, (session) => {
        addDiscoveredSession(session)
        pushLog(`Discovered: ${session.sessionCode} at ${session.hostAddress}`)
      })
    }
    return () => udpDiscovery.stopListening()
  }, [guestConnected, addDiscoveredSession, pushLog])

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

  // ── Determine color scheme ─────────────────────────────────────────────────
  const colorScheme = theme === 'system'
    ? Appearance.getColorScheme()
    : theme

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
      {/* KeepAwake via hook below */}

      {/* ── Screen content ────────────────────────────────────────────── */}
      <View style={styles.screenArea}>
        {renderScreen()}
      </View>

      {/* ── Mini player bar (above tabs, only during live sessions) ─── */}
      <PlayerMiniBar />

      {/* ── Bottom tab bar ────────────────────────────────────────────── */}
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
