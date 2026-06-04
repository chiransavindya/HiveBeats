import { app, BrowserWindow, dialog, ipcMain, protocol, nativeTheme } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Service } from 'bonjour-service'
import { advertiseSession, destroyBonjour, startDiscovery } from './mdns'
import { startFileStream, type StreamController } from './streamer'
import {
  broadcastToGuests,
  connectToHost,
  disconnectFromHost,
  sendToGuest,
  sendToHost,
  startHost,
  stopHost,
} from './socket'
import { startBroadcast, startListener, stopBroadcast, stopListener } from './udp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'hivebeats',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let advertisedService: Service | null = null
let stopDiscovery: (() => void) | null = null
let stopUdpListener: (() => void) | null = null
let activeStream: StreamController | null = null
let activeStreamTrackId: string | null = null
const clientStreams = new Map<string, StreamController>()

function stopClientStream(clientId: string) {
  clientStreams.get(clientId)?.stop()
  clientStreams.delete(clientId)
}

function streamTrackToGuest(payload: {
  clientId: string
  filePath: string
  fileName: string
  mimeType: string
  trackId: string
}) {
  stopClientStream(payload.clientId)

  sendToGuest(
    payload.clientId,
    JSON.stringify({
      type: 'STREAM_INIT',
      trackId: payload.trackId,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
    }),
  )

  const stream = startFileStream(payload.filePath, 64 * 1024, {
    onChunk: (chunk, seq) => {
      sendToGuest(
        payload.clientId,
        JSON.stringify({
          type: 'STREAM_CHUNK',
          trackId: payload.trackId,
          seq,
          data: chunk.toString('base64'),
        }),
      )
    },
    onEnd: () => {
      sendToGuest(
        payload.clientId,
        JSON.stringify({
          type: 'STREAM_END',
          trackId: payload.trackId,
        }),
      )
      clientStreams.delete(payload.clientId)
    },
    onError: (error) => {
      sendToGuest(
        payload.clientId,
        JSON.stringify({
          type: 'STREAM_END',
          trackId: payload.trackId,
          error: error.message,
        }),
      )
      clientStreams.delete(payload.clientId)
    },
  })

  clientStreams.set(payload.clientId, stream)
}

function createWindow() {
  const publicDir = process.env.VITE_PUBLIC ?? RENDERER_DIST

  win = new BrowserWindow({
    icon: path.join(publicDir, 'electron-vite.svg'),
    autoHideMenuBar: true,
    title: 'HiveBeats',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
      symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#000000',
      height: 58,
    },
  })
  
  win.setMenuBarVisibility(false)

  // Update titleBarOverlay when theme changes
  nativeTheme.on('updated', () => {
    if (win) {
      win.setTitleBarOverlay({
        color: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
        symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#000000',
      })
    }
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
  
  win.maximize()
}

ipcMain.handle('theme:set', (_event, theme: 'system' | 'light' | 'dark') => {
  nativeTheme.themeSource = theme
})

ipcMain.handle('mdns:advertise', (_event, payload: { sessionCode: string; port: number }) => {
  advertisedService?.stop?.()
  advertisedService = advertiseSession(payload.sessionCode, payload.port)
  return { ok: true }
})

ipcMain.handle('mdns:stop-advertise', () => {
  advertisedService?.stop?.()
  advertisedService = null
  return { ok: true }
})

ipcMain.handle('mdns:start-discovery', (event) => {
  stopDiscovery?.()
  const sender = event.sender
  stopDiscovery = startDiscovery(
    (service) => sender.send('mdns:service-up', service),
    (service) => sender.send('mdns:service-down', service),
  )
  return { ok: true }
})

ipcMain.handle('mdns:stop-discovery', () => {
  stopDiscovery?.()
  stopDiscovery = null
  return { ok: true }
})

ipcMain.handle('socket:start-host', (event, payload: { port: number }) => {
  startHost(payload.port, {
    onClientConnected: (client) => {
      event.sender.send('socket:status', {
        role: 'host',
        status: 'client-connected',
        clientId: client.id,
        address: client.address,
      })
    },
    onClientDisconnected: (client) => {
      stopClientStream(client.id)
      event.sender.send('socket:status', {
        role: 'host',
        status: 'client-disconnected',
        clientId: client.id,
      })
    },
    onClientMessage: (client, data) => {
      event.sender.send('socket:message', {
        role: 'host',
        clientId: client.id,
        message: safeParseJson(data),
      })
    },
    onHostError: (error) => {
      event.sender.send('socket:status', {
        role: 'host',
        status: 'error',
        message: error.message,
      })
    },
  })

  event.sender.send('socket:status', { role: 'host', status: 'started' })
  return { ok: true }
})

ipcMain.handle('socket:stop-host', (event) => {
  stopHost()
  event.sender.send('socket:status', { role: 'host', status: 'stopped' })
  return { ok: true }
})

ipcMain.handle('socket:connect', (event, payload: { host: string; port: number }) => {
  connectToHost(payload.host, payload.port, {
    onConnected: () => {
      event.sender.send('socket:status', { role: 'guest', status: 'connected' })
    },
    onDisconnected: () => {
      event.sender.send('socket:status', { role: 'guest', status: 'disconnected' })
    },
    onMessage: (data) => {
      event.sender.send('socket:message', {
        role: 'guest',
        message: safeParseJson(data),
      })
    },
    onError: (error) => {
      event.sender.send('socket:status', {
        role: 'guest',
        status: 'error',
        message: error.message,
      })
    },
  })

  return { ok: true }
})

ipcMain.handle('socket:disconnect', () => {
  disconnectFromHost()
  return { ok: true }
})

ipcMain.handle('socket:send-to-host', (_event, payload: { message: string }) => {
  const ok = sendToHost(payload.message)
  return { ok }
})

ipcMain.handle('socket:send-to-guest', (_event, payload: { clientId: string; message: string }) => {
  const ok = sendToGuest(payload.clientId, payload.message)
  return { ok }
})

ipcMain.handle('socket:broadcast', (_event, payload: { message: string }) => {
  broadcastToGuests(payload.message)
  return { ok: true }
})

ipcMain.handle('dialog:pick-audio', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }

  const filePath = result.filePaths[0]
  return {
    canceled: false,
    filePath,
    fileName: path.basename(filePath),
    mimeType: getMimeType(filePath),
  }
})

