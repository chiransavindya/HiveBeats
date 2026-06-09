import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Appearance } from 'react-native'
import { useMemo } from 'react'
import { Feather } from '@expo/vector-icons'
import { useSessionStore } from '../store/sessionStore'
import SectionCard from '../components/SectionCard'
import AppHeader from '../components/AppHeader'
import StatusChip from '../components/StatusChip'
import BrandLogo from '../components/BrandLogo'
import type { AppTheme } from '../lib/asyncStorage'
import { saveTheme } from '../lib/asyncStorage'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'

const THEMES: { value: AppTheme; label: string; desc: string }[] = [
  { value: 'system', label: 'System', desc: 'Follow device dark/light mode' },
  { value: 'dark', label: 'Dark', desc: 'Always dark (default)' },
  { value: 'light', label: 'Light', desc: 'Always light' },
]

export default function SettingsScreen() {
  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])

  const { theme, setTheme, deviceAlias, deviceId } = useSessionStore()

  const handleThemeChange = async (t: AppTheme) => {
    setTheme(t)
    await saveTheme(t)
    const schemeToApply = t === 'system' ? Appearance.getColorScheme() ?? 'dark' : t
    Appearance.setColorScheme(schemeToApply)
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader title="Settings" />

      {/* ── Appearance ──────────────────────────────────────────────────── */}
      <SectionCard title="Appearance">
        <Text style={styles.sectionLabel}>Theme</Text>
        <View style={styles.themeList}>
          {THEMES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.themeRow, theme === t.value && styles.themeRowActive]}
              onPress={() => void handleThemeChange(t.value)}
              activeOpacity={0.75}
            >
              <View style={styles.themeInfo}>
                <Text style={[styles.themeLabel, theme === t.value && styles.themeLabelActive]}>
                  {t.label}
                </Text>
                <Text style={styles.themeDesc}>{t.desc}</Text>
              </View>
              {theme === t.value && (
                <View style={styles.checkmark}>
                  <Feather name="check" size={16} color={themeColors.primary} />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </SectionCard>

      {/* ── Device info ─────────────────────────────────────────────────── */}
      <SectionCard title="This Device">
        <View style={styles.deviceRow}>
          <Text style={styles.deviceLabel}>Device alias</Text>
          <Text style={styles.deviceValue}>{deviceAlias}</Text>
        </View>
        <View style={[styles.deviceRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.deviceLabel}>Device ID</Text>
          <Text style={[styles.deviceValue, styles.monoText]} numberOfLines={1}>
            {deviceId.slice(0, 20)}…
          </Text>
        </View>
      </SectionCard>

      {/* ── Keyboard shortcuts / gestures ──────────────────────────────── */}
      <SectionCard title="Gestures & Controls">
        {[
          { icon: 'minimize-2', gesture: 'Mini Bar', action: 'Tap to open Now Playing tab' },
          { icon: 'list', gesture: 'Track Row', action: 'Tap to load & play that track' },
          { icon: 'copy', gesture: 'Session Code', action: 'Tap to copy to clipboard' },
          { icon: 'sliders', gesture: 'Volume Slider', action: 'Drag to adjust volume' },
          { icon: 'navigation', gesture: 'Seek Bar (host)', action: 'Drag to seek; broadcasts to guests' },
          { icon: 'lock', gesture: 'Seek Bar (guest)', action: 'Read-only — controlled by host' },
        ].map(({ icon, gesture, action }) => (
          <View key={gesture} style={styles.gestureRow}>
            <View style={styles.gestureIconWrap}>
              <Feather name={icon as any} size={16} color={themeColors.secondary} />
            </View>
            <View style={styles.gestureTextWrap}>
              <Text style={styles.gestureName}>{gesture}</Text>
              <Text style={styles.gestureAction}>{action}</Text>
            </View>
          </View>
        ))}
      </SectionCard>

      {/* ── About ───────────────────────────────────────────────────────── */}
      <SectionCard title="About">
        <View style={styles.aboutHeader}>
          <BrandLogo size={44} />
          <View>
            <Text style={styles.aboutName}>HiveBeats</Text>
            <Text style={styles.aboutVersion}>Version 1.1.0 · Mobile</Text>
          </View>
        </View>

        <Text style={styles.aboutDesc}>
          Sync audio playback over your local Wi-Fi network. One device hosts, others listen — all in perfect sync.
        </Text>

        <View style={styles.badgesRow}>
          <StatusChip label="LAN Only" tone="blue" />
          <StatusChip label="v1.1" tone="accent" />
          <StatusChip label="React Native" tone="neutral" />
        </View>

        <View style={styles.footerBlock}>
          <Text style={styles.quote}>"The hive mind is in the music. Listen together."</Text>
          <View style={styles.footerBranding}>
            <Feather name="hexagon" size={12} color={themeColors.primary} />
            <Text style={styles.credits}>Made by Bees of the Hive</Text>
          </View>
        </View>
      </SectionCard>
    </ScrollView>
  )
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 110,
    gap: 4,
  },

  sectionLabel: {
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Theme
  themeList: { gap: 6 },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: 14,
  },
  themeRowActive: {
    backgroundColor: theme.primaryDim,
    borderColor: theme.primaryDim,
  },
  themeInfo: { gap: 3 },
  themeLabel: {
    color: theme.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  themeLabelActive: {
    color: theme.primary,
  },
  themeDesc: {
    color: theme.textSecondary,
    fontSize: 12,
  },
  checkmark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: {
    color: theme.primary,
    fontSize: 15,
    fontWeight: '800',
  },

  // Device info
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  deviceLabel: {
    color: theme.textSecondary,
    fontSize: 13,
  },
  deviceValue: {
    color: theme.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    maxWidth: '55%',
    textAlign: 'right',
  },
  monoText: {
    fontFamily: 'monospace',
    fontSize: 12,
  },

  // Gestures
  gestureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  gestureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.secondaryDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gestureTextWrap: {
    flex: 1,
  },
  gestureName: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  gestureAction: {
    color: theme.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },

  // About
  aboutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  aboutName: {
    color: theme.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  aboutVersion: {
    color: theme.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  aboutDesc: {
    color: theme.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  footerBlock: {
    marginTop: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    alignItems: 'center',
    gap: 10,
  },
  quote: {
    color: theme.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  footerBranding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  credits: {
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
})
