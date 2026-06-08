import { StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import * as Clipboard from 'expo-clipboard'
import { useState } from 'react'

type Props = {
  code: string
  showQR?: boolean
}

export default function SessionCodeDisplay({ code, showQR = false }: Props) {
  const [copied, setCopied] = useState(false)

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
        <Text style={styles.code}>{code}</Text>
        <Text style={styles.copyHint}>{copied ? '✓ Copied!' : 'tap to copy'}</Text>
      </View>

      {/* QR Code */}
      {showQR && (
        <View style={styles.qrWrap}>
          <QRCode
            value={`hivebeats://join/${code}`}
            size={100}
            backgroundColor="transparent"
            color="#f7fbff"
          />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  codeWrap: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: 'rgba(12, 22, 40, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.35)',
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#ff6b35',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 4,
  },
  code: {
    fontFamily: 'monospace',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 6,
    color: '#ff8c5a',
  },
  copyHint: {
    marginTop: 6,
    fontSize: 11,
    color: 'rgba(213, 226, 244, 0.45)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  qrWrap: {
    padding: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(122, 173, 255, 0.18)',
  },
})
