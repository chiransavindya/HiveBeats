import { StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { useMemo } from 'react'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'

type Tone = 'accent' | 'blue' | 'good' | 'warning' | 'error' | 'neutral' | 'live'

type Props = {
  label: string
  tone?: Tone
  style?: ViewStyle
}

export default function StatusChip({ label, tone = 'neutral', style }: Props) {
  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])

  const toneStyles: Record<Tone, { bg: string; text: string; dot?: string }> = {
    accent:  { bg: themeColors.primaryDim,   text: themeColors.primary,  dot: themeColors.primary },
    blue:    { bg: themeColors.secondaryDim,   text: themeColors.secondary,  dot: themeColors.secondary },
    good:    { bg: themeColors.successDim,   text: themeColors.success,  dot: themeColors.success },
    warning: { bg: themeColors.warningDim,   text: themeColors.warning,  dot: themeColors.warning },
    error:   { bg: themeColors.dangerDim,  text: themeColors.danger,  dot: themeColors.danger },
    neutral: { bg: themeColors.cardBorder,  text: themeColors.textSecondary },
    live:    { bg: themeColors.successDim,   text: themeColors.success,  dot: themeColors.success },
  }

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

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
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
