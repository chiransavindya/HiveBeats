import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { GuestDevice } from '../types/session'

type Props = {
  guest: GuestDevice
  onRemove?: () => void
}

export default function GuestRow({ guest, onRemove }: Props) {
  const initial = guest.alias.slice(0, 1).toUpperCase()

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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(78, 140, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: '#f7fbff',
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
    backgroundColor: '#2fb87d',
  },
  dotInactive: {
    backgroundColor: 'rgba(213, 226, 244, 0.35)',
  },
  status: {
    color: 'rgba(213, 226, 244, 0.6)',
    fontSize: 12,
  },
  removeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.2)',
  },
  removeTxt: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '700',
  },
})
