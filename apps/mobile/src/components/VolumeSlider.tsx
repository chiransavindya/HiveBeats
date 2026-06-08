import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Slider from '@react-native-community/slider'

type Props = {
  value: number          // 0–1
  muted: boolean
  onValueChange: (v: number) => void
  onToggleMute: () => void
  accentColor?: string
  label?: string
}

function VolumeIcon({ muted, volume }: { muted: boolean; volume: number }) {
  if (muted || volume === 0) {
    // Muted icon
    return (
      <Text style={styles.icon}>🔇</Text>
    )
  }
  if (volume < 0.4) return <Text style={styles.icon}>🔈</Text>
  if (volume < 0.7) return <Text style={styles.icon}>🔉</Text>
  return <Text style={styles.icon}>🔊</Text>
}

export default function VolumeSlider({
  value,
  muted,
  onValueChange,
  onToggleMute,
  accentColor = '#ff6b35',
  label,
}: Props) {
  const displayValue = muted ? 0 : value
  const percent = Math.round(displayValue * 100)

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.row}>
        <TouchableOpacity onPress={onToggleMute} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <VolumeIcon muted={muted} volume={value} />
        </TouchableOpacity>
        <View style={styles.sliderWrap}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={1}
            step={0.01}
            value={displayValue}
            minimumTrackTintColor={accentColor}
            maximumTrackTintColor="rgba(255,255,255,0.1)"
            thumbTintColor="#ffffff"
            onValueChange={(v) => {
              onValueChange(v)
            }}
          />
        </View>
        <Text style={styles.percent}>{percent}%</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: 'rgba(213, 226, 244, 0.5)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    fontSize: 18,
  },
  sliderWrap: {
    flex: 1,
  },
  slider: {
    height: 36,
  },
  percent: {
    color: 'rgba(213, 226, 244, 0.7)',
    fontSize: 12,
    fontFamily: 'monospace',
    minWidth: 36,
    textAlign: 'right',
  },
})
