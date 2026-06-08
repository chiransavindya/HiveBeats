import { StyleSheet, Text, View, type ViewStyle } from 'react-native'

type Tone = 'accent' | 'blue' | 'good' | 'warning' | 'error' | 'neutral' | 'live'

type Props = {
  label: string
  tone?: Tone
  style?: ViewStyle
}

const toneStyles: Record<Tone, { bg: string; text: string; dot?: string }> = {
  accent:  { bg: 'rgba(255, 107, 53, 0.15)',   text: '#ff8c5a',  dot: '#ff6b35' },
  blue:    { bg: 'rgba(78, 140, 255, 0.15)',   text: '#7db3ff',  dot: '#4e8cff' },
  good:    { bg: 'rgba(47, 184, 125, 0.15)',   text: '#2fb87d',  dot: '#2fb87d' },
  warning: { bg: 'rgba(251, 191, 36, 0.15)',   text: '#fbbf24',  dot: '#fbbf24' },
  error:   { bg: 'rgba(248, 113, 113, 0.15)',  text: '#f87171',  dot: '#f87171' },
  neutral: { bg: 'rgba(255, 255, 255, 0.06)',  text: 'rgba(225,235,247,0.78)' },
  live:    { bg: 'rgba(47, 184, 125, 0.15)',   text: '#2fb87d',  dot: '#2fb87d' },
}

export default function StatusChip({ label, tone = 'neutral', style }: Props) {
  const t = toneStyles[tone]
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }, style]}>
      {t.dot && (
        <View style={[styles.dot, { backgroundColor: t.dot }]} />
      )}
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
})
