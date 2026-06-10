import { StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import * as Clipboard from 'expo-clipboard'
import { useState, useMemo } from 'react'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'

type Props = {
  code: string
  showQR?: boolean
}

export default function SessionCodeDisplay({ code, showQR = false }: Props) {
  const [copied, setCopied] = useState(false)
  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <View style={styles.container}>
      {/* Code display */}
      <View style={styles.codeWrap} onTouchEnd={() => void handleCopy()}>
        <Text style={styles.code} numberOfLines={1} adjustsFontSizeToFit>
          {code}
        </Text>
        <Text style={styles.copyHint}>{copied ? '✓ Copied!' : 'tap to copy'}</Text>
      </View>

      {/* QR Code */}
      {showQR && (
        <View style={styles.qrWrap}>
          <QRCode
            value={`hivebeats://join/${code}`}
            size={100}
            backgroundColor="transparent"
            color={themeColors.textPrimary}
          />
        </View>
      )}
    </View>
  )
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  codeWrap: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  code: {
    fontFamily: 'monospace',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 3,
    color: theme.primary,
  },
  copyHint: {
    marginTop: 6,
    fontSize: 11,
    color: theme.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  qrWrap: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
})
