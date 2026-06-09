import { useCallback, useState, useMemo } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import { useSessionStore } from '../store/sessionStore'
import TrackRow from '../components/TrackRow'
import SectionCard from '../components/SectionCard'
import AppHeader from '../components/AppHeader'
import { createId, inferMimeType, stripExtension } from '../lib/formatters'
import type { Track } from '../types/session'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'

export default function QueueScreen() {
  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])
  const {
    hostRunning,
    guestConnected,
    queue,
    currentQueueIndex,
    hostPlaying,
    queueRequestsAllowed,
    pendingQueueRequests,
    guestSuggestion,
    playlists,
    addTracks,
    removeTrack,
    loadTrackAtIndex,
    playHost,
    saveQueueAsPlaylist,
    setGuestSuggestion,
    submitGuestRequest,
  } = useSessionStore()

  const isHost = hostRunning
  const isGuest = guestConnected && !hostRunning

  const [guestPending, setGuestPending] = useState<string | null>(null)

  // ── Host: add audio files ─────────────────────────────────────────────────

  const handleAddAudio = useCallback(async () => {
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
        durationMs: 0,
        filePath: asset.uri,
        mimeType: asset.mimeType ?? inferMimeType(asset.name),
      }))
      addTracks(tracks)
    } catch (err) {
      Alert.alert('Error', `Could not pick audio: ${err}`)
    }
  }, [addTracks])

  // ── Guest: submit song request ─────────────────────────────────────────────

  const handleGuestRequest = useCallback(async () => {
    const suggestion = guestSuggestion.trim()
    if (!suggestion) return
    setGuestPending(suggestion)
    try {
      await submitGuestRequest(suggestion)
      setGuestSuggestion('')
    } catch {
      setGuestPending(null)
    }
  }, [guestSuggestion, submitGuestRequest, setGuestSuggestion])

  const handleGuestFileRequest = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      })
      if (result.canceled) return
      const asset = result.assets[0]
      if (!asset) return
      await submitGuestRequest(asset.name, asset.uri)
    } catch (err) {
      Alert.alert('Error', `Could not pick audio: ${err}`)
    }
  }, [submitGuestRequest])

  // ── Host Queue View ────────────────────────────────────────────────────────

  if (isHost) {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <AppHeader title="Queue" />

          <SectionCard
            title={`Play Queue (${queue.length})`}
            rightSlot={
              <TouchableOpacity style={styles.addBtn} onPress={() => void handleAddAudio()}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="plus" size={12} color={themeColors.secondary} />
                  <Text style={styles.addBtnText}>Add Track</Text>
                </View>
              </TouchableOpacity>
            }
          >
            {queue.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="list" size={42} color={themeColors.textMuted} style={{ marginBottom: 4 }} />
                <Text style={styles.emptyTitle}>Queue is empty</Text>
                <Text style={styles.emptyHint}>Add audio files to get started</Text>
                <TouchableOpacity
                  style={styles.emptyAddBtn}
                  onPress={() => void handleAddAudio()}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="plus" size={14} color="#fff" />
                    <Text style={styles.emptyAddText}>Add Track</Text>
                  </View>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {queue.map((track, i) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    index={i}
                    active={i === currentQueueIndex}
                    onPress={() => void loadTrackAtIndex(i).then(() => playHost())}
                    onRemove={() => removeTrack(i)}
                  />
                ))}
              </>
            )}
          </SectionCard>

          {/* Save as playlist */}
          {queue.length > 0 && playlists.length > 0 && (
            <SectionCard title="Save Queue">
              <Text style={styles.saveHint}>Save current queue to an existing playlist:</Text>
              {playlists.map((pl) => (
                <TouchableOpacity
                  key={pl.id}
                  style={styles.playlistSaveRow}
                  onPress={() => void saveQueueAsPlaylist(pl.id)}
                >
                  <View>
                    <Text style={styles.playlistSaveName}>{pl.name}</Text>
                    <Text style={styles.playlistSaveMeta}>{pl.tracks.length} tracks</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.saveArrow}>Save</Text>
                    <Feather name="arrow-right" size={13} color={themeColors.secondary} />
                  </View>
                </TouchableOpacity>
              ))}
            </SectionCard>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  // ── Guest Song Request View ────────────────────────────────────────────────

  if (isGuest) {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AppHeader title="Queue" />

          <SectionCard title="Request a Song">
            {!queueRequestsAllowed ? (
              <View style={styles.disabledBox}>
                <Feather name="slash" size={32} color={themeColors.textSecondary} style={{ marginBottom: 8 }} />
                <Text style={styles.disabledText}>Host has disabled song requests.</Text>
              </View>
            ) : guestPending ? (
              <View style={styles.pendingBox}>
                <Feather name="clock" size={22} color="rgba(251,191,36,0.8)" />
                <View style={styles.pendingInfo}>
                  <Text style={styles.pendingTitle}>Request pending…</Text>
                  <Text style={styles.pendingText}>"{guestPending}"</Text>
                </View>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setGuestPending(null)}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.requestHint}>
                  Type a song name or artist to suggest it to the host. The host can approve or deny your request.
                </Text>

                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, styles.inputFlex]}
                    placeholder="Song name or artist…"
                    placeholderTextColor={themeColors.textMuted}
                    value={guestSuggestion}
                    onChangeText={setGuestSuggestion}
                    returnKeyType="send"
                    onSubmitEditing={() => void handleGuestRequest()}
                  />
                  <TouchableOpacity
                    style={[styles.sendBtn, !guestSuggestion.trim() && styles.sendBtnDisabled]}
                    onPress={() => void handleGuestRequest()}
                    disabled={!guestSuggestion.trim()}
                  >
                    <Feather name="arrow-right" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.fileRequestBtn}
                  onPress={() => void handleGuestFileRequest()}
                >
                  <Feather name="paperclip" size={18} color={themeColors.textSecondary} />
                  <Text style={styles.fileRequestText}>Upload an audio file to host</Text>
                </TouchableOpacity>
              </>
            )}
          </SectionCard>

          {/* Suggest from playlists */}
          {playlists.length > 0 && (
            <SectionCard title="Suggest from My Playlists">
              <Text style={styles.requestHint}>
                Pick a track from your local playlists to suggest to the host.
              </Text>
              {playlists.map((pl) => (
                <View key={pl.id} style={styles.playlistSection}>
                  <Text style={styles.playlistName}>{pl.name}</Text>
                  {pl.tracks.map((track) => (
                    <TouchableOpacity
                      key={track.id}
                      style={styles.suggestTrackRow}
                      onPress={() => {
                        setGuestSuggestion(track.title)
                      }}
                    >
                      <Text style={styles.suggestTrackTitle} numberOfLines={1}>
                        {track.title}
                      </Text>
                      <Text style={styles.suggestText}>Suggest</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </SectionCard>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  // ── Idle (no session) ─────────────────────────────────────────────────────

  return (
    <View style={styles.flex}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <AppHeader title="Queue" />
      </View>
      <View style={styles.centered}>
        <Feather name="list" size={48} color={themeColors.textMuted} style={{ marginBottom: 8 }} />
        <Text style={styles.idleTitle}>No Active Session</Text>
        <Text style={styles.idleHint}>Start or join a session to manage the queue.</Text>
      </View>
    </View>
  )
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 110,
    gap: 4,
  },

  // Add button
  addBtn: {
    backgroundColor: theme.secondaryDim,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: theme.secondaryDim,
  },
  addBtnText: {
    color: theme.secondary,
    fontSize: 12,
    fontWeight: '700',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  emptyIcon: { fontSize: 36, opacity: 0.3 },
  emptyTitle: {
    color: theme.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyHint: {
    color: theme.textSecondary,
    fontSize: 13,
  },
  emptyAddBtn: {
    marginTop: 8,
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  emptyAddText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },

  // Save as playlist
  saveHint: {
    color: theme.textSecondary,
    fontSize: 13,
  },
  playlistSaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 12,
  },
  playlistSaveName: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  playlistSaveMeta: {
    color: theme.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  saveArrow: {
    color: theme.secondary,
    fontSize: 13,
    fontWeight: '700',
  },

  // Request section
  requestHint: {
    color: theme.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputFlex: { flex: 1 },
  input: {
    backgroundColor: theme.cardBorder,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    color: theme.textPrimary,
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sendBtn: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.35 },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: '700' },

  fileRequestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.border,
    padding: 14,
  },
  fileRequestIcon: { fontSize: 18 },
  fileRequestText: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },

  // Pending request
  pendingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.warningDim,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.warningDim,
    padding: 14,
  },
  pendingIcon: { fontSize: 22 },
  pendingInfo: { flex: 1 },
  pendingTitle: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  pendingText: {
    color: theme.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: theme.cardBorder,
  },
  cancelText: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },

  // Disabled requests
  disabledBox: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  disabledIcon: { fontSize: 32 },
  disabledText: {
    color: theme.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },

  // Playlist suggestions
  playlistSection: { gap: 6 },
  playlistName: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingBottom: 4,
  },
  suggestTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  suggestTrackTitle: {
    color: theme.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  suggestText: {
    color: theme.secondary,
    fontSize: 12,
    fontWeight: '700',
  },

  // Idle
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 32,
  },
  idleIcon: { fontSize: 48, opacity: 0.25 },
  idleTitle: {
    color: theme.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  idleHint: {
    color: theme.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
})