ipcMain.handle('stream:start', (_event, payload: { filePath: string; fileName: string; mimeType: string; trackId: string }) => {
  activeStream?.stop()
  activeStreamTrackId = payload.trackId

  // Stop any per-guest streams before starting the broadcast stream.
  // Both streams write to the same WebSocket connection for each guest;
  // running them concurrently interleaves chunks and corrupts the MediaSource buffer.
  clientStreams.forEach((stream) => stream.stop())
  clientStreams.clear()

  broadcastToGuests(
    JSON.stringify({
      type: 'STREAM_INIT',
      trackId: payload.trackId,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
    }),
  )

  activeStream = startFileStream(payload.filePath, 64 * 1024, {
    onChunk: (chunk, seq) => {
      broadcastToGuests(
        JSON.stringify({
          type: 'STREAM_CHUNK',
          trackId: payload.trackId,
          seq,
          data: chunk.toString('base64'),
        }),
      )
    },
    onEnd: () => {
      broadcastToGuests(
        JSON.stringify({
          type: 'STREAM_END',
          trackId: payload.trackId,
        }),
      )
    },
    onError: (error) => {
      broadcastToGuests(
        JSON.stringify({
          type: 'STREAM_END',
          trackId: payload.trackId,
          error: error.message,
        }),
      )
    },
  })

  return { ok: true }
})

ipcMain.handle(
  'stream:start-for-guest',
  (_event, payload: { clientId: string; filePath: string; fileName: string; mimeType: string; trackId: string }) => {
    streamTrackToGuest(payload)
    return { ok: true }
  },
)

ipcMain.handle('stream:stop', () => {
  activeStream?.stop()
  activeStream = null
  clientStreams.forEach((stream) => stream.stop())
  clientStreams.clear()
  if (activeStreamTrackId) {
    broadcastToGuests(
      JSON.stringify({
        type: 'STREAM_END',
        trackId: activeStreamTrackId,
      }),
    )
  }
  activeStreamTrackId = null
  return { ok: true }
})

ipcMain.handle(
  'udp:start-broadcast',
  (_event, payload: {
    sessionCode: string
    hostPort: number
    broadcastPort: number
    intervalMs: number
    deviceId: string
  }) => {
    startBroadcast(
      payload.sessionCode,
      payload.hostPort,
      payload.broadcastPort,
      payload.intervalMs,
      payload.deviceId,
    )
    return { ok: true }
  },
)

ipcMain.handle('udp:stop-broadcast', () => {
  stopBroadcast()
  return { ok: true }
})

ipcMain.handle('udp:start-listen', (event, payload: { broadcastPort: number; deviceId: string }) => {
  stopUdpListener?.()
  startListener(
    payload.broadcastPort,
    payload.deviceId,
    (announcement) => event.sender.send('udp:announcement', announcement),
    (error) => event.sender.send('udp:error', { message: error.message }),
  )
  stopUdpListener = () => stopListener()
  return { ok: true }
})

ipcMain.handle('udp:stop-listen', () => {
  stopUdpListener?.()
  stopUdpListener = null
  return { ok: true }
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    advertisedService?.stop?.()
    stopDiscovery?.()
    stopBroadcast()
    stopUdpListener?.()
    destroyBonjour()
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  protocol.registerFileProtocol('hivebeats', (request, callback) => {
    try {
      const url = new URL(request.url)
      let filePath = decodeURIComponent(url.pathname)
      const windowsPathMatch = filePath.match(/^\/([A-Za-z]:)/)
      if (windowsPathMatch) {
        filePath = filePath.slice(1)
      }
      callback({ path: filePath })
    } catch {
      callback({ error: -6 })
    }
  })

  createWindow()
})

function safeParseJson(data: string) {
  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}

function getMimeType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.mp3':
      return 'audio/mpeg'
    case '.wav':
      return 'audio/wav'
    case '.m4a':
      return 'audio/mp4'
    case '.aac':
      return 'audio/aac'
    case '.flac':
      return 'audio/flac'
    case '.ogg':
      return 'audio/ogg'
    default:
      return 'audio/mpeg'
  }
}
