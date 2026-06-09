import { Svg, Polygon } from 'react-native-svg'
import { View, StyleSheet, ViewStyle } from 'react-native'
import { useMemo } from 'react'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'

type Props = {
  size?: number
  style?: ViewStyle
}

export default function BrandLogo({ size = 30, style }: Props) {
  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <Svg viewBox="0 0 100 100" width="100%" height="100%">
        {/* Base Hexagon (Top and Right faces) */}
        <Polygon
          points="25,5 75,5 100,50 75,95 25,95 0,50"
          fill={themeColors.primary}
        />
        {/* Dark Bottom-Left Face */}
        <Polygon
          points="0,50 50,50 75,95 25,95"
          fill="#7a3a00"
        />
      </Svg>
    </View>
  )
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  container: {
    shadowColor: theme.primary,
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 6,
  },
})
