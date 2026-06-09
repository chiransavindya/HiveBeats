import { useCallback, useMemo, useState } from 'react'
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import { useSessionStore } from '../store/sessionStore'
import SessionCodeDisplay from '../components/SessionCodeDisplay'
import AppHeader from '../components/AppHeader'
import StatusChip from '../components/StatusChip'
import WaveformBars from '../components/WaveformBars'
import SeekBar from '../components/SeekBar'
import VolumeSlider from '../components/VolumeSlider'
import GuestRow from '../components/GuestRow'
import SectionCard from '../components/SectionCard'
import ConfirmModal from '../components/ConfirmModal'
import { createId, inferMimeType, stripExtension } from '../lib/formatters'
import type { Track } from '../types/session'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export default function HostSessionScreen() {
  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])
  const [showStopModal, setShowStopModal] = useState(false)

  const {
    sessionCode,
    regenerateCode,
    stopHost,
    guestList,
    addGuest,
    removeGuest,
    selectedTrack,
    queue,
    currentQueueIndex,
    hostPlaying,
    hostPositionMs,
    hostDurationMs,
    hostVolume,
    hostMuted,
    playbackRate,
    hostError,
    clockOffsetMs,
    queueRequestsAllowed,
    pendingQueueRequests,
    approveRequest,
    denyRequest,
    addTracks,
    playHost,
    pauseHost,
    stopHost2,
    seekHost,
    nextTrack,
    prevTrack,
    setHostVolume,
    setHostMuted,
    setPlaybackRate,
    setQueueRequestsAllowed,
  } = useSessionStore()

  const guestCount = guestList.length

  // ── Pick audio files ──────────────────────────────────────────────────────

  const handlePickAudio = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        multiple: true,
        copyToCacheDirectory: true,
      })
      if (result.canceled) return

      const tracks: Track[] = result.assets.map((asset) => ({
        id: createId('track'),
        title: stripExtension(asset.name),
        artist: undefined,
        durationMs: 0, // will be set after loading
        filePath: asset.uri,
        mimeType: asset.mimeType ?? inferMimeType(asset.name),
      }))
      addTracks(tracks)
    } catch (err) {
      Alert.alert('Error', `Could not pick audio: ${err}`)
    }
  }, [addTracks])

  const progressPercent = hostDurationMs > 0 ? (hostPositionMs / hostDurationMs) * 100 : 0

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader showStatus />

      {/* ── Session info ──────────────────────────────────────────────── */}
      <SectionCard
        title="Your Session"
        subtitle={`${guestCount} guest${guestCount !== 1 ? 's' : ''} connected`}
        rightSlot={
          <TouchableOpacity
            style={styles.stopBtn}
            onPress={() => setShowStopModal(true)}
          >
            <Text style={styles.stopBtnText}>Stop</Text>
          </TouchableOpacity>
        }
      >
        <View style={styles.codeRow}>
          <SessionCodeDisplay code={sessionCode} />
          <TouchableOpacity onPress={regenerateCode} style={styles.regenBtn}>
            <Feather name="refresh-cw" size={18} color={themeColors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.statusRow}>
          <StatusChip label="● LIVE" tone="live" />
          <StatusChip label={`Clock: ${clockOffsetMs.toFixed(0)}ms`} tone="neutral" />
          <View style={styles.queueToggle}>
            <Text style={styles.toggleLabel}>Allow Requests</Text>
            <Switch
              value={queueRequestsAllowed}
              onValueChange={setQueueRequestsAllowed}
              trackColor={{ false: themeColors.cardBorder, true: themeColors.primaryDim }}
              thumbColor={queueRequestsAllowed ? themeColors.primary : '#aaa'}
            />
          </View>
        </View>

        {hostError && (
          <View style={[styles.errorBox, { flexDirection: 'row', alignItems: 'center' }]}>
            <Feather name="alert-triangle" size={14} color={themeColors.danger} style={{ marginRight: 6 }} />
            <Text style={styles.errorText}>{hostError}</Text>
          </View>
        )}
      </SectionCard>

      {/* ── Pending song requests ──────────────────────────────────────── */}
      {pendingQueueRequests.length > 0 && (
        <SectionCard title={`🎵 Song Requests (${pendingQueueRequests.length})`}>
          {pendingQueueRequests.map((req) => (
            <View key={req.id} style={styles.requestRow}>
              <View style={styles.requestInfo}>
                <Text style={styles.requestGuest}>{req.guestAlias}</Text>
                <Text style={styles.requestSong}>"{req.suggestion}"</Text>
              </View>
              <View style={styles.requestBtns}>
                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={() => approveRequest(req.id)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Feather name="check" size={12} color="#2fb87d" />
                    <Text style={styles.approveTxt}>Approve</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.denyBtn}
                  onPress={() => denyRequest(req.id)}
                >
                  <Feather name="x" size={14} color="#f87171" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </SectionCard>
      )}

      {/* ── Now Playing ────────────────────────────────────────────────── */}
      <SectionCard title="Now Playing">
        {/* Track info */}
        <View style={styles.trackInfo}>
          <View style={[styles.artwork, hostPlaying && styles.artworkPlaying]}>
            <Feather name="music" size={28} color="rgba(255,255,255,0.8)" />
          </View>
          <View style={styles.trackDetails}>
            {selectedTrack ? (
              <>
                <Text style={styles.trackTitle} numberOfLines={2}>{selectedTrack.title}</Text>
                <Text style={styles.trackMeta}>{selectedTrack.mimeType}</Text>
              </>
            ) : (
              <>
                <Text style={styles.trackPlaceholder}>No track selected</Text>
                <Text style={styles.trackMeta}>Pick an audio file to start</Text>
              </>
            )}
          </View>
        </View>

        {/* Waveform visualizer */}
        <WaveformBars isPlaying={hostPlaying} height={56} />

        {/* Seek bar */}
        <SeekBar
          positionMs={hostPositionMs}
          durationMs={hostDurationMs}
          onSeek={(ms) => void seekHost(ms)}
        />

        {/* Playback speed */}
        <View style={styles.speedRow}>
          <Text style={styles.speedLabel}>Speed</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.speedPills}>
            {PLAYBACK_SPEEDS.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.speedPill, playbackRate === s && styles.speedPillActive]}
                onPress={() => setPlaybackRate(s)}
              >
                <Text style={[styles.speedPillText, playbackRate === s && styles.speedPillTextActive]}>
                  {s}×
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Transport controls */}
        <View style={styles.transport}>
          <TouchableOpacity
            style={[styles.ctrlBtn, currentQueueIndex <= 0 && styles.ctrlBtnDisabled]}
            onPress={() => void prevTrack()}
            disabled={currentQueueIndex <= 0}
          >
            <Feather name="skip-back" size={18} color="#f7fbff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ctrlBtn}
            onPress={() => void seekHost(Math.max(0, hostPositionMs - 10000))}
            disabled={!selectedTrack}
          >
            <Feather name="rewind" size={18} color="#f7fbff" />
          </TouchableOpacity>

          {hostPlaying ? (
            <TouchableOpacity
              style={styles.playBtnMain}
              onPress={() => void pauseHost()}
            >
              <Feather name="pause" size={22} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.playBtnMain, !selectedTrack && queue.length === 0 && styles.playBtnDisabled]}
              onPress={() => void playHost()}
              disabled={!selectedTrack && queue.length === 0}
            >
              <Feather name="play" size={22} color="#fff" style={{ marginLeft: 3 }} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.ctrlBtn}
            onPress={() => void seekHost(Math.min(hostDurationMs, hostPositionMs + 10000))}
            disabled={!selectedTrack}
          >
            <Feather name="fast-forward" size={18} color="#f7fbff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.ctrlBtn, currentQueueIndex >= queue.length - 1 && styles.ctrlBtnDisabled]}
            onPress={() => void nextTrack()}
            disabled={currentQueueIndex >= queue.length - 1}
          >
            <Feather name="skip-forward" size={18} color="#f7fbff" />
          </TouchableOpacity>
        </View>

        {/* Volume */}
        <VolumeSlider
          value={hostVolume}
          muted={hostMuted}
          onValueChange={setHostVolume}
          onToggleMute={() => setHostMuted(!hostMuted)}
          label="Volume"
          accentColor="#ff6b35"
        />

        {/* Actions row */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.addTrackBtn} onPress={() => void handlePickAudio()}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="plus" size={14} color="#7db3ff" />
              <Text style={styles.addTrackText}>Add Track</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.stopTrackBtn, !selectedTrack && styles.stopTrackBtnDisabled]}
            onPress={() => void stopHost2()}
            disabled={!selectedTrack}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="square" size={14} color="#f87171" />
              <Text style={styles.stopTrackText}>Stop</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Status line */}
        <View style={styles.statusLine}>
          <View style={[styles.statusDot, selectedTrack && styles.statusDotLive]} />
          <Text style={styles.statusLineText}>
            {selectedTrack ? 'STREAMING' : 'IDLE'}
          </Text>
        </View>
      </SectionCard>

      {/* ── Connected Guests ───────────────────────────────────────────── */}
      {guestList.length > 0 && (
        <SectionCard title={`Connected Guests (${guestList.length})`}>
          {guestList.map((guest) => (
            <GuestRow
              key={guest.deviceId}
              guest={guest}
              onRemove={() => removeGuest(guest.deviceId)}
            />
          ))}
        </SectionCard>
      )}

      <ConfirmModal
        visible={showStopModal}
        title="Stop Hosting"
        message="This will disconnect all guests."
        confirmText="Stop"
        isDestructive
        onCancel={() => setShowStopModal(false)}
        onConfirm={() => void stopHost()}
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

  // Code row
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  regenBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  regenText: {
    color: theme.textPrimary,
    fontSize: 18,
  },

  // Status
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  queueToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  toggleLabel: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },

  // Stop btn
  stopBtn: {
    backgroundColor: theme.dangerDim,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.dangerDim,
  },
  stopBtnText: {
    color: theme.danger,
    fontSize: 13,
    fontWeight: '700',
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

  // Song requests
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  requestInfo: { flex: 1, gap: 3 },
  requestGuest: {
    color: theme.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  requestSong: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  requestBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  approveBtn: {
    backgroundColor: theme.successDim,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.successDim,
  },
  approveTxt: { color: theme.success, fontSize: 12, fontWeight: '700' },
  denyBtn: {
    backgroundColor: theme.dangerDim,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.dangerDim,
  },
  denyTxt: { color: theme.danger, fontSize: 13, fontWeight: '700' },

  // Track info
  trackInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  artwork: {
    width: 70,
    height: 70,
    borderRadius: 16,
    backgroundColor: theme.primaryDim,
    borderWidth: 1,
    borderColor: theme.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  artworkPlaying: {
    borderColor: theme.primary,
    shadowColor: theme.primary,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  },
  artworkIcon: { fontSize: 28 },
  trackDetails: { flex: 1, gap: 4 },
  trackTitle: {
    color: theme.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  trackPlaceholder: {
    color: theme.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  trackMeta: {
    color: theme.textSecondary,
    fontSize: 12,
  },

  // Speed pills
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  speedLabel: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  speedPills: {
    flexDirection: 'row',
    gap: 6,
  },
  speedPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: theme.cardBorder,
    borderWidth: 1,
    borderColor: theme.border,
  },
  speedPillActive: {
    backgroundColor: theme.primaryDim,
    borderColor: theme.primary,
  },
  speedPillText: {
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  speedPillTextActive: {
    color: theme.primary,
  },

  // Transport
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  ctrlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlBtnDisabled: { opacity: 0.25 },
  ctrlIcon: { fontSize: 18 },
  playBtnMain: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.primary,
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 8,
  },
  playBtnDisabled: { opacity: 0.4 },
  playBtnIcon: { fontSize: 22, color: '#fff' },

  // Actions row
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  addTrackBtn: {
    flex: 1,
    backgroundColor: theme.secondaryDim,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.secondaryDim,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addTrackText: {
    color: theme.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
  stopTrackBtn: {
    backgroundColor: theme.dangerDim,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.dangerDim,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  stopTrackBtnDisabled: { opacity: 0.35 },
  stopTrackText: {
    color: theme.danger,
    fontSize: 14,
    fontWeight: '700',
  },

  // Status line
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.cardBorder,
  },
  statusDotLive: { backgroundColor: theme.success },
  statusLineText: {
    color: theme.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 1.2,
  },
})
