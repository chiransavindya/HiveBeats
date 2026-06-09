import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native'
import { useMemo } from 'react'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'
import { useSessionStore } from '../store/sessionStore'
import SectionCard from '../components/SectionCard'
import AppHeader from '../components/AppHeader'
import StatusChip from '../components/StatusChip'

export default function NetworkScreen() {
  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])

  const {
    connected,
    connectionLabel,
    hostAddress,
    hostPortInput,
    joinPortInput,
    broadcastPortInput,
    mdnsEnabled,
    udpEnabled,
    retryEnabled,
    logs,
    setHostPortInput,
    setJoinPortInput,
    setBroadcastPortInput,
    setMdnsEnabled,
    setUdpEnabled,
    setRetryEnabled,
    pushLog,
  } = useSessionStore()

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader title="Network" />

      {/* ── Network status ──────────────────────────────────────────────── */}
      <SectionCard title="Network Status">
        <View style={styles.statusRow}>
          <StatusChip
            label={connected ? '● Connected' : '○ No Network'}
            tone={connected ? 'good' : 'error'}
          />
          <Text style={styles.networkLabel}>{connectionLabel}</Text>
        </View>

        {connected && (
          <View style={styles.infoGrid}>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Your IP</Text>
              <Text style={styles.infoValue}>{hostAddress}</Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Host Port</Text>
              <Text style={styles.infoValue}>{hostPortInput}</Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Broadcast</Text>
              <Text style={styles.infoValue}>{broadcastPortInput}</Text>
            </View>
          </View>
        )}
      </SectionCard>

      {/* ── Port settings ───────────────────────────────────────────────── */}
      <SectionCard title="Network Settings">
        <Text style={styles.hint}>
          Tip: keep mDNS + UDP enabled for best LAN discovery. All devices must use the same host port.
        </Text>

        {/* Port inputs */}
        <View style={styles.portGrid}>
          {[
            { label: 'Host Port', value: hostPortInput },
            { label: 'Join Port', value: joinPortInput },
            { label: 'UDP Broadcast', value: broadcastPortInput },
          ].map(({ label, value }, i, arr) => (
            <View key={label} style={[styles.portRow, i !== arr.length - 1 && styles.portRowBorder]}>
              <Text style={styles.portLabel}>{label}</Text>
              <Text style={styles.portInput}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Toggle switches */}
        <View style={styles.toggleList}>
          {[
            { label: 'mDNS discovery', description: 'Auto-discover sessions via Bonjour/mDNS', value: mdnsEnabled, onChange: setMdnsEnabled },
            { label: 'UDP fallback', description: 'Discover sessions via UDP broadcast', value: udpEnabled, onChange: setUdpEnabled },
            { label: 'Auto-retry', description: 'Automatically retry failed connections', value: retryEnabled, onChange: setRetryEnabled },
          ].map(({ label, description, value, onChange }, i, arr) => (
            <View key={label} style={[styles.toggleRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>{label}</Text>
                <Text style={styles.toggleDesc}>{description}</Text>
              </View>
              <Switch
                value={value}
                onValueChange={onChange}
                trackColor={{ false: themeColors.cardBorder, true: themeColors.primaryDim }}
                thumbColor={value ? themeColors.primary : '#888'}
              />
            </View>
          ))}
        </View>
      </SectionCard>

      {/* ── Activity log ────────────────────────────────────────────────── */}
      <SectionCard
        title={`Activity Log (${logs.length})`}
        rightSlot={
          logs.length > 0 ? (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => {
                useSessionStore.setState({ logs: [] })
              }}
            >
              <Text style={styles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
          ) : undefined
        }
      >
        {logs.length === 0 ? (
          <View style={styles.emptyLog}>
            <Text style={styles.emptyLogText}>No activity yet.</Text>
          </View>
        ) : (
          logs.map((entry) => (
            <View key={entry.id} style={styles.logEntry}>
              <Text style={styles.logTime}>
                {new Date(entry.createdAt).toLocaleTimeString()}
              </Text>
              <Text style={styles.logMessage}>{entry.message}</Text>
            </View>
          ))
        )}
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

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  networkLabel: {
    color: theme.textSecondary,
    fontSize: 13,
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  infoCard: {
    flex: 1,
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 12,
    gap: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  infoLabel: {
    color: theme.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  infoValue: {
    color: theme.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'monospace',
  },

  hint: {
    color: theme.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },

  portGrid: {
    backgroundColor: theme.cardBorder,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
    marginTop: 8,
  },
  portRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  portRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  portLabel: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  portInput: {
    color: theme.textSecondary,
    fontSize: 15,
    fontFamily: 'monospace',
    fontWeight: '700',
  },

  toggleList: {
    backgroundColor: theme.cardBorder,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
    marginTop: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  toggleInfo: { flex: 1, gap: 2, marginRight: 12 },
  toggleLabel: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  toggleDesc: {
    color: theme.textSecondary,
    fontSize: 12,
  },

  clearBtn: {
    backgroundColor: theme.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearBtnText: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },

  emptyLog: {
    padding: 10,
    alignItems: 'center',
  },
  emptyLogText: {
    color: theme.textMuted,
    fontSize: 13,
  },
  logEntry: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 10,
    backgroundColor: theme.card,
    padding: 10,
    alignItems: 'flex-start',
  },
  logTime: {
    color: theme.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
    flexShrink: 0,
  },
  logMessage: {
    color: theme.textPrimary,
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
})
