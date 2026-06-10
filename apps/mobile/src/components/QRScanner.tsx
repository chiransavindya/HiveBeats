import React, { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'

interface QRScannerProps {
  onScan: (ip: string, port: number, code: string) => void
  onCancel: () => void
}

export function QRScanner({ onScan, onCancel }: QRScannerProps) {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)

  if (!permission) {
    return <View />
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need your permission to show the camera</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.text}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonCancel} onPress={onCancel}>
          <Text style={styles.text}>Cancel</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned) return
    // hivebeats://192.168.1.5:7400?code=1234
    if (data.startsWith('hivebeats://')) {
      try {
        const withoutScheme = data.replace('hivebeats://', '')
        const [hostPort, query] = withoutScheme.split('?')
        const [ip, portStr] = hostPort.split(':')
        const port = portStr ? parseInt(portStr, 10) : 7400
        let code = ''
        if (query) {
          const match = query.match(/code=([^&]*)/)
          if (match) code = match[1]
        }
        setScanned(true)
        onScan(ip, port, code)
      } catch (e) {
        // ignore invalid
      }
    }
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
      />
      <View style={styles.overlay}>
        <Text style={styles.scanText}>Scan the QR Code on your Desktop</Text>
        <TouchableOpacity style={styles.buttonCancel} onPress={onCancel}>
          <Text style={styles.text}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  message: {
    textAlign: 'center',
    color: '#fff',
    paddingBottom: 10,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 40,
  },
  scanText: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 40,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 10,
    borderRadius: 8,
  },
  button: {
    backgroundColor: '#3b82f6',
    padding: 14,
    borderRadius: 8,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  buttonCancel: {
    backgroundColor: '#ef4444',
    padding: 14,
    borderRadius: 8,
    marginHorizontal: 20,
  },
  text: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
})
