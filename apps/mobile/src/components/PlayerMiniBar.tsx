import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSessionStore } from '../store/sessionStore'
import { formatTime } from '../lib/formatters'

type Props = {
  onPress?: () => void
}

export default function PlayerMiniBar({ onPress }: Props) {
  const {
    hostRunning,
    guestConnected,
    hostPlaying,
    selectedTrack,
    hostPositionMs,
    hostDurationMs,
    guestTrackName,
    guestPositionMs,
    guestDurationMs,
    playHost,
    pauseHost,
    setActiveTab,
  } = useSessionStore()

  const isHost = hostRunning
  const isGuest = guestConnected && !hostRunning

  const title = isHost
    ? (selectedTrack?.title ?? 'No track selected')
    : isGuest
    ? (guestTrackName || 'Waiting for host…')
    : ''

  const positionMs = isHost ? hostPositionMs : guestPositionMs
  const durationMs = isHost ? hostDurationMs : guestDurationMs
  const progress = durationMs > 0 ? (positionMs / durationMs) * 100 : 0

  if (!isHost && !isGuest) return null

  return (
    <TouchableOpacity
      style={styles.bar}
      onPress={() => setActiveTab('player')}
      activeOpacity={0.9}
    >
      {/* Progress line */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Track artwork icon */}
        <View style={[styles.artwork, isGuest && styles.artworkGuest]}>
          <Text style={styles.artworkIcon}>{isGuest ? '🎧' : '🎵'}</Text>
        </View>

        {/* Track info */}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.time}>
            {formatTime(positionMs)} / {formatTime(durationMs)}
          </Text>
        </View>

        {/* Play/Pause — host only */}
        {isHost && (
          <TouchableOpacity
            style={styles.playBtn}
            onPress={() => void (hostPlaying ? pauseHost() : playHost())}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.playIcon}>{hostPlaying ? '⏸' : '▶'}</Text>
          </TouchableOpacity>
        )}

        {/* Guest: listening indicator */}
        {isGuest && (
          <View style={styles.listeningDot} />
        )}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: 'rgba(8, 15, 28, 0.97)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(122, 173, 255, 0.18)',
  },
  progressTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressFill: {
    height: 2,
    backgroundColor: '#ff6b35',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  artwork: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 107, 53, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  artworkGuest: {
    backgroundColor: 'rgba(78, 140, 255, 0.15)',
    borderColor: 'rgba(78, 140, 255, 0.25)',
  },
  artworkIcon: {
    fontSize: 18,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#f7fbff',
    fontSize: 13,
    fontWeight: '700',
  },
  time: {
    color: 'rgba(213, 226, 244, 0.6)',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ff6b35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    fontSize: 15,
    color: '#fff',
  },
  listeningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4e8cff',
    opacity: 0.9,
  },
})
