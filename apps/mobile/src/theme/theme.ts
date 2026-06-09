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
}

export const darkTheme: AppThemeColors = {
  background: '#06111f',
  card: 'rgba(255,255,255,0.04)',
  cardBorder: 'rgba(255,255,255,0.08)',
  textPrimary: '#f7fbff',
  textSecondary: 'rgba(213,226,244,0.7)',
  textMuted: 'rgba(213,226,244,0.4)',
  border: 'rgba(255,255,255,0.1)',
  primary: '#ff6b35',
  primaryDim: 'rgba(255,107,53,0.15)',
  secondary: '#7db3ff',
  secondaryDim: 'rgba(78,140,255,0.15)',
  accent: '#4e8cff',
  accentDim: 'rgba(78,140,255,0.1)',
  danger: '#f87171',
  dangerDim: 'rgba(248,113,113,0.12)',
  warning: '#fbbf24',
  warningDim: 'rgba(251,191,36,0.12)',
  success: '#2fb87d',
  successDim: 'rgba(47,184,125,0.15)',
  blurTint: 'dark',
  gradientStart: '#ff8c5a',
  gradientEnd: '#ff6b35',
}

export const lightTheme: AppThemeColors = {
  background: '#f8fafc',
  card: '#ffffff',
  cardBorder: 'rgba(0,0,0,0.08)',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  border: 'rgba(0,0,0,0.1)',
  primary: '#ff6b35', // Brand color stays similar, maybe slightly adjusted
  primaryDim: 'rgba(255,107,53,0.15)',
  secondary: '#3b82f6',
  secondaryDim: 'rgba(59,130,246,0.15)',
  accent: '#2563eb',
  accentDim: 'rgba(37,99,235,0.1)',
  danger: '#ef4444',
  dangerDim: 'rgba(239,68,68,0.15)',
  warning: '#f59e0b',
  warningDim: 'rgba(245,158,11,0.15)',
  success: '#10b981',
  successDim: 'rgba(16,185,129,0.15)',
  blurTint: 'light',
  gradientStart: '#ff8c5a',
  gradientEnd: '#ff6b35',
}
