import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useMemo } from 'react'
import { Feather } from '@expo/vector-icons'
import Slider from '@react-native-community/slider'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'

type Props = {
  value: number          // 0–1
  muted: boolean
  onValueChange: (v: number) => void
  onToggleMute: () => void
  accentColor?: string
  label?: string
}

function VolumeIcon({ muted, volume, color }: { muted: boolean; volume: number; color: string }) {
  if (muted || volume === 0) {
    // Muted icon
    return <Feather name="volume-x" size={18} color={color} />
  }
  if (volume < 0.4) return <Feather name="volume" size={18} color={color} />
  if (volume < 0.7) return <Feather name="volume-1" size={18} color={color} />
  return <Feather name="volume-2" size={18} color={color} />
}

export default function VolumeSlider({
  value,
  muted,
  onValueChange,
  onToggleMute,
  accentColor = '#ff6b35',
  label,
}: Props) {
  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])
  const displayValue = muted ? 0 : value
  const activeAccent = accentColor === '#ff6b35' ? themeColors.primary : accentColor
  const percent = Math.round(displayValue * 100)

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.row}>
        <TouchableOpacity onPress={onToggleMute} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <VolumeIcon muted={muted} volume={value} color={themeColors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.sliderWrap}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={1}
            step={0.01}
            value={displayValue}
            minimumTrackTintColor={activeAccent}
            maximumTrackTintColor={themeColors.cardBorder}
            thumbTintColor={themeColors.textPrimary}
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

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: theme.textMuted,
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
    color: theme.textSecondary,
    fontSize: 12,
    fontFamily: 'monospace',
    minWidth: 36,
    textAlign: 'right',
  },
})
