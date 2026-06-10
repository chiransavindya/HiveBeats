import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useMemo } from 'react'
import Slider from '@react-native-community/slider'
import { formatTime } from '../lib/formatters'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'

type Props = {
  positionMs: number
  durationMs: number
  onSeek?: (ms: number) => void
  readOnly?: boolean
  accentColor?: string
}

export default function SeekBar({
  positionMs,
  durationMs,
  onSeek,
  readOnly = false,
}: Props) {
  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])
  const accentColor = themeColors.primary

  const safePositionMs = isNaN(positionMs) ? 0 : positionMs
  const safeDurationMs = isNaN(durationMs) ? 0 : durationMs
  const safeMax = Math.max(1, safeDurationMs)
  const progress = (safePositionMs / safeMax) * 100

  return (
    <View style={styles.container}>
      {/* Slider */}
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={safeMax}
        step={500}
        value={safePositionMs}
        minimumTrackTintColor={readOnly ? themeColors.accent : accentColor}
        maximumTrackTintColor={themeColors.border}
        thumbTintColor={readOnly ? 'transparent' : themeColors.textPrimary}
        disabled={readOnly || !onSeek}
        onSlidingComplete={(v) => {
          if (!readOnly && onSeek) onSeek(Math.round(v))
        }}
      />

      {/* Times */}
      <View style={styles.times}>
        <Text style={styles.time}>{formatTime(safePositionMs)}</Text>
        <Text style={styles.time}>{formatTime(safeDurationMs)}</Text>
      </View>
    </View>
  )
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  container: {
    gap: 2,
  },
  slider: {
    height: 36,
    marginHorizontal: -6,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    color: theme.textSecondary,
    fontSize: 12,
    fontFamily: 'monospace',
  },
})
