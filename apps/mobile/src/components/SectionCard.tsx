import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useMemo } from 'react'
import { BlurView } from 'expo-blur'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'
import { LinearGradient } from 'expo-linear-gradient'

type Props = {
  title: string
  subtitle?: string
  rightSlot?: ReactNode
  children: ReactNode
}

export default function SectionCard({ title, subtitle, rightSlot, children }: Props) {
  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])

  return (
    <View style={styles.cardWrapper}>
      <BlurView intensity={50} tint={themeColors.blurTint} style={styles.cardBlur}>
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {rightSlot ? <View>{rightSlot}</View> : null}
          </View>
          <View style={styles.body}>{children}</View>
        </View>
      </BlurView>
    </View>
  )
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  cardWrapper: {
    marginBottom: 14,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: theme.background === '#06111f' ? 0.18 : 0.05,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: theme.background === '#06111f' ? 3 : 2,
    backgroundColor: theme.background === '#06111f' ? 'rgba(8, 15, 28, 0.4)' : theme.card,
  },
  cardBlur: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    overflow: 'hidden',
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: theme.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subtitle: {
    color: theme.textSecondary,
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  body: {
    gap: 12,
  },
})
