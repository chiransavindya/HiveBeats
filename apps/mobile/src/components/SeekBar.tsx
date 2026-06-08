import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Slider from '@react-native-community/slider'
import { formatTime } from '../lib/formatters'

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
  accentColor = '#ff6b35',
}: Props) {
  const safeMax = Math.max(1, durationMs)
  const progress = (positionMs / safeMax) * 100

  return (
    <View style={styles.container}>
      {/* Slider */}
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={safeMax}
        step={500}
        value={positionMs}
        minimumTrackTintColor={readOnly ? 'rgba(78,140,255,0.8)' : accentColor}
        maximumTrackTintColor="rgba(255,255,255,0.1)"
        thumbTintColor={readOnly ? 'transparent' : '#ffffff'}
        disabled={readOnly || !onSeek}
        onSlidingComplete={(v) => {
          if (!readOnly && onSeek) onSeek(Math.round(v))
        }}
      />

      {/* Times */}
      <View style={styles.times}>
        <Text style={styles.time}>{formatTime(positionMs)}</Text>
        <Text style={styles.time}>{formatTime(durationMs)}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
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
    color: 'rgba(213, 226, 244, 0.6)',
    fontSize: 12,
    fontFamily: 'monospace',
  },
})
