import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Playlist } from '../types/session'

const PLAYLISTS_KEY = 'hivebeats:playlists'
const THEME_KEY = 'hivebeats:theme'
const SETTINGS_KEY = 'hivebeats:network-settings'

// ─── Playlists ───────────────────────────────────────────────────────────────

export async function loadPlaylists(): Promise<Playlist[]> {
  try {
    const raw = await AsyncStorage.getItem(PLAYLISTS_KEY)
    return raw ? (JSON.parse(raw) as Playlist[]) : []
  } catch {
    return []
  }
}

export async function savePlaylists(playlists: Playlist[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists))
  } catch {
    // ignore write errors
  }
}

// ─── Theme ───────────────────────────────────────────────────────────────────

export type AppTheme = 'system' | 'light' | 'dark'

export async function loadTheme(): Promise<AppTheme> {
  try {
    const raw = await AsyncStorage.getItem(THEME_KEY)
    return (raw as AppTheme) ?? 'system'
  } catch {
    return 'system'
  }
}

export async function saveTheme(theme: AppTheme): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_KEY, theme)
  } catch {}
}

// ─── Network settings ────────────────────────────────────────────────────────

export interface NetworkSettings {
  hostPort: string
  joinPort: string
  broadcastPort: string
  mdnsEnabled: boolean
  udpEnabled: boolean
  retryEnabled: boolean
}

export const DEFAULT_NETWORK_SETTINGS: NetworkSettings = {
  hostPort: '7400',
  joinPort: '7400',
  broadcastPort: '7401',
  mdnsEnabled: true,
  udpEnabled: true,
  retryEnabled: true,
}

export async function loadNetworkSettings(): Promise<NetworkSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY)
    return raw ? { ...DEFAULT_NETWORK_SETTINGS, ...(JSON.parse(raw) as Partial<NetworkSettings>) } : DEFAULT_NETWORK_SETTINGS
  } catch {
    return DEFAULT_NETWORK_SETTINGS
  }
}

export async function saveNetworkSettings(settings: NetworkSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {}
}
