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
  ActivityIndicator,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useSessionStore } from '../store/sessionStore'
import SessionCodeDisplay from '../components/SessionCodeDisplay'
import StatusChip from '../components/StatusChip'
import SectionCard from '../components/SectionCard'
import AppHeader from '../components/AppHeader'
import { QRScanner } from '../components/QRScanner'
import { LinearGradient } from 'expo-linear-gradient'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'

export default function HomeScreen() {
  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])

  const {
    sessionCode,
    regenerateCode,
    startHost,
    joinSession,
    hostPortInput,
    hostError,
    deviceAlias,
    connected,
    connectionLabel,
    hostAddress,
    discoveredSessions,
    clearDiscoveredSessions,
  } = useSessionStore()

  const [joinHost, setJoinHost] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [isStarting, setIsStarting] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [showQRScanner, setShowQRScanner] = useState(false)
  const [showHostQR, setShowHostQR] = useState(false)

  const handleStartHost = useCallback(async () => {
    setIsStarting(true)
    try {
      await startHost()
    } finally {
      setIsStarting(false)
    }
  }, [startHost])

  const handleJoin = useCallback(async (hostOverride?: string, codeOverride?: string) => {
    const ip = (hostOverride ?? joinHost).trim()
    const code = (codeOverride ?? joinCode).trim() || sessionCode

    if (!ip) {
      Alert.alert('Enter Host IP', 'Please enter the host device IP address to connect.')
      return
    }
    setIsJoining(true)
    try {
      await joinSession(code, ip)
    } finally {
      setIsJoining(false)
    }
  }, [joinHost, joinCode, sessionCode, joinSession])

  if (showQRScanner) {
    return (
      <QRScanner 
        onScan={(ip, port, code) => {
          setShowQRScanner(false)
          setJoinHost(ip)
          setJoinCode(code)
          joinSession(code, ip).catch(() => {})
        }}
        onCancel={() => setShowQRScanner(false)} 
      />
    )
  }

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
        <AppHeader showStatus />

        {/* ── Host Section ───────────────────────────────────────────────── */}
        <SectionCard>
          <View style={styles.sessionHeader}>
            <View style={{ gap: 4 }}>
              <Text style={styles.sessionTitle}>Host a Session</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.sessionSubtitle}>{deviceAlias}</Text>
                {connected && (
                  <>
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: themeColors.border }} />
                    <Text style={[styles.sessionSubtitle, { fontFamily: 'monospace' }]}>{hostAddress}:{hostPortInput}</Text>
                  </>
                )}
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity onPress={() => setShowHostQR(!showHostQR)} style={styles.iconBtn}>
                <Feather name="maximize" size={16} color={showHostQR ? themeColors.primary : themeColors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={regenerateCode} style={styles.iconBtn}>
                <Feather name="refresh-cw" size={16} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ marginBottom: 4 }}>
            <SessionCodeDisplay code={sessionCode} showQR={showHostQR} />
          </View>

          {hostError && (
            <View style={[styles.errorBox, { flexDirection: 'row', alignItems: 'center', marginTop: 12 }]}>
              <Feather name="alert-triangle" size={14} color={themeColors.danger} style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{hostError}</Text>
            </View>
          )}

          <View style={styles.infoBox}>
            <Feather name="info" size={14} color={themeColors.textSecondary} style={{ marginRight: 8, marginTop: 2 }} />
            <Text style={{ color: themeColors.textSecondary, fontSize: 13, flex: 1, lineHeight: 18 }}>
              Hosting requires a native build. Please use your PC app to host, and join from here!
            </Text>
          </View>
        </SectionCard>

        {/* ── Join Section ───────────────────────────────────────────────── */}
        <SectionCard title="Join a Session">

          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.inputFlex]}
              placeholder="Host IP (e.g. 192.168.1.5)"
              placeholderTextColor={themeColors.textMuted}
              value={joinHost}
              onChangeText={setJoinHost}
              keyboardType="default"
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={() => void handleJoin()}
            />
            <TouchableOpacity
              style={[styles.joinBtnContainer, (!joinHost.trim() || isJoining) && styles.joinBtnDisabled]}
              onPress={() => void handleJoin()}
              disabled={!joinHost.trim() || isJoining}
              activeOpacity={0.85}
            >
              <View style={[styles.joinBtnGradient, { backgroundColor: themeColors.primary }]}>
                {isJoining ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.joinBtnText}>Join</Text>
                )}
              </View>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Session code (optional)"
            placeholderTextColor={themeColors.textMuted}
            value={joinCode}
            onChangeText={setJoinCode}
            autoCorrect={false}
            autoCapitalize="characters"
            maxLength={9}
          />

          <TouchableOpacity style={{ paddingVertical: 10, alignItems: 'center' }} onPress={() => setShowQRScanner(true)}>
            <Text style={{ color: themeColors.primary, fontWeight: 'bold' }}>
              <Feather name="camera" size={16} /> Scan QR Code
            </Text>
          </TouchableOpacity>

          {/* Discovered sessions */}
          <View style={styles.discoverSection}>
            <View style={styles.discoverHeader}>
              <Text style={styles.discoverTitle}>Discovered on LAN</Text>
              {discoveredSessions.length > 0 && (
                <TouchableOpacity onPress={clearDiscoveredSessions}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            {discoveredSessions.length === 0 ? (
              <View style={styles.emptyDiscover}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ActivityIndicator color="rgba(213,226,244,0.5)" size="small" />
                  <Text style={styles.emptyDiscoverText}>Scanning for sessions…</Text>
                </View>
              </View>
            ) : (
              discoveredSessions.map((session) => (
                <TouchableOpacity
                  key={`${session.sessionCode}-${session.hostAddress}`}
                  style={styles.discoveredCard}
                  onPress={() => {
                    setJoinHost(session.hostAddress)
                    setJoinCode(session.sessionCode)
                    void handleJoin(session.hostAddress, session.sessionCode)
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.discoveredInfo}>
                    <Text style={styles.discoveredCode}>{session.sessionCode}</Text>
                    <Text style={styles.discoveredMeta}>
                      {session.hostAddress}:{session.port}
                    </Text>
                  </View>
                  <View style={styles.discoveredActions}>
                    <StatusChip
                      label={session.source.toUpperCase()}
                      tone={session.source === 'mdns' ? 'good' : 'blue'}
                    />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={styles.connectText}>Connect</Text>
                      <Feather name="arrow-right" size={14} color={themeColors.primary} />
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </SectionCard>


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
    paddingBottom: 24,
    gap: 4,
  },

  // Session Header
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sessionTitle: {
    color: theme.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  sessionSubtitle: {
    color: theme.textSecondary,
    fontSize: 13,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: theme.cardBorder,
  },



  // Error
  errorBox: {
    backgroundColor: theme.dangerDim,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.dangerDim,
  },
  errorText: {
    color: theme.danger,
    fontSize: 13,
  },
  infoBox: {
    backgroundColor: theme.surfaceSubtle,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
  },

  // Hero button (Start Hosting)
  heroBtnContainer: {
    borderRadius: 16,
    shadowColor: theme.primary,
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 8,
  },
  heroBtnGradient: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  heroBtnDisabled: {
    opacity: 0.6,
  },
  heroBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },



  // Join section
  hint: {
    color: theme.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputFlex: {
    flex: 1,
  },
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
  joinBtnContainer: {
    borderRadius: 14,
    shadowColor: theme.accent,
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
    justifyContent: 'center',
  },
  joinBtnGradient: {
    borderRadius: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  joinBtnDisabled: {
    opacity: 0.4,
  },
  joinBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },

  // Discovery
  discoverSection: {
    gap: 10,
  },
  discoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  discoverTitle: {
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  clearText: {
    color: theme.textMuted,
    fontSize: 12,
  },
  emptyDiscover: {
    backgroundColor: theme.cardBorder,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.border,
    padding: 16,
    alignItems: 'center',
  },
  emptyDiscoverText: {
    color: theme.textSecondary,
    fontSize: 13,
  },
  discoveredCard: {
    borderRadius: 14,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  discoveredInfo: {
    gap: 3,
  },
  discoveredCode: {
    color: theme.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  discoveredMeta: {
    color: theme.textSecondary,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  discoveredActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  connectText: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: '700',
  },


})
