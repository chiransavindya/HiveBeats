import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useMemo } from 'react'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'

type Props = {
  visible: boolean
  title: string
  message: string
  cancelText?: string
  confirmText?: string
  onCancel: () => void
  onConfirm: () => void
  isDestructive?: boolean
}

export default function ConfirmModal({
  visible,
  title,
  message,
  cancelText = 'Cancel',
  confirmText = 'Confirm',
  onCancel,
  onConfirm,
  isDestructive = false,
}: Props) {
  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, isDestructive && styles.confirmBtnDestructive]}
              onPress={() => {
                onCancel()
                onConfirm()
              }}
            >
              <Text style={[styles.confirmText, isDestructive && styles.confirmTextDestructive]}>
                {confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: theme.background,
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    color: theme.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  message: {
    color: theme.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  cancelText: {
    color: theme.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: theme.primary,
  },
  confirmBtnDestructive: {
    backgroundColor: theme.danger,
  },
  confirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  confirmTextDestructive: {
    color: '#fff',
  },
})
