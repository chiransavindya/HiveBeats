import { useColorScheme } from 'react-native'
import { useSessionStore } from '../store/sessionStore'
import { lightTheme, darkTheme, AppThemeColors } from '../theme/theme'

export function useAppTheme(): AppThemeColors {
  const userTheme = useSessionStore((state) => state.theme)
  const systemTheme = useColorScheme()

  const isDark = userTheme === 'dark' || (userTheme === 'system' && systemTheme === 'dark')

  return isDark ? darkTheme : lightTheme
}
