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
import SectionCard from '../components/SectionCard'
import TrackRow from '../components/TrackRow'
import AppHeader from '../components/AppHeader'
import { createId, inferMimeType, stripExtension } from '../lib/formatters'
import type { Track } from '../types/session'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'

export default function PlaylistsScreen() {
  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])

  const {
    hostRunning,
    guestConnected,
    playlists,
    queue,
    createPlaylist,
    deletePlaylist,
    loadPlaylist,
    saveQueueAsPlaylist,
    addTrackToPlaylist,
    setGuestSuggestion,
    setActiveTab,
  } = useSessionStore()

  const isHost = hostRunning
  const isGuest = guestConnected && !hostRunning

  const [newName, setNewName] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [playlistError, setPlaylistError] = useState('')

  const handleCreate = useCallback(async () => {
    const name = newName.trim()
    if (!name) { setPlaylistError('Please enter a playlist name.'); return }
    setPlaylistError('')
    await createPlaylist(name)
    setNewName('')
  }, [newName, createPlaylist])

  const handleAddTrack = useCallback(async (playlistId: string) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      })
      if (result.canceled) return
      const asset = result.assets[0]
      if (!asset) return
      const track: Track = {
        id: createId('track'),
        title: stripExtension(asset.name),
        artist: undefined,
        durationMs: 0,
        filePath: asset.uri,
        mimeType: asset.mimeType ?? inferMimeType(asset.name),
      }
      await addTrackToPlaylist(playlistId, track)
    } catch (err) {
      Alert.alert('Error', `Could not pick audio: ${err}`)
    }
  }, [addTrackToPlaylist])

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
        <AppHeader title="Playlists" />

        {/* ── Create playlist ─────────────────────────────────────────────── */}
        <SectionCard title="Playlists">
          <View style={styles.createRow}>
            <TextInput
              style={[styles.input, styles.inputFlex]}
              placeholder="New playlist name…"
              placeholderTextColor={themeColors.textMuted}
              value={newName}
              onChangeText={(t) => { setNewName(t); setPlaylistError('') }}
              returnKeyType="done"
              onSubmitEditing={() => void handleCreate()}
            />
            <TouchableOpacity
              style={[styles.createBtn, !newName.trim() && styles.createBtnDisabled]}
              onPress={() => void handleCreate()}
              disabled={!newName.trim()}
            >
              <Feather name="plus" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {playlistError ? (
            <Text style={styles.errorText}>{playlistError}</Text>
          ) : null}

          {isGuest && (
            <Text style={styles.guestHint}>
              These are your local playlists. You can suggest tracks from them to the host.
            </Text>
          )}

          {!isHost && !isGuest && (
            <Text style={styles.guestHint}>
              Manage your playlists here before joining a session.
            </Text>
          )}
        </SectionCard>

        {/* ── Playlist list ───────────────────────────────────────────────── */}
        {playlists.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="folder" size={42} color={themeColors.textMuted} style={{ marginBottom: 4 }} />
            <Text style={styles.emptyTitle}>No playlists yet</Text>
            <Text style={styles.emptyHint}>Create one above to save your favorite tracks.</Text>
          </View>
        ) : (
          playlists.map((pl) => {
            const isExpanded = expandedId === pl.id
            return (
              <SectionCard key={pl.id} title={pl.name} subtitle={`${pl.tracks.length} track${pl.tracks.length !== 1 ? 's' : ''}`}>
                {/* Playlist actions */}
                <View style={styles.actionsRow}>
                  {isHost && (
                    <>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => void loadPlaylist(pl)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Feather name="play" size={12} color={themeColors.textPrimary} />
                          <Text style={styles.actionBtnText}>Play / Load</Text>
                        </View>
                      </TouchableOpacity>
                      {queue.length > 0 && (
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => void saveQueueAsPlaylist(pl.id)}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Feather name="download" size={12} color={themeColors.textPrimary} />
                            <Text style={styles.actionBtnText}>Save Queue</Text>
                          </View>
                        </TouchableOpacity>
                      )}
                    </>
                  )}

                  {(isGuest || (!isHost && !isGuest)) && pl.tracks[0] && (
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => {
                        const t = pl.tracks[0]
                        if (t) { setGuestSuggestion(t.title); setActiveTab('queue') }
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="message-square" size={12} color={themeColors.textPrimary} />
                        <Text style={styles.actionBtnText}>Suggest Top</Text>
                      </View>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => void handleAddTrack(pl.id)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Feather name="plus" size={12} color={themeColors.textPrimary} />
                      <Text style={styles.actionBtnText}>Add Track</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.expandBtn}
                    onPress={() => setExpandedId(isExpanded ? null : pl.id)}
                  >
                    <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={themeColors.textSecondary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => {
                      Alert.alert(
                        'Delete Playlist',
                        `Delete "${pl.name}"? This cannot be undone.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => void deletePlaylist(pl.id) },
                        ],
                      )
                    }}
                  >
                    <Feather name="trash-2" size={14} color={themeColors.danger} />
                  </TouchableOpacity>
                </View>

                {/* Expanded tracks */}
                {isExpanded && pl.tracks.length > 0 && (
                  <View style={styles.trackList}>
                    {pl.tracks.map((track, i) => (
                      <View key={track.id} style={styles.trackItem}>
                        <Text style={styles.trackNum}>{i + 1}.</Text>
                        <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
                        {isGuest && (
                          <TouchableOpacity
                            onPress={() => {
                              setGuestSuggestion(track.title)
                              setActiveTab('queue')
                            }}
                          >
                            <Text style={styles.suggestText}>Suggest</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {isExpanded && pl.tracks.length === 0 && (
                  <Text style={styles.noTracksHint}>No tracks yet. Add some!</Text>
                )}
              </SectionCard>
            )
          })
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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

  createRow: {
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
  createBtn: {
    backgroundColor: theme.primary,
    borderRadius: 14,
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.primary,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
  },
  errorText: {
    color: theme.danger,
    fontSize: 13,
    marginTop: 4,
  },
  guestHint: {
    color: theme.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 60,
  },
  emptyTitle: {
    color: theme.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyHint: {
    color: theme.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 240,
  },

  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  actionBtn: {
    backgroundColor: theme.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: theme.border,
  },
  actionBtnText: {
    color: theme.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  expandBtn: {
    backgroundColor: theme.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: theme.border,
  },
  expandText: {
    color: theme.textSecondary,
    fontSize: 12,
  },
  deleteBtn: {
    backgroundColor: theme.dangerDim,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: theme.dangerDim,
    marginLeft: 'auto',
  },
  deleteTxt: { fontSize: 14 },

  trackList: {
    backgroundColor: theme.cardBorder,
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trackNum: {
    color: theme.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
    minWidth: 20,
  },
  trackTitle: {
    color: theme.textPrimary,
    fontSize: 13,
    flex: 1,
  },
  suggestText: {
    color: theme.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  noTracksHint: {
    color: theme.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
})
