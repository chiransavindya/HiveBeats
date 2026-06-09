import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useMemo } from 'react'
import { BlurView } from 'expo-blur'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { TabId } from '../types/session'
import { useSessionStore } from '../store/sessionStore'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'

type TabConfig = {
  id: TabId
  label: string
  icon: keyof typeof Feather.glyphMap
  guestLabel?: string
}

const TABS: TabConfig[] = [
  { id: 'player', label: 'Player', icon: 'music', guestLabel: 'Listening' },
  { id: 'queue', label: 'Queue', icon: 'list', guestLabel: 'Request' },
  { id: 'playlists', label: 'Playlists', icon: 'folder' },
  { id: 'network', label: 'Network', icon: 'radio' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

type Props = {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

export default function BottomTabBar({ activeTab, onTabChange }: Props) {
  const {
    hostRunning,
    guestConnected,
    queue,
    pendingQueueRequests,
    logs,
  } = useSessionStore()

  const isGuest = guestConnected && !hostRunning

  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])
  const insets = useSafeAreaInsets()

  return (
    <BlurView intensity={80} tint={themeColors.blurTint} style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 4) }]}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id
        const label = isGuest && tab.guestLabel ? tab.guestLabel : tab.label

        // Badge counts
        let badge = 0
        if (tab.id === 'queue') {
          badge = hostRunning ? pendingQueueRequests.length : 0
        }
        if (tab.id === 'network') {
          badge = logs.length
        }

        return (
          <TouchableOpacity
            key={tab.id}
            style={styles.tab}
            onPress={() => onTabChange(tab.id)}
            activeOpacity={0.7}
          >
            {/* Icon + badge wrapper */}
            <View style={styles.iconWrap}>
              <Feather
                name={tab.icon}
                size={22}
                color={isActive ? themeColors.primary : themeColors.textMuted}
              />
              {badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
                </View>
              )}
            </View>

            <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
              {label}
            </Text>

            {/* Active indicator dot */}
            {isActive && <View style={styles.activeDot} />}
          </TouchableOpacity>
        )
      })}
    </BlurView>
  )
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: theme.background === '#06111f' ? 'rgba(6, 11, 22, 0.65)' : 'rgba(248, 250, 252, 0.85)',
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingBottom: 4,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
    gap: 3,
    position: 'relative',
  },
  iconWrap: {
    position: 'relative',
    marginBottom: 4,
  },
  label: {
    fontSize: 10,
    color: theme.textSecondary,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  labelActive: {
    color: theme.primary,
  },
  activeDot: {
    position: 'absolute',
    bottom: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.primary,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: theme.primary,
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
})
