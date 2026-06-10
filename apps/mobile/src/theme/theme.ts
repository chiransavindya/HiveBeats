export type AppThemeColors = {
  background: string
  card: string
  cardBorder: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  border: string
  primary: string
  primaryDim: string
  secondary: string
  secondaryDim: string
  accent: string
  accentDim: string
  danger: string
  dangerDim: string
  warning: string
  warningDim: string
  success: string
  successDim: string
  blurTint: 'dark' | 'light' | 'default'
  gradientStart: string
  gradientEnd: string
  surfaceSubtle: string
}

export const darkTheme: AppThemeColors = {
  background: '#000000',
  card: '#121212',
  cardBorder: 'rgba(255,255,255,0.12)',
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.7)',
  textMuted: 'rgba(255,255,255,0.4)',
  border: 'rgba(255,255,255,0.15)',
  primary: '#FF6D00',
  primaryDim: 'rgba(255,109,0,0.15)',
  secondary: '#FFD600',
  secondaryDim: 'rgba(255,214,0,0.15)',
  accent: '#FFD600',
  accentDim: 'rgba(255,214,0,0.15)',
  danger: '#FF1744',
  dangerDim: 'rgba(255,23,68,0.15)',
  warning: '#FF9100',
  warningDim: 'rgba(255,145,0,0.15)',
  success: '#00E676',
  successDim: 'rgba(0,230,118,0.15)',
  blurTint: 'dark',
  gradientStart: '#FF9100',
  gradientEnd: '#FF6D00',
  surfaceSubtle: 'rgba(255,255,255,0.05)',
}

export const lightTheme: AppThemeColors = {
  background: '#FFFFFF',
  card: '#F5F5F5',
  cardBorder: 'rgba(0,0,0,0.1)',
  textPrimary: '#000000',
  textSecondary: 'rgba(0,0,0,0.65)',
  textMuted: 'rgba(0,0,0,0.4)',
  border: 'rgba(0,0,0,0.15)',
  primary: '#FF6D00',
  primaryDim: 'rgba(255,109,0,0.15)',
  secondary: '#FBC02D',
  secondaryDim: 'rgba(251,192,45,0.15)',
  accent: '#FBC02D',
  accentDim: 'rgba(251,192,45,0.15)',
  danger: '#D50000',
  dangerDim: 'rgba(213,0,0,0.15)',
  warning: '#FF9100',
  warningDim: 'rgba(255,145,0,0.15)',
  success: '#00C853',
  successDim: 'rgba(0,200,83,0.15)',
  blurTint: 'light',
  gradientStart: '#FF9100',
  gradientEnd: '#FF6D00',
  surfaceSubtle: '#F1F1F1',
}
