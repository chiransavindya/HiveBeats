import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useMemo } from 'react'
import type { GuestDevice } from '../types/session'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'

type Props = {
  guest: GuestDevice
  onRemove?: () => void
}

export default function GuestRow({ guest, onRemove }: Props) {
  const initial = guest.alias.slice(0, 1).toUpperCase()
  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])

  return (
    <View style={styles.row}>
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.name}>{guest.alias}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, guest.isActive ? styles.dotActive : styles.dotInactive]} />
          <Text style={styles.status}>{guest.isActive ? 'Connected' : 'Inactive'}</Text>
        </View>
      </View>

      {/* Remove */}
      {onRemove && (
        <TouchableOpacity style={styles.removeBtn} onPress={onRemove} activeOpacity={0.75}>
          <Text style={styles.removeTxt}>Remove</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    backgroundColor: theme.card,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: theme.accent,
    fontWeight: '800',
    fontSize: 15,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: theme.success,
  },
  dotInactive: {
    backgroundColor: theme.border,
  },
  status: {
    color: theme.textSecondary,
    fontSize: 12,
  },
  removeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: theme.dangerDim,
    borderWidth: 1,
    borderColor: theme.dangerDim,
  },
  removeTxt: {
    color: theme.danger,
    fontSize: 12,
    fontWeight: '700',
  },
})
