import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useMemo } from 'react'
import type { Track } from '../types/session'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'
import { formatTime } from '../lib/formatters'

type Props = {
  track: Track
  index: number
  active: boolean
  onPress?: () => void
  onRemove?: () => void
}

export default function TrackRow({ track, index, active, onPress, onRemove }: Props) {
  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])

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

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    backgroundColor: theme.card,
    padding: 12,
  },
  rowActive: {
    backgroundColor: theme.primaryDim,
    borderWidth: 1,
    borderColor: theme.primaryDim,
  },
  indexBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  indexBadgeActive: {
    backgroundColor: theme.primaryDim,
  },
  indexText: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  indexTextActive: {
    color: theme.primary,
  },
  playingIcon: {
    color: theme.primary,
    fontSize: 14,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  titleActive: {
    color: theme.primary,
  },
  meta: {
    color: theme.textMuted,
    fontSize: 11,
  },
  duration: {
    color: theme.textSecondary,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  removeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: theme.dangerDim,
  },
  removeText: {
    color: theme.danger,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
})
