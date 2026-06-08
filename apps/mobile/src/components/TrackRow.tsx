import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { Track } from '../types/session'
import { formatTime } from '../lib/formatters'

type Props = {
  track: Track
  index: number
  active: boolean
  onPress?: () => void
  onRemove?: () => void
}

export default function TrackRow({ track, index, active, onPress, onRemove }: Props) {
  return (
    <TouchableOpacity
      style={[styles.row, active && styles.rowActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Index / playing indicator */}
      <View style={[styles.indexBadge, active && styles.indexBadgeActive]}>
        {active ? (
          <Text style={styles.playingIcon}>♪</Text>
        ) : (
          <Text style={[styles.indexText, active && styles.indexTextActive]}>{index + 1}</Text>
        )}
      </View>

      {/* Track info */}
      <View style={styles.info}>
        <Text style={[styles.title, active && styles.titleActive]} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {track.artist ?? track.mimeType}
        </Text>
      </View>

      {/* Duration */}
      <Text style={styles.duration}>{formatTime(track.durationMs)}</Text>

      {/* Remove button */}
      {onRemove && (
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); onRemove() }}
          style={styles.removeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.removeText}>×</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: 12,
  },
  rowActive: {
    backgroundColor: 'rgba(255, 107, 53, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.3)',
  },
  indexBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  indexBadgeActive: {
    backgroundColor: 'rgba(255, 107, 53, 0.25)',
  },
  indexText: {
    color: 'rgba(225, 235, 247, 0.7)',
    fontSize: 12,
    fontWeight: '700',
  },
  indexTextActive: {
    color: '#ff8c5a',
  },
  playingIcon: {
    color: '#ff8c5a',
    fontSize: 14,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#f7fbff',
    fontSize: 14,
    fontWeight: '700',
  },
  titleActive: {
    color: '#ffaa80',
  },
  meta: {
    color: 'rgba(213, 226, 244, 0.55)',
    fontSize: 11,
  },
  duration: {
    color: 'rgba(213, 226, 244, 0.7)',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  removeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
  },
  removeText: {
    color: '#f87171',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
})
