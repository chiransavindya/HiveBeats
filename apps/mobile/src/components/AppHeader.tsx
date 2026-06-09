import { StyleSheet, Text, View } from 'react-native'
import { useMemo } from 'react'
import { useSessionStore } from '../store/sessionStore'
import BrandLogo from './BrandLogo'
import StatusChip from './StatusChip'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'

type Props = {
  title?: string
  showStatus?: boolean
}

export default function AppHeader({ title = 'HiveBeats', showStatus = false }: Props) {
  const { connected, connectionLabel } = useSessionStore()
  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])

  return (
    <View style={styles.appHeader}>
      <View style={styles.brand}>
        <BrandLogo size={28} />
        <Text style={styles.brandName}>{title}</Text>
      </View>
      {showStatus && (
        <StatusChip
          label={connected ? connectionLabel : 'No network'}
          tone={connected ? 'blue' : 'neutral'}
        />
      )}
    </View>
  )
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingBottom: 6,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandName: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.textPrimary,
    letterSpacing: -0.3,
  },
})
