import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { TabId } from '../types/session'
import { useSessionStore } from '../store/sessionStore'

type TabConfig = {
  id: TabId
  label: string
  icon: string
  guestLabel?: string
}

const TABS: TabConfig[] = [
  { id: 'player', label: 'Player', icon: '🎵', guestLabel: 'Listening' },
  { id: 'queue', label: 'Queue', icon: '🎶', guestLabel: 'Request' },
  { id: 'playlists', label: 'Playlists', icon: '📋' },
  { id: 'network', label: 'Network', icon: '📡' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
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

  return (
    <View style={styles.bar}>
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
              <Text style={[styles.icon, isActive && styles.iconActive]}>
                {tab.icon}
              </Text>
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
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(6, 11, 22, 0.98)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(122, 173, 255, 0.15)',
    paddingBottom: 4,
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
  },
  icon: {
    fontSize: 20,
    opacity: 0.45,
  },
  iconActive: {
    opacity: 1,
  },
  label: {
    fontSize: 10,
    color: 'rgba(213, 226, 244, 0.45)',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  labelActive: {
    color: '#ff8c5a',
  },
  activeDot: {
    position: 'absolute',
    bottom: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ff6b35',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#ff6b35',
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
