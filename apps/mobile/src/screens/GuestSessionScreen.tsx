import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useMemo, useState } from 'react'
import { Feather } from '@expo/vector-icons'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'
import { useSessionStore } from '../store/sessionStore'
import SessionCodeDisplay from '../components/SessionCodeDisplay'
import AppHeader from '../components/AppHeader'
import StatusChip from '../components/StatusChip'
import SeekBar from '../components/SeekBar'
import VolumeSlider from '../components/VolumeSlider'
import SectionCard from '../components/SectionCard'
import ConfirmModal from '../components/ConfirmModal'
import { formatTime } from '../lib/formatters'

export default function GuestSessionScreen() {
  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])
  const [showLeaveModal, setShowLeaveModal] = useState(false)

  const {
    sessionCode,
    guestTrackName,
    guestPositionMs,
    guestDurationMs,
    guestVolume,
    guestMuted,
    guestStreamReady,
    guestSyncReady,
    guestError,
    clockOffsetMs,
    leaveSession,
    setGuestVolume,
    setGuestMuted,
  } = useSessionStore()

  const progressPercent = guestDurationMs > 0 ? (guestPositionMs / guestDurationMs) * 100 : 0

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader showStatus />

      {/* ── Now Listening ───────────────────────────────────────────────── */}
      <SectionCard>
        {/* Track artwork + info */}
        <View style={styles.trackInfo}>
          <View style={[styles.artwork, guestStreamReady && styles.artworkActive]}>
            <Feather name="headphones" size={28} color={themeColors.accent} />
          </View>
          <View style={styles.trackDetails}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <StatusChip label="LIVE" tone="live" />
              {!guestStreamReady && <StatusChip label="Buffering" tone="warning" />}
              {guestStreamReady && !guestSyncReady && <StatusChip label="Syncing" tone="warning" />}
            </View>
            {guestTrackName ? (
              <Text style={styles.trackTitle} numberOfLines={2}>{guestTrackName}</Text>
            ) : (
              <>
                <Text style={styles.waitingTitle}>Waiting for host…</Text>
                <Text style={styles.waitingMeta}>Host hasn't started playback</Text>
              </>
            )}
          </View>
          <TouchableOpacity onPress={() => setShowLeaveModal(true)} style={styles.iconBtn}>
            <Feather name="log-out" size={16} color={themeColors.danger} />
          </TouchableOpacity>
        </View>

        {/* Progress bar (read-only) */}
        <View style={{ marginTop: 20, marginBottom: 12 }}>
          {guestTrackName ? (
            <SeekBar
              positionMs={guestPositionMs}
              durationMs={guestDurationMs}
              readOnly
              accentColor={themeColors.accent}
            />
          ) : (
            <View style={styles.emptyProgress}>
              <View style={styles.emptyProgressBar} />
              <View style={styles.emptyProgressTimes}>
                <Text style={styles.emptyProgressTime}>0:00</Text>
                <Text style={styles.emptyProgressTime}>--:--</Text>
              </View>
            </View>
          )}
        </View>

        {/* Guest volume */}
        <VolumeSlider
          value={guestVolume}
          muted={guestMuted}
          onValueChange={setGuestVolume}
          onToggleMute={() => setGuestMuted(!guestMuted)}
          accentColor={themeColors.accent}
        />

        {guestError && (
          <View style={[styles.errorBox, { flexDirection: 'row', alignItems: 'center' }]}>
            <Feather name="alert-triangle" size={14} color={themeColors.danger} style={{ marginRight: 6 }} />
            <Text style={styles.errorText}>{guestError}</Text>
          </View>
        )}
      </SectionCard>

      {/* ── Session info ────────────────────────────────────────────────── */}
      <SectionCard>
        <SessionCodeDisplay code={sessionCode} />
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: themeColors.textSecondary, fontSize: 13, textAlign: 'center', fontWeight: '600' }}>
            Connected to Host • Offset: {clockOffsetMs.toFixed(0)}ms
          </Text>
        </View>
      </SectionCard>

      {/* ── Guest tips ──────────────────────────────────────────────────── */}
      <SectionCard title="Tips">
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <Feather name="headphones" size={14} color={themeColors.textMuted} style={{ marginTop: 2 }} />
          <Text style={[styles.tip, { flex: 1 }]}>Playback is controlled by the host. You can only adjust your own volume.</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <Feather name="music" size={14} color={themeColors.textMuted} style={{ marginTop: 2 }} />
          <Text style={[styles.tip, { flex: 1 }]}>Use the Queue tab to suggest songs to the host.</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Feather name="radio" size={14} color={themeColors.textMuted} style={{ marginTop: 2 }} />
          <Text style={[styles.tip, { flex: 1 }]}>Stay on the same Wi-Fi network as the host for best sync quality.</Text>
        </View>
      </SectionCard>

      <ConfirmModal
        visible={showLeaveModal}
        title="Leave Session"
        message="Disconnect from this session?"
        confirmText="Leave"
        isDestructive
        onCancel={() => setShowLeaveModal(false)}
        onConfirm={() => void leaveSession()}
      />
    </ScrollView>
  )
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 4,
  },

  // Status badges
  statusBadges: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },


  iconBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: theme.cardBorder,
  },

  // Track artwork + info
  trackInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  artwork: {
    width: 70,
    height: 70,
    borderRadius: 16,
    backgroundColor: theme.accentDim,
    borderWidth: 1,
    borderColor: theme.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  artworkActive: {
    borderColor: theme.accent,
    shadowColor: theme.accent,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 5,
  },
  artworkIcon: { fontSize: 28 },
  trackDetails: { flex: 1, gap: 4 },
  trackTitle: {
    color: theme.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  trackMeta: {
    color: theme.textSecondary,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  waitingTitle: {
    color: theme.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  waitingMeta: {
    color: theme.textSecondary,
    fontSize: 12,
  },

  // Empty progress
  emptyProgress: { gap: 4 },
  emptyProgressBar: {
    height: 4,
    borderRadius: 99,
    backgroundColor: theme.cardBorder,
  },
  emptyProgressTimes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  emptyProgressTime: {
    color: theme.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
  },

  // Error
  errorBox: {
    backgroundColor: theme.dangerDim,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.dangerDim,
  },
  errorText: { color: theme.danger, fontSize: 13 },



  // Tips
  tip: {
    color: theme.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
})
